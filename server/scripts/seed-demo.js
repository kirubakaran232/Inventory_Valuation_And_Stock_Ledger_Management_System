import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { EJSON } from 'bson';
import { connectDatabase } from '../src/config/database.js';
import { createRepository } from '../src/repositories/inventoryRepository.js';
import { createInventoryService } from '../src/services/inventoryService.js';
import { masters, transaction } from '../src/validation/schemas.js';
const id = (key) => {
  const h = createHash('sha256').update(`stockbook-simple-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const { client, db } = await connectDatabase();
try {
  // Explicit, one-time replacement of the previously requested larger mock dataset.
  if (process.argv.includes('--replace-legacy-demo')) {
    await db
      .collection('ledgerRevisions')
      .updateOne({ _id: 'ledger' }, { $inc: { revision: 1 } }, { upsert: true });
    const selectors = {
      stockTransactions: { reason: { $regex: '^DEMO · ' } },
      items: { sku: { $in: ['DEMO-BOLT', 'DEMO-MATERIAL', 'DEMO-KIT', 'DEMO-GLUE'] } },
      warehouses: { code: { $in: ['DEMO-MAIN', 'DEMO-BRANCH'] } },
      batches: { batchCode: 'DEMO-EXP-OCT26' },
      productionJobs: { jobCode: 'DEMO-JOB-001' },
    };
    for (const [name, filter] of Object.entries(selectors))
      await db.collection(name).deleteMany(filter);
  }
  const repository = createRepository(client, db);
  await repository.initialize();
  const service = createInventoryService(repository);
  const snapshot = await repository.snapshot();
  const warehouse =
    snapshot.catalog.warehouses.find((w) => w.code === 'DEMO-SHOP') ||
    (await repository.createMaster(
      'warehouses',
      masters.warehouses.parse({ code: 'DEMO-SHOP', name: 'Sample grocery shop' }),
    ));
  const rice =
    snapshot.catalog.items.find((i) => i.sku === 'DEMO-RICE') ||
    (await repository.createMaster(
      'items',
      masters.items.parse({
        sku: 'DEMO-RICE',
        name: 'Rice (sample)',
        type: 'FINISHED_GOOD',
        baseUnit: 'kg',
      }),
    ));
  const post = (key, type, day, quantity, unitCost, extra = {}) =>
    service.post(
      transaction.parse({
        requestId: id(key),
        effectiveAt: `2026-10-${day}T04:00:00.000Z`,
        type,
        reason: `SIMPLE DEMO · ${key}`,
        lines: [
          {
            _id: id(key + ':line'),
            itemId: rice._id,
            warehouseId: warehouse._id,
            quantity,
            ...(unitCost ? { unitCost } : {}),
            ...(extra.line || {}),
          },
        ],
        ...(extra.transaction || {}),
      }),
    );
  await post('purchase-1', 'RECEIPT', 27, '10', '50');
  await post('purchase-2', 'RECEIPT', 28, '10', '60');
  const sale = await post('customer-sale', 'SALE', 29, '12');
  await post('customer-return', 'RETURN', 30, '1', undefined, {
    line: { originalSaleLineId: sale.lines[0]._id },
    transaction: { referenceTransactionId: sale._id },
  });
  await post('damaged-rice', 'WRITE_OFF', 31, '1');
  const report = await service.report({ asOf: '2026-10-31', itemId: rice._id });
  console.log(
    JSON.stringify(
      {
        database: db.databaseName,
        sampleTransactions: report.transactions.filter((t) => t.reason?.startsWith('SIMPLE DEMO ·'))
          .length,
        quantity: report.fifo.balances[0]?.quantity,
        fifo: {
          value: report.fifo.closingValue,
          cogs: report.fifo.cogs,
          loss: report.fifo.writeOffs,
        },
        wac: { value: report.wac.closingValue, cogs: report.wac.cogs, loss: report.wac.writeOffs },
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
