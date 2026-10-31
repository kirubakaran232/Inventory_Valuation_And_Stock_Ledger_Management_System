import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createRepository } from '../../src/repositories/inventoryRepository.js';
import { createInventoryService } from '../../src/services/inventoryService.js';
import { createApp } from '../../src/app.js';
const uuid = () => crypto.randomUUID();
test(
  'MongoDB and HTTP integration: atomicity, concurrency, references, reports and idempotency',
  { skip: process.env.RUN_MONGO_TESTS !== '1', timeout: 240000 },
  async (t) => {
    const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    t.after(() => mongo.stop());
    const client = new MongoClient(mongo.getUri());
    await client.connect();
    t.after(() => client.close());
    const db = client.db('test_inventory'),
      repository = createRepository(client, db);
    await repository.initialize();
    const service = createInventoryService(repository),
      server = createApp(service).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    t.after(() => new Promise((r) => server.close(r)));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const request = async (path, body) => {
      const r = await fetch(
        base + path,
        body
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {},
      );
      return { status: r.status, data: await r.json() };
    };
    const mutate = async (path, method, body) => {
      const response = await fetch(base + path, { method, headers: {'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)}:{}) });
      return {status:response.status,data:await response.json()};
    };
    const item = (
      await request('/items', { sku: 'RM', name: 'Material', type: 'RAW_MATERIAL', baseUnit: 'kg' })
    ).data;
    const warehouse = (await request('/warehouses', { code: 'MAIN', name: 'Main warehouse' })).data;
    const tx = (type, q, extra = {}) => ({
      requestId: uuid(),
      type,
      effectiveAt: '2026-01-01T12:00:00.000Z',
      lines: [
        {
          _id: uuid(),
          itemId: item._id,
          warehouseId: warehouse._id,
          quantity: String(q),
          ...(type === 'RECEIPT' ? { unitCost: '10' } : {}),
        },
      ],
      ...extra,
    });
    await t.test('validates references and decimal persistence', async () => {
      const invalid = tx('RECEIPT', 1);
      invalid.lines[0].itemId = uuid();
      assert.equal((await request('/transactions', invalid)).status, 409);
      const input = tx('RECEIPT', 10),
        first = await request('/transactions', input);
      assert.equal(first.status, 201);
      const again = await request('/transactions', input);
      assert.equal(again.data._id, first.data._id);
      assert.equal((await request('/transactions', { ...input, reason: 'changed' })).status, 409);
      const stored = await db.collection('stockTransactions').findOne({ _id: first.data._id });
      assert.equal(stored.lines[0].quantity._bsontype, 'Decimal128');
    });
    await t.test('concurrent sales cannot oversell', async () => {
      const results = await Promise.all([
        request('/transactions', tx('SALE', 7)),
        request('/transactions', tx('SALE', 7)),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const report = (await request('/reports/valuation?asOf=2026-01-02')).data;
      assert.equal(report.fifo.closingValue, '30');
    });
    await t.test('multi-line failure rolls back all lines and revision', async () => {
      const before = await repository.snapshot(),
        input = tx('SALE', 1);
      input.lines.push({ ...input.lines[0], _id: uuid(), quantity: '100' });
      assert.equal((await request('/transactions', input)).status, 409);
      const after = await repository.snapshot();
      assert.equal(after.revision, before.revision);
      assert.equal(after.transactions.length, before.transactions.length);
    });
    await t.test('backdated entry recalculates downstream COGS and period opening', async () => {
      const input = tx('RECEIPT', 10, { effectiveAt: '2025-12-31T12:00:00.000Z' });
      input.lines[0].unitCost = '5';
      assert.equal((await request('/transactions', input)).status, 201);
      const report = (await request('/reports/valuation?from=2026-01-01&asOf=2026-01-02')).data;
      assert.equal(report.fifo.cogs, '35');
      assert.equal(report.wac.cogs, '52.5');
      assert.equal(report.fifo.openingValue, '50');
      const sale = report.transactions.find((t) => t.type === 'SALE');
      const detail = await request(`/transactions/${sale._id}`);
      assert.equal(detail.status, 200);
      assert.equal(detail.data.allocations.fifo[0].value, '35');
    });
    await t.test('invalid input, duplicate masters, report filters and health', async () => {
      assert.equal((await request('/transactions', {})).status, 400);
      assert.equal(
        (
          await request('/items', {
            sku: 'RM',
            name: 'Duplicate',
            type: 'RAW_MATERIAL',
            baseUnit: 'kg',
          })
        ).status,
        409,
      );
      assert.equal((await request('/reports/valuation?asOf=2026-02-30')).status, 400);
      assert.equal((await request('/health')).data.ready, true);
      assert.equal((await request('/transactions?limit=1')).data.data.length, 1);
      const historical = (await request('/transactions?asOf=2025-12-31')).data;
      assert.equal(historical.total, 1);
      assert.equal(historical.data[0].effectiveAt, '2025-12-31T12:00:00.000Z');
      assert.equal((await request('/reports/valuation?from=0000-01-01')).status, 400);
    });
    await t.test('production status is included in the catalog consumed by React', async () => {
      const output = (
        await request('/items', {
          sku: 'FG',
          name: 'Finished',
          type: 'FINISHED_GOOD',
          baseUnit: 'each',
        })
      ).data;
      const job = (
        await request('/production-jobs', { jobCode: 'JOB-1', outputItemId: output._id })
      ).data;
      const issue = tx('PRODUCTION_ISSUE', 1, {
        productionJobId: job._id,
        effectiveAt: '2026-01-02T12:00:00.000Z',
      });
      assert.equal((await request('/transactions', issue)).status, 201);
      let report = (await request('/reports/valuation?asOf=2026-01-03')).data;
      assert.equal(report.catalog.productionJobs[0].status, 'IN_PROGRESS');
      const completion = tx('FINISHED_GOODS', 1, {
        productionJobId: job._id,
        effectiveAt: '2026-01-03T12:00:00.000Z',
      });
      completion.lines[0].itemId = output._id;
      assert.equal((await request('/transactions', completion)).status, 201);
      report = (await request('/reports/valuation?asOf=2026-01-03')).data;
      assert.equal(report.catalog.productionJobs[0].status, 'CLOSED');
    });
    await t.test('master edit/delete, WAC settings and historical protections', async () => {
      const fresh=(await request('/items',{sku:'EDIT-ME',name:'Editable',type:'RAW_MATERIAL',baseUnit:'kg',valuationMethod:'WAC'})).data;
      assert.equal(fresh.valuationMethod,'WAC');
      const edited=await mutate(`/items/${fresh._id}`,'PATCH',{name:'Edited'});
      assert.equal(edited.status,200);assert.equal(edited.data.name,'Edited');assert.equal(edited.data.valuationMethod,'WAC');
      assert.equal((await mutate(`/items/${fresh._id}`,'DELETE')).status,200);
      const wh=(await request('/warehouses',{code:'UNUSED',name:'Temporary'})).data;
      assert.equal((await mutate(`/warehouses/${wh._id}`,'PATCH',{name:'Renamed'})).status,200);
      assert.equal((await mutate(`/warehouses/${wh._id}`,'DELETE')).status,200);
      assert.equal((await mutate(`/items/${item._id}`,'DELETE')).status,409);
      assert.equal((await mutate(`/warehouses/${warehouse._id}`,'DELETE')).status,409);
      assert.equal((await mutate(`/items/${item._id}`,'PATCH',{valuationMethod:'WAC'})).status,409);
      const malformed=await fetch(base+'/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'});
      assert.equal(malformed.status,400);assert.equal((await malformed.json()).code,'INVALID_JSON');
    });
    await t.test('configured WAC inventory and finance dashboard reconcile to ledger', async () => {
      const average=(await request('/items',{sku:'AVERAGE',name:'Average cost',type:'FINISHED_GOOD',baseUnit:'unit',valuationMethod:'WAC'})).data;
      const make=(type,quantity,unitCost)=>({...tx(type,quantity),lines:[{_id:uuid(),itemId:average._id,warehouseId:warehouse._id,quantity:String(quantity),...(unitCost?{unitCost:String(unitCost)}:{})}]});
      await request('/transactions',make('RECEIPT',10,10));await request('/transactions',make('RECEIPT',10,20));
      const sale=(await request('/transactions',make('SALE',12))).data;
      const returned=make('RETURN',2);returned.referenceTransactionId=sale._id;returned.lines[0].originalSaleLineId=sale.lines[0]._id;
      assert.equal((await request('/transactions',returned)).status,201);
      assert.equal((await request('/transactions',{...make('WRITE_OFF',1),reason:'Damaged'})).status,201);
      const report=(await request(`/reports/valuation?itemId=${average._id}&asOf=2026-01-02`)).data;
      assert.equal(report.item.closingValue,'135');assert.equal(report.item.cogs,'150');assert.equal(report.item.writeOffs,'15');
      assert.equal(report.fifo.closingValue,'160');assert.equal(report.fifo.cogs,'120');
      const {sum}=await import('../../src/domain/money.js');
      assert.equal(sum(report.item.rows.map(row=>row.inventoryDelta)).toString(),report.item.closingValue);
      assert.equal(sum([report.item.closingValue,report.item.cogs,report.item.writeOffs]).toString(),'300');
      const defaultReport=(await request(`/reports/stock?itemId=${average._id}&asOf=2026-01-02`)).data;
      assert.equal(defaultReport.method,'ITEM');assert.equal(defaultReport.closingValue,'135');
    });
  },
);
