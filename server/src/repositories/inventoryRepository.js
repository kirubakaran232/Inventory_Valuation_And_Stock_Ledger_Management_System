import { Decimal128 } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DomainError, requireCondition as check } from '../domain/errors.js';

const decode = (tx) => ({
  ...tx,
  lines: tx.lines.map((l) => ({
    ...l,
    quantity: l.quantity.toString(),
    ...(l.unitCost !== undefined ? { unitCost: l.unitCost.toString() } : {}),
  })),
});

export function createRepository(client, db) {
  const events = db.collection('stockTransactions'),
    revisions = db.collection('ledgerRevisions');
  const catalogNames = ['items', 'warehouses', 'batches', 'productionJobs'];

  // Works on both standalone and replica-set MongoDB.
  // On standalone we lose atomicity across collections but preserve sequence integrity.
  const locked = async (operation) => {
    const lock = await revisions.findOneAndUpdate(
      { _id: 'ledger' },
      { $inc: { revision: 1 } },
      { returnDocument: 'after', upsert: true },
    );
    return operation(lock.revision);
  };

  const catalog = async () => {
    const records = {};
    for (const name of catalogNames) {
      records[name] = await db.collection(name).find({}).toArray();
    }
    return records;
  };

  const validateReferences = async (tx) => {
    const requireDoc = async (name, id) => {
      const doc = await db.collection(name).findOne({ _id: id });
      check(doc, 'MISSING_REFERENCE', `${name} record does not exist`, { id });
      check(doc.active !== false, 'INACTIVE_REFERENCE', `${name} record is inactive`, { id });
      return doc;
    };
    const job = tx.productionJobId ? await requireDoc('productionJobs', tx.productionJobId) : null;
    for (const line of tx.lines) {
      const item = await requireDoc('items', line.itemId);
      await requireDoc('warehouses', line.warehouseId);
      if (line.destinationWarehouseId) await requireDoc('warehouses', line.destinationWarehouseId);
      if (line.batchId) {
        const batch = await requireDoc('batches', line.batchId);
        check(batch.itemId === line.itemId, 'BATCH_MISMATCH', 'Batch belongs to another item');
      }
      if (item.expiryTracked && ['RECEIPT', 'FINISHED_GOODS'].includes(tx.type))
        check(line.batchId, 'BATCH_REQUIRED', 'Expiry-tracked receipts require a batch');
      if (tx.type === 'PRODUCTION_ISSUE')
        check(
          item.type === 'RAW_MATERIAL',
          'INVALID_ITEM_TYPE',
          'Production issues require raw materials',
        );
      if (tx.type === 'FINISHED_GOODS')
        check(
          job.outputItemId === item._id && item.type === 'FINISHED_GOOD',
          'INVALID_OUTPUT',
          'Output must match the production job',
        );
    }
  };

  const isReferenced = async (name, id) => {
    const query =
      name === 'items'
        ? { 'lines.itemId': id }
        : { $or: [{ 'lines.warehouseId': id }, { 'lines.destinationWarehouseId': id }] };
    if (await events.findOne(query)) return true;
    if (name === 'items') {
      if (await db.collection('batches').findOne({ itemId: id })) return true;
      if (await db.collection('productionJobs').findOne({ outputItemId: id })) return true;
    }
    return false;
  };

  return {
    async initialize() {
      await events.createIndex({ requestId: 1 }, { unique: true });
      await events.createIndex({ effectiveAt: 1, sequence: 1 });
      await events.createIndex({ referenceTransactionId: 1 });
      await events.createIndex({ productionJobId: 1 });
      for (const [name, key] of [
        ['items', { sku: 1 }],
        ['warehouses', { code: 1 }],
        ['batches', { itemId: 1, batchCode: 1 }],
        ['productionJobs', { jobCode: 1 }],
      ])
        await db.collection(name).createIndex(key, { unique: true });
      await revisions.updateOne(
        { _id: 'ledger' },
        { $setOnInsert: { revision: 0 } },
        { upsert: true },
      );
    },

    async snapshot() {
      const [rev, txns, cat] = await Promise.all([
        revisions.findOne({ _id: 'ledger' }),
        events.find({}).toArray(),
        catalog(),
      ]);
      return {
        revision: rev?.revision ?? 0,
        transactions: txns.map(decode),
        catalog: cat,
      };
    },

    async createMaster(name, input) {
      return locked(async (sequence) => {
        if (name === 'batches' || name === 'productionJobs') {
          const item = await db
            .collection('items')
            .findOne({ _id: input.itemId || input.outputItemId });
          check(item && item.active, 'MISSING_ITEM', 'An active item is required');
          if (name === 'batches' && item.expiryTracked)
            check(input.expiryDate, 'EXPIRY_REQUIRED', 'This item requires an expiry date');
          if (name === 'productionJobs')
            check(
              item.type === 'FINISHED_GOOD',
              'INVALID_OUTPUT',
              'Job output must be finished goods',
            );
        }
        const doc = { _id: randomUUID(), ...input };
        await db.collection(name).insertOne(doc);
        return doc;
      });
    },

    async patchMaster(name, id, input) {
      return locked(async () => {
        const original = await db.collection(name).findOne({ _id: id });
        if (!original) throw new DomainError('NOT_FOUND', 'Record not found', {}, 404);
        if (name === 'items' && (await isReferenced(name, id))) {
          for (const field of ['type', 'baseUnit', 'expiryTracked', 'valuationMethod']) {
            const previous =
              field === 'valuationMethod' ? original[field] || 'FIFO' : original[field];
            check(
              input[field] === undefined || input[field] === previous,
              'ITEM_IN_USE',
              'Accounting fields cannot change after an item is referenced. Name and SKU can still be edited.',
            );
          }
        }
        const doc = await db
          .collection(name)
          .findOneAndUpdate({ _id: id }, { $set: input }, { returnDocument: 'after' });
        if (!doc) throw new DomainError('NOT_FOUND', 'Record not found', {}, 404);
        return doc;
      });
    },

    async deleteMaster(name, id) {
      return locked(async () => {
        const existing = await db.collection(name).findOne({ _id: id });
        if (!existing) throw new DomainError('NOT_FOUND', 'Record not found', {}, 404);
        check(
          !(await isReferenced(name, id)),
          'RECORD_IN_USE',
          'This record has history or references and cannot be deleted. Deactivate it instead.',
        );
        await db.collection(name).deleteOne({ _id: id });
        return { deleted: true, id };
      });
    },

    async append(input, validate) {
      return locked(async (sequence) => {
        const existing = await events.findOne({ requestId: input.requestId });
        if (existing) {
          const { _id, recordedAt, sequence: _seq, ...original } = decode(existing);
          check(
            isDeepStrictEqual(original, input),
            'IDEMPOTENCY_CONFLICT',
            'Request ID is already used for different content',
          );
          return decode(existing);
        }
        await validateReferences(input);
        const tx = { _id: randomUUID(), ...input, sequence, recordedAt: new Date().toISOString() };
        validate([...(await events.find({}).toArray()).map(decode), tx], await catalog());
        await events.insertOne({
          ...tx,
          lines: tx.lines.map((l) => ({
            ...l,
            quantity: Decimal128.fromString(l.quantity),
            ...(l.unitCost !== undefined ? { unitCost: Decimal128.fromString(l.unitCost) } : {}),
          })),
        });
        return tx;
      });
    },

    async healthy() {
      await db.command({ ping: 1 });
      return true;
    },
  };
}
