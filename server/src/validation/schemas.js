import { z } from 'zod';
export const id = z.string().uuid();
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      s.slice(0, 4) >= '0001' &&
      !isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    'Invalid date',
  );
const decimal = z.string().regex(/^\d{1,12}(\.\d{1,6})?$/);
const name = z.string().trim().min(1).max(100);
export const masters = {
  items: z
    .object({
      sku: name,
      name,
      type: z.enum(['RAW_MATERIAL', 'FINISHED_GOOD']),
      baseUnit: name,
      valuationMethod: z.enum(['FIFO', 'WAC']).default('FIFO'),
      expiryTracked: z.boolean().default(false),
      active: z.boolean().default(true),
    })
    .strict(),
  warehouses: z.object({ code: name, name, active: z.boolean().default(true) }).strict(),
  batches: z.object({ itemId: id, batchCode: name, expiryDate: date.optional() }).strict(),
  productionJobs: z.object({ jobCode: name, outputItemId: id }).strict(),
};
export const transaction = z
  .object({
    requestId: id,
    effectiveAt: z.iso
      .datetime({ precision: 3 })
      .refine((value) => value.slice(0, 4) >= '0001', 'Year must be at least 0001'),
    type: z.enum([
      'RECEIPT',
      'SALE',
      'RETURN',
      'WRITE_OFF',
      'TRANSFER',
      'PRODUCTION_ISSUE',
      'FINISHED_GOODS',
    ]),
    referenceTransactionId: id.optional(),
    productionJobId: id.optional(),
    reason: name.optional(),
    lines: z
      .array(
        z
          .object({
            _id: id,
            itemId: id,
            warehouseId: id,
            batchId: id.optional(),
            quantity: decimal.refine((s) => Number(s) > 0),
            unitCost: decimal.optional(),
            destinationWarehouseId: id.optional(),
            originalSaleLineId: id.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((tx, ctx) => {
    const fail = (message) => ctx.addIssue({ code: 'custom', message });
    if (new Set(tx.lines.map((l) => l._id)).size !== tx.lines.length)
      fail('Line IDs must be unique');
    if (tx.type === 'WRITE_OFF' && !tx.reason) fail('Write-off reason is required');
    if (tx.type === 'RETURN' && !tx.referenceTransactionId) fail('Original sale is required');
    if (['PRODUCTION_ISSUE', 'FINISHED_GOODS'].includes(tx.type) && !tx.productionJobId)
      fail('Production job is required');
    if (tx.type === 'FINISHED_GOODS' && tx.lines.length !== 1)
      fail('One output line per production job');
    for (const l of tx.lines) {
      if (tx.type !== 'TRANSFER' && l.destinationWarehouseId)
        fail('Destination is only allowed for transfers');
      if (tx.type !== 'RETURN' && l.originalSaleLineId)
        fail('Original sale line is only allowed for returns');
      if (tx.type === 'RECEIPT' && l.unitCost === undefined) fail('Receipt unit cost is required');
      if (tx.type !== 'RECEIPT' && l.unitCost !== undefined)
        fail('Unit cost is only allowed for receipts');
      if (
        tx.type === 'TRANSFER' &&
        (!l.destinationWarehouseId || l.destinationWarehouseId === l.warehouseId)
      )
        fail('A different destination is required');
      if (tx.type === 'RETURN' && !l.originalSaleLineId) fail('Original sale line is required');
    }
    if (tx.type !== 'RETURN' && tx.referenceTransactionId)
      fail('Sale reference is only allowed for returns');
    if (!['PRODUCTION_ISSUE', 'FINISHED_GOODS'].includes(tx.type) && tx.productionJobId)
      fail('Production job is only allowed for production');
  });
export const reportQuery = z
  .object({
    asOf: date.optional(),
    from: date.optional(),
    to: date.optional(),
    itemId: id.optional(),
    warehouseId: id.optional(),
    method: z.enum(['FIFO', 'WAC', 'ITEM']).default('ITEM'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (q) => !q.from || q.from <= (q.to || q.asOf || new Date().toISOString().slice(0, 10)),
    'Invalid reporting range',
  );
