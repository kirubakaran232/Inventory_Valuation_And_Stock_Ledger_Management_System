import { D, sum, Money } from './money.js';
import { receiveFIFO, issueFIFO } from './fifo.js';
import { receiveWAC, issueWAC } from './weightedAverage.js';
import { requireCondition as check } from './errors.js';
import { dueExpiryDates } from './expiry.js';

// Physical FEFO batches and financial cost pools are deliberately independent.
export function replay(
  transactions,
  method = 'FIFO',
  cutoff = '9999-12-31T23:59:59.999Z',
  itemMethods = {},
) {
  check(['FIFO', 'WAC', 'ITEM'].includes(method), 'INVALID_METHOD', 'Unknown valuation method');
  const pools = new Map(),
    sales = new Map(),
    jobs = new Map(),
    rows = [],
    expiryCounts = new Map();
  let cogs = D(0),
    losses = D(0);
  const receiveCost = (pool, quantity, value) =>
    (pool.method === 'FIFO' ? receiveFIFO : receiveWAC)(pool, quantity, value);
  const issueCost = (pool, quantity) =>
    (pool.method === 'FIFO' ? issueFIFO : issueWAC)(pool, quantity);
  const poolFor = (itemId, warehouseId) => {
    const key = `${itemId}/${warehouseId}`;
    if (!pools.has(key))
      pools.set(key, {
        itemId,
        warehouseId,
        method: method === 'ITEM' ? itemMethods[itemId] || 'FIFO' : method,
        layers: [],
        physical: [],
        quantity: D(0),
        value: D(0),
      });
    return pools.get(key);
  };
  const add = (pool, parts) => {
    for (const part of parts) {
      pool.physical.push({
        batchId: part.batchId,
        expiryDate: part.expiryDate,
        quantity: D(part.quantity),
      });
      receiveCost(pool, part.quantity, part.value);
    }
  };
  const take = (pool, quantity, batchId) => {
    let left = D(quantity);
    const eligible = pool.physical
      .filter((p) => !batchId || p.batchId === batchId)
      .sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
    check(
      sum(eligible.map((p) => p.quantity)).gte(left),
      'INSUFFICIENT_STOCK',
      'Insufficient stock',
      { itemId: pool.itemId, warehouseId: pool.warehouseId, batchId },
    );
    const physical = [];
    for (const p of eligible) {
      if (left.isZero()) break;
      const q = Money.min(p.quantity, left);
      physical.push({ batchId: p.batchId, expiryDate: p.expiryDate, quantity: q });
      p.quantity = p.quantity.minus(q);
      left = left.minus(q);
    }
    pool.physical = pool.physical.filter((p) => p.quantity.gt(0));
    const costs = issueCost(pool, quantity);
    // Zip physical and cost allocations so partial returns restore both exactly.
    const parts = [];
    let index = 0;
    for (const p of physical) {
      let remaining = p.quantity;
      while (remaining.gt(0)) {
        const cost = costs[index],
          q = Money.min(remaining, cost.quantity);
        const value = q.eq(cost.quantity) ? cost.value : cost.value.mul(q).div(cost.quantity);
        parts.push({ ...p, quantity: q, value });
        remaining = remaining.minus(q);
        cost.quantity = cost.quantity.minus(q);
        cost.value = cost.value.minus(value);
        if (cost.quantity.isZero()) index++;
      }
    }
    return parts;
  };
  const serialize = (parts) =>
    parts.map((p) => ({ ...p, quantity: p.quantity.toString(), value: p.value.toString() }));
  const expire = (time) => {
    const dates = dueExpiryDates(pools, time);
    for (const date of dates)
      for (const pool of pools.values()) {
        const batches = [
          ...new Set(pool.physical.filter((b) => b.expiryDate === date).map((b) => b.batchId)),
        ];
        for (const batchId of batches) {
          const quantity = sum(
            pool.physical.filter((b) => b.batchId === batchId).map((b) => b.quantity),
          );
          const parts = take(pool, quantity, batchId),
            value = sum(parts.map((p) => p.value));
          losses = losses.plus(value);
          const key = `expiry:${date}:${pool.itemId}:${pool.warehouseId}:${batchId}`;
          const occurrence = (expiryCounts.get(key) || 0) + 1;
          expiryCounts.set(key, occurrence);
          rows.push({
            id: `${key}:${occurrence}`,
            effectiveAt: `${date}T00:00:00.000Z`,
            type: 'EXPIRY',
            itemId: pool.itemId,
            warehouseId: pool.warehouseId,
            quantity: quantity.neg().toString(),
            value: value.toString(),
            inventoryDelta: value.neg().toString(),
            allocations: serialize(parts),
          });
        }
      }
  };
  const ordered = transactions
    .filter((t) => t.effectiveAt <= cutoff)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.sequence - b.sequence);
  for (const tx of ordered) {
    expire(tx.effectiveAt);
    for (const line of tx.lines) {
      const pool = poolFor(line.itemId, line.warehouseId);
      let parts = [],
        value = D(0),
        sign = 1;
      if (tx.type === 'RECEIPT' || tx.type === 'FINISHED_GOODS') {
        check(
          !line.expiryDate || `${line.expiryDate}T00:00:00.000Z` > tx.effectiveAt,
          'EXPIRED_RECEIPT',
          'Receipt must precede expiry',
        );
        if (tx.type === 'RECEIPT') value = D(line.quantity).mul(line.unitCost);
        else {
          const job = jobs.get(tx.productionJobId);
          check(
            job && !job.closed,
            'INVALID_JOB',
            'Finished goods require an open job with material issues',
          );
          value = job.value;
          job.closed = true;
        }
        parts = [
          { batchId: line.batchId, expiryDate: line.expiryDate, quantity: D(line.quantity), value },
        ];
        add(pool, parts);
      } else if (tx.type === 'RETURN') {
        const sale = sales.get(`${tx.referenceTransactionId}/${line.originalSaleLineId}`);
        check(
          sale && sale.itemId === line.itemId,
          'INVALID_RETURN',
          'Return requires an earlier sale of the same item',
        );
        const eligible = sale.parts.filter((p) => !line.batchId || p.batchId === line.batchId);
        check(
          sum(eligible.map((p) => p.quantity)).gte(line.quantity),
          'EXCESS_RETURN',
          'Return exceeds unreturned sale quantity',
        );
        let left = D(line.quantity);
        for (const p of eligible) {
          if (left.isZero()) break;
          if (p.quantity.isZero()) continue;
          const q = Money.min(left, p.quantity),
            cost = q.eq(p.quantity) ? p.value : p.value.mul(q).div(p.quantity);
          parts.push({ ...p, quantity: q, value: cost });
          p.quantity = p.quantity.minus(q);
          p.value = p.value.minus(cost);
          left = left.minus(q);
        }
        value = sum(parts.map((p) => p.value));
        cogs = cogs.minus(value);
        add(pool, parts);
      } else {
        sign = -1;
        parts = take(pool, line.quantity, line.batchId);
        value = sum(parts.map((p) => p.value));
        if (tx.type === 'SALE') {
          cogs = cogs.plus(value);
          sales.set(`${tx._id}/${line._id}`, {
            itemId: line.itemId,
            parts: parts.map((p) => ({ ...p })),
          });
        } else if (tx.type === 'WRITE_OFF') losses = losses.plus(value);
        else if (tx.type === 'TRANSFER') {
          check(
            line.destinationWarehouseId !== line.warehouseId,
            'INVALID_TRANSFER',
            'Choose a different destination',
          );
          add(poolFor(line.itemId, line.destinationWarehouseId), parts);
          rows.push({
            id: `${tx._id}/${line._id}/in`,
            transactionId: tx._id,
            lineId: line._id,
            effectiveAt: tx.effectiveAt,
            type: 'TRANSFER_IN',
            itemId: line.itemId,
            warehouseId: line.destinationWarehouseId,
            quantity: line.quantity,
            value: value.toString(),
            inventoryDelta: value.toString(),
            allocations: serialize(parts),
          });
        } else if (tx.type === 'PRODUCTION_ISSUE') {
          const job = jobs.get(tx.productionJobId) || { value: D(0), closed: false };
          check(!job.closed, 'CLOSED_JOB', 'Production job is already closed');
          job.value = job.value.plus(value);
          jobs.set(tx.productionJobId, job);
        } else check(false, 'INVALID_TYPE', 'Unknown transaction type');
      }
      rows.push({
        id: `${tx._id}/${line._id}`,
        transactionId: tx._id,
        lineId: line._id,
        effectiveAt: tx.effectiveAt,
        type: tx.type,
        itemId: line.itemId,
        warehouseId: line.warehouseId,
        quantity: D(line.quantity).mul(sign).toString(),
        value: value.toString(),
        inventoryDelta: value.mul(sign).toString(),
        allocations: serialize(parts),
      });
    }
    // Returned expired goods are written off at the return time, not in the past.
    const before = rows.length;
    expire(tx.effectiveAt);
    for (const row of rows.slice(before)) row.effectiveAt = tx.effectiveAt;
  }
  expire(cutoff);
  const balances = [...pools.values()].map((p) => ({
    itemId: p.itemId,
    warehouseId: p.warehouseId,
    quantity: sum(p.physical.map((b) => b.quantity)).toString(),
    valuationMethod: p.method,
    value: (p.method === 'FIFO' ? sum(p.layers.map((l) => l.value)) : p.value).toString(),
    batches: p.physical.map((b) => ({ ...b, quantity: b.quantity.toString() })),
  }));
  return {
    method,
    balances,
    rows,
    cogs: cogs.toString(),
    writeOffs: losses.toString(),
    closingValue: sum(balances.map((b) => b.value)).toString(),
    workInProgress: sum([...jobs.values()].filter((j) => !j.closed).map((j) => j.value)).toString(),
    jobs: [...jobs].map(([id, j]) => ({
      _id: id,
      status: j.closed ? 'CLOSED' : 'IN_PROGRESS',
      value: j.value.toString(),
    })),
  };
}
