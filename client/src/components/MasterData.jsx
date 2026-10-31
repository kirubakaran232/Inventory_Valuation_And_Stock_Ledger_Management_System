import React, { useState } from 'react';
import { createMaster, updateMaster, deleteMaster } from '../api/inventory.js';
const specifications = {
  items: [
    ['sku', 'SKU'],
    ['name', 'Name'],
    ['type', 'Item type', ['RAW_MATERIAL', 'FINISHED_GOOD']],
    ['baseUnit', 'Base unit'],
    ['valuationMethod', 'Valuation method', ['FIFO', 'WAC']],
    ['expiryTracked', 'Expiry tracked', 'checkbox'],
  ],
  warehouses: [
    ['code', 'Code'],
    ['name', 'Name'],
  ],
  batches: [
    ['itemId', 'Item', 'items'],
    ['batchCode', 'Batch code'],
    ['expiryDate', 'First unusable date', 'date'],
  ],
  'production-jobs': [
    ['jobCode', 'Job code'],
    ['outputItemId', 'Output item', 'items'],
  ],
};
export default function MasterData({ catalog, onSaved, onError }) {
  const [type, setType] = useState('items'),
    [form, setForm] = useState({}),
    [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        ...(type === 'items' ? { expiryTracked: !!form.expiryTracked } : {}),
      };
      if (editing) await updateMaster(type, editing, payload);
      else await createMaster(type, payload);
      setForm({});
      setEditing(null);
      await onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const records = catalog[type === 'production-jobs' ? 'productionJobs' : type] || [];
  return (
    <section className="panel">
      <h2>Master data</h2>
      <div className="switch">
        {Object.keys(specifications).map((t) => (
          <button
            key={t}
            className={type === t ? 'active' : ''}
            onClick={() => {
              setType(t);
              setForm({});
              setEditing(null);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <form onSubmit={save} style={{ marginTop: 20 }}>
        {specifications[type].map(([key, label, kind]) => (
          <label key={key}>
            {label}
            {Array.isArray(kind) || kind === 'items' ? (
              <select
                required
                value={form[key] || ''}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              >
                <option value="">Select…</option>
                {(Array.isArray(kind)
                  ? kind
                  : catalog.items.filter(
                      (i) => i.active && (key !== 'outputItemId' || i.type === 'FINISHED_GOOD'),
                    )
                ).map((o) => (
                  <option key={o._id || o} value={o._id || o}>
                    {o.sku || o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={kind || 'text'}
                required={!['checkbox', 'date'].includes(kind)}
                checked={!!form[key]}
                value={kind === 'checkbox' ? undefined : form[key] || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    [key]: kind === 'checkbox' ? e.target.checked : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
        <div className="submit">
          <button disabled={busy}>{editing ? 'Save changes' : 'Create record'}</button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm({});
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name / reference</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r._id}>
                <td>{r.sku || r.code || r.batchCode || r.jobCode}</td>
                <td>
                  {r.name || r.expiryDate || r.outputItemId || r.itemId}
                  {type === 'items' && <small> · {r.valuationMethod || 'FIFO'}</small>}
                </td>
                <td>
                  {r.active !== undefined ? (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditing(r._id);
                          setForm(
                            Object.fromEntries(
                              specifications[type].map(([key]) => [
                                key,
                                r[key] ??
                                  (key === 'valuationMethod'
                                    ? 'FIFO'
                                    : key === 'expiryTracked'
                                      ? false
                                      : ''),
                              ]),
                            ),
                          );
                        }}
                      >
                        Edit
                      </button>{' '}
                      <button
                        disabled={busy}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Delete ${r.sku || r.code}? Records with history cannot be deleted.`,
                            )
                          )
                            return;
                          setBusy(true);
                          try {
                            await deleteMaster(type, r._id);
                            if (editing === r._id) {
                              setEditing(null);
                              setForm({});
                            }
                            await onSaved();
                          } catch (error) {
                            onError(error.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Delete
                      </button>{' '}
                      <button
                        onClick={async () => {
                          try {
                            await updateMaster(type, r._id, { active: !r.active });
                            await onSaved();
                          } catch (e) {
                            onError(e.message);
                          }
                        }}
                      >
                        {r.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  ) : (
                    r.status || 'Registered'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
