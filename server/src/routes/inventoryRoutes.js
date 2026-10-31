import { Router } from 'express';
import { z } from 'zod';
import { masters, reportQuery, id } from '../validation/schemas.js';
import { createInventoryController } from '../controllers/inventoryController.js';
import { DomainError } from '../domain/errors.js';
export function createInventoryRoutes(service) {
  const router = Router();
  const controller = createInventoryController(service);
  router.get('/health', async (req, res) =>
    res.json({ ready: await service.repository.healthy() }),
  );
  for (const [path, name] of [
    ['items', 'items'],
    ['warehouses', 'warehouses'],
    ['batches', 'batches'],
    ['production-jobs', 'productionJobs'],
  ]) {
    router.get(`/${path}`, async (req, res) => {
      const report = await service.report(reportQuery.parse(req.query));
      let records = report.catalog[name];
      if (name === 'batches' && req.query.itemId)
        records = records.filter((b) => b.itemId === req.query.itemId);
      if (name === 'productionJobs')
        records = records.map((j) => ({
          ...j,
          status: report.fifo.jobs.find((x) => x._id === j._id)?.status || 'OPEN',
        }));
      res.json(records);
    });
    router.post(`/${path}`, async (req, res) =>
      res
        .status(201)
        .json(await service.repository.createMaster(name, masters[name].parse(req.body))),
    );
    if (['items', 'warehouses'].includes(name))
      router.patch(`/${path}/:id`, async (req, res) => {
        const text = z.string().trim().min(1).max(100).optional();
        const patch = z
          .object({
            name: text,
            active: z.boolean().optional(),
            ...(name === 'items'
              ? {
                  sku: text,
                  type: z.enum(['RAW_MATERIAL', 'FINISHED_GOOD']).optional(),
                  baseUnit: text,
                  expiryTracked: z.boolean().optional(),
                  valuationMethod: z.enum(['FIFO', 'WAC']).optional(),
                }
              : { code: text }),
          })
          .strict()
          .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
          .parse(req.body);
        res.json(await service.repository.patchMaster(name, id.parse(req.params.id), patch));
      });
    if (['items', 'warehouses'].includes(name))
      router.delete(`/${path}/:id`, async (req, res) => {
        res.json(await service.repository.deleteMaster(name, id.parse(req.params.id)));
      });
  }
  router.post('/transactions', controller.post);
  router.get('/transactions', async (req, res) => {
    const query = reportQuery.parse(req.query),
      report = await service.report(query);
    const records = report.transactions
      .filter(
        (t) =>
          (!query.from || t.effectiveAt.slice(0, 10) >= query.from) &&
          (!(query.to || query.asOf) || t.effectiveAt.slice(0, 10) <= (query.to || query.asOf)) &&
          t.lines.some(
            (l) =>
              (!query.itemId || l.itemId === query.itemId) &&
              (!query.warehouseId ||
                l.warehouseId === query.warehouseId ||
                l.destinationWarehouseId === query.warehouseId),
          ),
      )
      .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || b.sequence - a.sequence);
    res.json({
      total: records.length,
      page: query.page,
      data: records.slice((query.page - 1) * query.limit, query.page * query.limit),
    });
  });
  router.get('/transactions/:id', async (req, res) => {
    const report = await service.report({ asOf: '9999-12-31' }),
      tx = report.transactions.find((t) => t._id === req.params.id);
    if (!tx) throw new DomainError('NOT_FOUND', 'Transaction not found', {}, 404);
    res.json({
      ...tx,
      allocations: {
        fifo: report.fifo.rows.filter((r) => r.transactionId === tx._id),
        wac: report.wac.rows.filter((r) => r.transactionId === tx._id),
      },
    });
  });
  for (const name of ['stock', 'ledger', 'valuation', 'cogs', 'losses'])
    router.get(`/reports/${name}`, controller.report(name));
  return router;
}
