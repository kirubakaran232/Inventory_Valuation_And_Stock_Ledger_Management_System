import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../src/domain/replay.js';
import { transaction } from '../src/validation/schemas.js';
import { D } from '../src/domain/money.js';
const uuid = () => crypto.randomUUID();
const itemId = uuid(),
  warehouseId = uuid(),
  destinationWarehouseId = uuid();
let sequence = 0;
const event = (type, quantity, extra = {}, lineExtra = {}) => ({
  _id: uuid(),
  requestId: uuid(),
  effectiveAt: '2026-01-01T12:00:00.000Z',
  sequence: ++sequence,
  type,
  lines: [{ _id: uuid(), itemId, warehouseId, quantity: String(quantity), ...lineExtra }],
  ...extra,
});
const receipt = (q, c, extra = {}, lineExtra = {}) =>
  event('RECEIPT', q, extra, { unitCost: String(c), ...lineExtra });
const money = (actual, expected) => assert.ok(D(actual).eq(expected), `${actual} != ${expected}`);
test('known FIFO and WAC example', () => {
  const events = [receipt(10, 10), receipt(10, 20), event('SALE', 12)];
  money(replay(events).cogs, 140);
  money(replay(events).closingValue, 160);
  money(replay(events, 'WAC').cogs, 180);
  money(replay(events, 'WAC').closingValue, 120);
});
test('backdated receipt changes downstream costs', () => {
  const events = [
    receipt(10, 20, { effectiveAt: '2026-01-02T12:00:00.000Z' }),
    event('SALE', 10, { effectiveAt: '2026-01-03T12:00:00.000Z' }),
    receipt(10, 10),
  ];
  money(replay(events).cogs, 100);
});
test('reject negative stock even if later receipts cover it', () =>
  assert.throws(() => replay([event('SALE', 1), receipt(2, 10)]), { code: 'INSUFFICIENT_STOCK' }));
test('physical FEFO is independent of FIFO cost', () => {
  const old = uuid(),
    soon = uuid();
  const events = [
    receipt(10, 10, {}, { batchId: old, expiryDate: '2026-03-01' }),
    receipt(10, 20, {}, { batchId: soon, expiryDate: '2026-02-01' }),
    event('SALE', 5),
  ];
  const r = replay(events, 'FIFO', '2026-01-31T23:59:59.999Z');
  money(r.cogs, 50);
  assert.equal(r.rows.at(-1).allocations[0].batchId, soon);
});
test('expiry uses cost method rather than original physical batch cost', () => {
  const events = [
    receipt(10, 10, {}, { batchId: uuid(), expiryDate: '2026-03-01' }),
    receipt(10, 20, {}, { batchId: uuid(), expiryDate: '2026-02-01' }),
  ];
  money(replay(events, 'FIFO', '2026-02-01T00:00:00.000Z').writeOffs, 100);
  money(replay(events, 'WAC', '2026-02-01T00:00:00.000Z').writeOffs, 150);
  assert.equal(
    replay(events, 'FIFO', '2026-02-05T00:00:00.000Z').rows.at(-1).effectiveAt,
    '2026-02-01T00:00:00.000Z',
  );
});
test('transfer preserves total value', () => {
  for (const method of ['FIFO', 'WAC']) {
    const events = [
      receipt(10, 10),
      receipt(10, 30, {}, { warehouseId: destinationWarehouseId }),
      event('TRANSFER', 5, {}, { destinationWarehouseId }),
    ];
    money(replay(events, method).closingValue, 400);
    money(replay(events, method).cogs, 0);
  }
});
test('returns reverse original allocation and reject excess', () => {
  const sale = event('SALE', 8),
    ret = event(
      'RETURN',
      3,
      { referenceTransactionId: sale._id },
      { originalSaleLineId: sale.lines[0]._id },
    );
  const events = [receipt(10, 12, { effectiveAt: '2025-12-31T12:00:00.000Z' }), sale, ret];
  money(replay(events).cogs, 60);
  assert.throws(
    () =>
      replay([
        ...events,
        event(
          'RETURN',
          6,
          { referenceTransactionId: sale._id },
          { originalSaleLineId: sale.lines[0]._id },
        ),
      ]),
    { code: 'EXCESS_RETURN' },
  );
});
test('expired return recognizes loss at return time', () => {
  const sale = event('SALE', 5),
    ret = event(
      'RETURN',
      2,
      { referenceTransactionId: sale._id, effectiveAt: '2026-01-03T12:00:00.000Z' },
      { originalSaleLineId: sale.lines[0]._id },
    );
  const r = replay([
    receipt(
      5,
      10,
      { effectiveAt: '2025-12-31T12:00:00.000Z' },
      { batchId: uuid(), expiryDate: '2026-01-02' },
    ),
    sale,
    ret,
  ]);
  money(r.cogs, 30);
  money(r.writeOffs, 20);
  money(r.closingValue, 0);
  assert.equal(r.rows.at(-1).effectiveAt, ret.effectiveAt);
});
test('multiple material issues accumulate WIP and one output closes job', () => {
  const job = uuid(),
    output = uuid();
  const events = [
    receipt(10, 5),
    event('PRODUCTION_ISSUE', 3, { productionJobId: job }),
    event('PRODUCTION_ISSUE', 3, { productionJobId: job }),
  ];
  money(replay(events).workInProgress, 30);
  events.push(event('FINISHED_GOODS', 3, { productionJobId: job }, { itemId: output }));
  money(replay(events).closingValue, 50);
  money(replay(events).workInProgress, 0);
  assert.throws(() => replay([...events, event('PRODUCTION_ISSUE', 1, { productionJobId: job })]), {
    code: 'CLOSED_JOB',
  });
});
test('decimal depletion leaves no residual and scrap is not COGS', () => {
  for (const method of ['FIFO', 'WAC']) {
    const r = replay(
      [receipt('0.3', '0.1'), event('SALE', '0.1'), event('WRITE_OFF', '0.2')],
      method,
    );
    money(r.closingValue, 0);
    money(r.cogs, '0.01');
    money(r.writeOffs, '0.02');
  }
});
test('value conservation across 60 generated movement sequences', () => {
  for (const method of ['FIFO', 'WAC'])
    for (let n = 1; n <= 30; n++) {
      const events = [
        receipt(n * 3, n),
        receipt(n * 3, n + 1),
        event('TRANSFER', n, {}, { destinationWarehouseId }),
        event('SALE', n),
        event('WRITE_OFF', n),
      ];
      const r = replay(events, method);
      const difference = D(r.closingValue)
        .plus(r.cogs)
        .plus(r.writeOffs)
        .minus(
          D(n * 3)
            .mul(n)
            .plus(D(n * 3).mul(n + 1)),
        )
        .abs();
      assert.ok(difference.lt('0.000000000000000000000000000001'));
    }
});
test('boundary validation rejects malformed input', () => {
  const { _id, sequence, ...valid } = receipt(1, 1);
  assert.equal(transaction.safeParse(valid).success, true);
  for (const patch of [
    { effectiveAt: '2026-02-30T00:00:00.000Z' },
    { lines: [{ ...valid.lines[0], quantity: '0' }] },
    { lines: [{ ...valid.lines[0], quantity: '-1' }] },
    { extra: true },
  ])
    assert.equal(transaction.safeParse({ ...valid, ...patch }).success, false);
});
test('backdating propagates through production, transfer, sale and return', () => {
  const job = uuid(),
    output = uuid();
  const input = receipt(10, 20, { effectiveAt: '2026-01-02T00:00:00.000Z' });
  const issue = event('PRODUCTION_ISSUE', 10, {
    productionJobId: job,
    effectiveAt: '2026-01-03T00:00:00.000Z',
  });
  const finished = event(
    'FINISHED_GOODS',
    5,
    { productionJobId: job, effectiveAt: '2026-01-04T00:00:00.000Z' },
    { itemId: output },
  );
  const transfer = event(
    'TRANSFER',
    5,
    { effectiveAt: '2026-01-05T00:00:00.000Z' },
    { itemId: output, destinationWarehouseId },
  );
  const sale = event(
    'SALE',
    4,
    { effectiveAt: '2026-01-06T00:00:00.000Z' },
    { itemId: output, warehouseId: destinationWarehouseId },
  );
  const ret = event(
    'RETURN',
    1,
    { effectiveAt: '2026-01-07T00:00:00.000Z', referenceTransactionId: sale._id },
    { itemId: output, warehouseId: destinationWarehouseId, originalSaleLineId: sale.lines[0]._id },
  );
  const events = [input, issue, finished, transfer, sale, ret];
  money(replay(events).cogs, 120);
  events.push(receipt(10, 10));
  money(replay(events).cogs, 60);
  money(replay(events, 'WAC').cogs, 90);
});
test('batch-specific shortage does not consume other batches', () => {
  const first = uuid(),
    second = uuid();
  assert.throws(
    () =>
      replay([
        receipt(1, 10, {}, { batchId: first }),
        receipt(10, 20, {}, { batchId: second }),
        event('SALE', 2, {}, { batchId: first }),
      ]),
    { code: 'INSUFFICIENT_STOCK' },
  );
});
test('future movements and expiry are excluded before reporting cutoff', () => {
  const events = [
    receipt(10, 10, {}, { batchId: uuid(), expiryDate: '2026-02-01' }),
    event('SALE', 2, { effectiveAt: '2026-01-20T00:00:00.000Z' }),
  ];
  money(replay(events, 'FIFO', '2026-01-10T23:59:59.999Z').closingValue, 100);
  money(replay(events, 'FIFO', '2026-01-31T23:59:59.999Z').closingValue, 80);
  money(replay(events, 'FIFO', '2026-02-01T00:00:00.000Z').closingValue, 0);
});
test('item methods carry WAC material costs into FIFO finished goods',()=>{
  const output=uuid(),job=uuid();
  const events=[receipt(10,10),receipt(10,20),event('PRODUCTION_ISSUE',12,{productionJobId:job}),event('FINISHED_GOODS',6,{productionJobId:job},{itemId:output}),event('SALE',2,{}, {itemId:output})];
  const result=replay(events,'ITEM',undefined,{[itemId]:'WAC',[output]:'FIFO'});
  money(result.cogs,60);money(result.closingValue,240);money(result.workInProgress,0);
  assert.equal(result.balances.find(b=>b.itemId===output).valuationMethod,'FIFO');
});
