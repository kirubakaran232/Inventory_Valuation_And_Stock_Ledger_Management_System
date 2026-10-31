import React, { useState } from 'react';
import { postTransaction } from '../api/inventory.js';

const line = () => ({ _id: crypto.randomUUID(), itemId: '', warehouseId: '', quantity: '' });
const initial = () => ({
  requestId: crypto.randomUUID(),
  effectiveAt: new Date().toISOString().slice(0, 16),
  type: 'RECEIPT',
  lines: [line()],
});

export default function TransactionForm({ catalog, transactions, onSaved, onError }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  const set = (key, value) => setForm({ ...form, [key]: value });

  const change = (index, key, value) => {
    setForm({
      ...form,
      lines: form.lines.map((l, i) => {
        if (i !== index) return l;
        const updated = {
          ...l,
          [key]: value,
          ...(key === 'itemId' ? { batchId: '', originalSaleLineId: '' } : {}),
          ...(key === 'warehouseId' ? { destinationWarehouseId: '' } : {}),
        };
        // Auto-select original sale line if only one exists for this item
        if (key === 'itemId' && form.type === 'RETURN' && form.referenceTransactionId) {
          const sale = transactions.find((t) => t._id === form.referenceTransactionId);
          const matchingLines = (sale?.lines || []).filter((s) => s.itemId === value);
          if (matchingLines.length === 1) {
            updated.originalSaleLineId = matchingLines[0]._id;
            if (!updated.quantity) updated.quantity = matchingLines[0].quantity;
            if (!updated.warehouseId) updated.warehouseId = matchingLines[0].warehouseId;
          }
        }
        return updated;
      }),
    });
  };

  const sale = transactions.find((t) => t._id === form.referenceTransactionId);
  const selectedJob = catalog.productionJobs.find((j) => j._id === form.productionJobId);

  const getEligibleItems = (lineItem) => {
    if (form.type === 'PRODUCTION_ISSUE') {
      return catalog.items.filter((x) => x.active && x.type === 'RAW_MATERIAL');
    }
    if (form.type === 'FINISHED_GOODS') {
      if (selectedJob) {
        return catalog.items.filter((x) => x._id === selectedJob.outputItemId);
      }
      return catalog.items.filter((x) => x.active && x.type === 'FINISHED_GOOD');
    }
    if (form.type === 'RETURN' && sale) {
      const saleItemIds = new Set((sale.lines || []).map((l) => l.itemId));
      return catalog.items.filter((x) => saleItemIds.has(x._id));
    }
    return catalog.items.filter((x) => x.active);
  };

  const select = (index, key, label, options, required = true) => (
    <label>
      {label}
      <select
        required={required}
        value={form.lines[index][key] || ''}
        onChange={(e) => change(index, key, e.target.value)}
      >
        <option value="">{required ? 'Select…' : 'Automatic / none'}</option>
        {options.map((o) => (
          <option key={o._id} value={o._id}>
            {o.label || o.sku || o.code || o.batchCode}
          </option>
        ))}
      </select>
    </label>
  );

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        effectiveAt: new Date(form.effectiveAt + 'Z').toISOString(),
        lines: form.lines.map((l) =>
          Object.fromEntries(Object.entries(l).filter(([, v]) => v !== '')),
        ),
      };
      await postTransaction(payload);
      setForm(initial());
      await onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Record a Stock Movement</h2>
      <p className="muted">
        Effective times use UTC. Late/backdated entries automatically recalculate the entire stock ledger and valuation layers.
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="movement-fields">
          <label>
            Movement Type
            <select
              value={form.type}
              onChange={(e) => {
                const newType = e.target.value;
                setForm({ ...initial(), type: newType });
              }}
            >
              <option value="RECEIPT">RECEIPT (Goods Purchase / Inward)</option>
              <option value="PRODUCTION_ISSUE">PRODUCTION_ISSUE (Raw Material to Job)</option>
              <option value="FINISHED_GOODS">FINISHED_GOODS (Job Completion Output)</option>
              <option value="SALE">SALE (Goods Delivery to Customer)</option>
              <option value="RETURN">RETURN (Customer Sales Return)</option>
              <option value="WRITE_OFF">WRITE_OFF (Scrap / Damage / Adjustment)</option>
              <option value="TRANSFER">TRANSFER (Inter-Warehouse Movement)</option>
            </select>
          </label>

          <label>
            Effective Date & Time (UTC)
            <input
              required
              type="datetime-local"
              value={form.effectiveAt}
              onChange={(e) => set('effectiveAt', e.target.value)}
            />
          </label>

          {['PRODUCTION_ISSUE', 'FINISHED_GOODS'].includes(form.type) && (
            <label>
              Production Job
              <select
                required
                value={form.productionJobId || ''}
                onChange={(e) => {
                  const jobId = e.target.value;
                  const job = catalog.productionJobs.find((j) => j._id === jobId);
                  setForm({
                    ...form,
                    productionJobId: jobId,
                    lines: form.lines.map((l, i) =>
                      i === 0 && form.type === 'FINISHED_GOODS' && job
                        ? { ...l, itemId: job.outputItemId }
                        : l,
                    ),
                  });
                }}
              >
                <option value="">Select job…</option>
                {catalog.productionJobs.map((j) => (
                  <option key={j._id} value={j._id}>
                    {j.jobCode} (Status: {j.status || 'OPEN'})
                  </option>
                ))}
              </select>
            </label>
          )}

          {form.type === 'RETURN' && (
            <label>
              Original Sale Reference
              <select
                required
                value={form.referenceTransactionId || ''}
                onChange={(e) => {
                  const saleId = e.target.value;
                  const targetSale = transactions.find((t) => t._id === saleId);
                  const firstLine = targetSale?.lines?.[0];
                  setForm({
                    ...form,
                    referenceTransactionId: saleId,
                    lines: [
                      {
                        _id: crypto.randomUUID(),
                        itemId: firstLine?.itemId || '',
                        warehouseId: firstLine?.warehouseId || '',
                        quantity: firstLine?.quantity || '',
                        originalSaleLineId: firstLine?._id || '',
                      },
                    ],
                  });
                }}
              >
                <option value="">Select sale transaction…</option>
                {transactions
                  .filter((t) => t.type === 'SALE')
                  .map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.effectiveAt.slice(0, 10)} · {t.reason || t._id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {form.type === 'WRITE_OFF' && (
            <label>
              Write-Off / Scrap Reason
              <input
                required
                placeholder="e.g. Damaged in transit, quality rejection"
                value={form.reason || ''}
                onChange={(e) => set('reason', e.target.value)}
              />
            </label>
          )}

          {form.lines.map((l, i) => {
            const currentItem = catalog.items.find((item) => item._id === l.itemId);
            return (
              <fieldset key={l._id}>
                <legend>Line {i + 1}</legend>
                <div className="line-fields">
                  {select(
                    i,
                    'itemId',
                    'Item',
                    getEligibleItems(l),
                  )}
                  {select(
                    i,
                    'warehouseId',
                    form.type === 'TRANSFER' ? 'Source Warehouse' : 'Warehouse',
                    catalog.warehouses.filter((x) => x.active),
                  )}
                  {select(
                    i,
                    'batchId',
                    currentItem?.expiryTracked ? 'Batch (Expiry Required)' : 'Batch',
                    catalog.batches.filter((b) => b.itemId === l.itemId),
                    !!currentItem?.expiryTracked && ['RECEIPT', 'FINISHED_GOODS'].includes(form.type),
                  )}
                  <label>
                    Quantity
                    <input
                      required
                      inputMode="decimal"
                      pattern="[0-9]+(\.[0-9]{1,6})?"
                      placeholder="e.g. 10.00"
                      value={l.quantity}
                      onChange={(e) => change(i, 'quantity', e.target.value)}
                    />
                  </label>
                  {form.type === 'RECEIPT' && (
                    <label>
                      Unit Cost
                      <input
                        required
                        inputMode="decimal"
                        pattern="[0-9]+(\.[0-9]{1,6})?"
                        placeholder="e.g. 25.50"
                        value={l.unitCost || ''}
                        onChange={(e) => change(i, 'unitCost', e.target.value)}
                      />
                    </label>
                  )}
                  {form.type === 'TRANSFER' &&
                    select(
                      i,
                      'destinationWarehouseId',
                      'Destination Warehouse',
                      catalog.warehouses.filter((w) => w.active && w._id !== l.warehouseId),
                    )}
                  {form.type === 'RETURN' &&
                    select(
                      i,
                      'originalSaleLineId',
                      'Original Sale Line',
                      (sale?.lines || [])
                        .filter((s) => s.itemId === l.itemId)
                        .map((s) => ({ _id: s._id, label: `Line ${s._id.slice(0, 8)} · Qty ${s.quantity}` })),
                    )}
                </div>
                {form.lines.length > 1 && (
                  <button
                    type="button"
                    style={{ marginTop: 10, background: '#a83232' }}
                    onClick={() =>
                      set(
                        'lines',
                        form.lines.filter((_, n) => n !== i),
                      )
                    }
                  >
                    Remove Line
                  </button>
                )}
              </fieldset>
            );
          })}

          <div className="submit">
            {form.type !== 'FINISHED_GOODS' && (
              <button
                type="button"
                style={{ marginRight: 10, background: '#456a5c' }}
                onClick={() => set('lines', [...form.lines, line()])}
              >
                + Add Line
              </button>
            )}
            <button disabled={busy}>{busy ? 'Posting…' : 'Post Transaction →'}</button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
