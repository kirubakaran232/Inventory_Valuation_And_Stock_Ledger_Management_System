import { createHash } from 'node:crypto';
import { connectDatabase } from '../src/config/database.js';
import { createRepository } from '../src/repositories/inventoryRepository.js';
import { createInventoryService } from '../src/services/inventoryService.js';
import { masters, transaction } from '../src/validation/schemas.js';

const id = (key) => {
  const h = createHash('sha256')
    .update('stockbook-workflow-v2:' + key)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const { client, db } = await connectDatabase();
try {
  const repository = createRepository(client, db);
  await repository.initialize();
  const service = createInventoryService(repository);
  const snapshot = await repository.snapshot();

  async function master(name, key, body) {
    const existing = snapshot.catalog[name].find((x) => x[key] === body[key]);
    return existing || repository.createMaster(name, masters[name].parse(body));
  }

  const main = await master('warehouses', 'code', {
    code: 'DEMO-SHOP',
    name: 'Sample grocery shop',
  });
  const branch = await master('warehouses', 'code', {
    code: 'DEMO-COUNTER',
    name: 'Bakery counter',
  });

  // Item 1: WAC Raw Material
  const wheat = await master('items', 'sku', {
    sku: 'DEMO-WHEAT',
    name: 'Wheat flour',
    type: 'RAW_MATERIAL',
    baseUnit: 'kg',
    valuationMethod: 'WAC',
  });

  // Item 2: FIFO Finished Good
  const bread = await master('items', 'sku', {
    sku: 'DEMO-BREAD',
    name: 'Bread packs',
    type: 'FINISHED_GOOD',
    baseUnit: 'pack',
    valuationMethod: 'FIFO',
  });

  // Item 3: WAC Expiry-tracked Finished Good
  const milk = await master('items', 'sku', {
    sku: 'DEMO-MILK',
    name: 'Fresh milk',
    type: 'FINISHED_GOOD',
    baseUnit: 'litre',
    valuationMethod: 'WAC',
    expiryTracked: true,
  });

  // Item 4: FIFO Finished Good (Coffee beans)
  const coffee = await master('items', 'sku', {
    sku: 'DEMO-COFFEE',
    name: 'Roast coffee beans',
    type: 'FINISHED_GOOD',
    baseUnit: 'kg',
    valuationMethod: 'FIFO',
  });

  const batch = await master('batches', 'batchCode', {
    batchCode: 'DEMO-MILK-OCT31',
    itemId: milk._id,
    expiryDate: '2026-10-31',
  });

  const job = await master('productionJobs', 'jobCode', {
    jobCode: 'DEMO-BAKE-001',
    outputItemId: bread._id,
  });

  const post = (key, type, day, item, quantity, line = {}, extra = {}) =>
    service.post(
      transaction.parse({
        requestId: id(key),
        effectiveAt: `2026-10-${day}T06:00:00.000Z`,
        type,
        reason: 'WORKFLOW SAMPLE · ' + key,
        lines: [
          {
            _id: id(key + ':line'),
            itemId: item._id,
            warehouseId: main._id,
            quantity: String(quantity),
            ...line,
          },
        ],
        ...extra,
      }),
    );

  // 1. Wheat receipts (WAC initial layers)
  await post('flour-purchase-1', 'RECEIPT', 27, wheat, 10, { unitCost: '20' });
  await post('flour-purchase-2', 'RECEIPT', 28, wheat, 10, { unitCost: '30' });

  // 2. Production issue of wheat into bread job
  await post(
    'flour-production',
    'PRODUCTION_ISSUE',
    28,
    wheat,
    6,
    {},
    { productionJobId: job._id },
  );

  // 3. Finished goods receipt of bread from production job
  await post('bread-output', 'FINISHED_GOODS', 29, bread, 3, {}, { productionJobId: job._id });

  // 4. Sale of wheat
  await post('flour-sale', 'SALE', 29, wheat, 4);

  // 5. Scrap/write-off of damaged wheat
  await post('flour-damage', 'WRITE_OFF', 30, wheat, 1);

  // 6. Transfer of bread to counter warehouse
  await post('bread-transfer', 'TRANSFER', 30, bread, 1, { destinationWarehouseId: branch._id });

  // 7. Sale of bread from counter
  const breadSale = await post('bread-sale', 'SALE', 30, bread, 1, { warehouseId: branch._id });

  // 8. Return of bread
  await post(
    'bread-return',
    'RETURN',
    31,
    bread,
    1,
    { warehouseId: branch._id, originalSaleLineId: breadSale.lines[0]._id },
    { referenceTransactionId: breadSale._id },
  );

  // 9. Scrap of damaged bread
  await post('bread-damage', 'WRITE_OFF', 31, bread, 1);

  // 10. Milk purchase with batch expiry date
  await post('milk-purchase', 'RECEIPT', 29, milk, 5, { unitCost: '40', batchId: batch._id });

  // 11. Coffee FIFO purchases (Layer 1 @ 50, Layer 2 @ 65)
  await post('coffee-purchase-1', 'RECEIPT', 27, coffee, 10, { unitCost: '50' });
  await post('coffee-purchase-2', 'RECEIPT', 28, coffee, 10, { unitCost: '65' });

  // 12. Coffee sale: 12 units (FIFO issues 10 @ 50 + 2 @ 65)
  const coffeeSale = await post('coffee-sale', 'SALE', 29, coffee, 12);

  // 13. Coffee sales return: 1 unit restores exact Layer 2 @ 65
  await post(
    'coffee-return',
    'RETURN',
    30,
    coffee,
    1,
    { originalSaleLineId: coffeeSale.lines[0]._id },
    { referenceTransactionId: coffeeSale._id },
  );

  // 14. Coffee scrap/write-off
  await post('coffee-damage', 'WRITE_OFF', 31, coffee, 1);

  // 15. BACKDATED RECEIPT entered last: Day 26 wheat purchase @ 10!
  // This retroactively recomputes downstream WAC averages, production costs, and closing values!
  await post('flour-backdated-purchase', 'RECEIPT', 26, wheat, 5, { unitCost: '10' });

  const r = await service.report({ asOf: '2026-10-31' });
  console.log(
    JSON.stringify(
      {
        database: db.databaseName,
        itemsCount: r.catalog.items.length,
        items: r.catalog.items.map((i) => ({ sku: i.sku, method: i.valuationMethod || 'FIFO' })),
        transactions: r.transactions.length,
        itemSettings: {
          closing: r.item.closingValue,
          cogs: r.item.cogs,
          losses: r.item.writeOffs,
          wip: r.item.workInProgress,
        },
        fifoComparison: {
          closing: r.fifo.closingValue,
          cogs: r.fifo.cogs,
          losses: r.fifo.writeOffs,
        },
        wacComparison: {
          closing: r.wac.closingValue,
          cogs: r.wac.cogs,
          losses: r.wac.writeOffs,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
