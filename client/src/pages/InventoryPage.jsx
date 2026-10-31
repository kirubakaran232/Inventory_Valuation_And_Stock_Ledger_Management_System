import React, { useEffect, useRef, useState } from 'react';
import { getLedger } from '../api/inventory.js';
import MasterData from '../components/MasterData.jsx';
import TransactionForm from '../components/TransactionForm.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export default function InventoryPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [method, setMethod] = useState('item');
  const [tab, setTab] = useState('dashboard');
  const [reportType, setReportType] = useState('valuation');
  const [query, setQuery] = useState({ asOf: today(), from: '', itemId: '', warehouseId: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const revision = useRef(0);

  async function load() {
    const token = ++revision.current;
    try {
      const result = await getLedger(query);
      if (token === revision.current) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (token === revision.current) {
        setData(null);
        setError(e.message);
      }
      return false;
    }
    return true;
  }

  useEffect(() => {
    load();
    setPage(1);
  }, [query]);

  async function saved() {
    const refreshed = await load();
    setNotice(
      refreshed
        ? 'Saved successfully. All inventory valuations, COGS, and layers recalculated.'
        : 'Saved, but the report could not be refreshed.',
    );
  }

  const ledger = data?.[method];
  const catalog = data?.catalog || { items: [], warehouses: [], batches: [], productionJobs: [] };

  const label = (type, id) => {
    const r = catalog[type]?.find((x) => x._id === id);
    return r?.sku || r?.code || r?.batchCode || r?.name || id;
  };

  const rows = (ledger?.rows || [])
    .filter((r) => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt));

  const cogsRows = (ledger?.rows || []).filter((r) => ['SALE', 'RETURN'].includes(r.type));
  const lossRows = (ledger?.rows || []).filter((r) => ['WRITE_OFF', 'EXPIRY'].includes(r.type));

  const tabs = ['dashboard', 'ledger', 'movements', 'reports', 'master data'];

  return (
    <div className="layout">
      <aside>
        <div className="brand">
          ▦ Stockbook
          <span>Inventory & Valuation System</span>
        </div>
        {tabs.map((t) => (
          <nav key={t}>
            <button
              className={tab === t ? 'active' : ''}
              onClick={() => {
                setTab(t);
                setError('');
                setNotice('');
              }}
            >
              {t}
            </button>
          </nav>
        ))}
        <p className="aside-note">
          Perpetual inventory engine.
          <br />
          FIFO & Moving Weighted Average.
          <br />
          Full journal recalculation.
        </p>
      </aside>

      <main>
        <header>
          <div>
            <small>OPERATIONS & FINANCE / INVENTORY</small>
            <h1>
              {tab === 'dashboard'
                ? 'Finance Dashboard'
                : tab === 'ledger'
                  ? 'Stock Ledger'
                  : tab === 'movements'
                    ? 'Stock Movements'
                    : tab === 'reports'
                      ? 'Inventory & Valuation Reports'
                      : 'Master Data Management'}
            </h1>
            <p>
              {tab === 'dashboard'
                ? 'Executive financial valuation, COGS, and WIP overview'
                : tab === 'ledger'
                  ? 'Perpetual stock movements and cost layer allocations'
                  : tab === 'movements'
                    ? 'Record receipts, sales, returns, transfers, write-offs, and production'
                    : tab === 'reports'
                      ? 'Comprehensive financial inventory statements and cost analysis'
                      : 'Maintain items, warehouses, batches, and production jobs'}
            </p>
          </div>
          <span>Revision {data?.revision ?? '—'}</span>
        </header>

        <div className="mobile-tabs">
          {tabs.map((t) => (
            <button
              key={t}
              className={tab === t ? 'active' : ''}
              onClick={() => {
                setTab(t);
                setError('');
                setNotice('');
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="error">
            <strong>Error: </strong>
            {error}
          </div>
        )}

        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}

        {/* 1. MASTER DATA TAB */}
        {tab === 'master data' && (
          <MasterData catalog={catalog} onSaved={saved} onError={setError} />
        )}

        {/* 2. MOVEMENTS TAB */}
        {tab === 'movements' && (
          <TransactionForm
            catalog={catalog}
            transactions={data?.transactions || []}
            onSaved={saved}
            onError={setError}
          />
        )}

        {/* 3. FINANCE DASHBOARD TAB */}
        {tab === 'dashboard' && (
          <>
            <section className="metrics">
              <article>
                <small>CLOSING INVENTORY VALUE</small>
                <strong>{data?.item?.closingValue ?? '—'}</strong>
                <span>Balance sheet asset valuation (Item Method)</span>
              </article>
              <article>
                <small>PERIOD COGS</small>
                <strong>{data?.item?.cogs ?? '—'}</strong>
                <span>Cost of Goods Sold (Sales minus Returns)</span>
              </article>
              <article>
                <small>PERIOD LOSSES</small>
                <strong>{data?.item?.writeOffs ?? '—'}</strong>
                <span>Damage write-offs & expired stock</span>
              </article>
              <article>
                <small>COMPANY WIP</small>
                <strong>{data?.item?.workInProgress ?? '—'}</strong>
                <span>Work-in-progress in open production jobs</span>
              </article>
            </section>

            {/* Valuation Method Comparison Matrix */}
            <section className="panel">
              <h2>Valuation Method Comparison (Side-by-Side Analysis)</h2>
              <p className="muted">
                Demonstrates how FIFO versus Weighted Average Costing impacts financial closing stock, cost of sales, and write-off valuations.
              </p>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Valuation Method</th>
                      <th>Closing Inventory Value</th>
                      <th>Period COGS</th>
                      <th>Period Losses</th>
                      <th>Company WIP</th>
                      <th>Variance vs Item Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>Item Settings (Hybrid Default)</strong>
                      </td>
                      <td>
                        <strong>{data?.item?.closingValue ?? '—'}</strong>
                      </td>
                      <td>{data?.item?.cogs ?? '—'}</td>
                      <td>{data?.item?.writeOffs ?? '—'}</td>
                      <td>{data?.item?.workInProgress ?? '—'}</td>
                      <td>Baseline (0.00)</td>
                    </tr>
                    <tr>
                      <td>
                        <span className="badge">FIFO</span> First-In First-Out
                      </td>
                      <td>
                        <strong>{data?.fifo?.closingValue ?? '—'}</strong>
                      </td>
                      <td>{data?.fifo?.cogs ?? '—'}</td>
                      <td>{data?.fifo?.writeOffs ?? '—'}</td>
                      <td>{data?.fifo?.workInProgress ?? '—'}</td>
                      <td>
                        {data?.fifo && data?.item
                          ? (Number(data.fifo.closingValue) - Number(data.item.closingValue)).toFixed(2)
                          : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="badge">WAC</span> Moving Weighted Average
                      </td>
                      <td>
                        <strong>{data?.wac?.closingValue ?? '—'}</strong>
                      </td>
                      <td>{data?.wac?.cogs ?? '—'}</td>
                      <td>{data?.wac?.writeOffs ?? '—'}</td>
                      <td>{data?.wac?.workInProgress ?? '—'}</td>
                      <td>
                        {data?.wac && data?.item
                          ? (Number(data.wac.closingValue) - Number(data.item.closingValue)).toFixed(2)
                          : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* WIP & Production Jobs Status */}
            <section className="panel">
              <h2>Work In Progress (WIP) & Production Jobs</h2>
              <p className="muted">
                Raw materials issued to production accumulate here until finished goods are booked.
              </p>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Job Code</th>
                      <th>Output Finished Good</th>
                      <th>Job Status</th>
                      <th>Accumulated Cost (WIP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.productionJobs.map((job) => {
                      const jobState = data?.item?.jobs?.find((j) => j._id === job._id);
                      return (
                        <tr key={job._id}>
                          <td>
                            <strong>{job.jobCode}</strong>
                          </td>
                          <td>{label('items', job.outputItemId)}</td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                background: jobState?.status === 'CLOSED' ? '#e2f3e9' : '#fff3cd',
                                color: jobState?.status === 'CLOSED' ? '#20573e' : '#856404',
                              }}
                            >
                              {jobState?.status || job.status || 'OPEN'}
                            </span>
                          </td>
                          <td>{jobState?.value || '0.00'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!catalog.productionJobs.length && (
                <p className="empty">No production jobs configured.</p>
              )}
            </section>

            {/* Current Asset Breakdown */}
            <section className="panel">
              <h2>Inventory Asset Value Summary</h2>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Type</th>
                      <th>Warehouse</th>
                      <th>Valuation</th>
                      <th>Quantity on Hand</th>
                      <th>Financial Asset Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.item?.balances.map((b) => {
                      const item = catalog.items.find((i) => i._id === b.itemId);
                      return (
                        <tr key={b.itemId + b.warehouseId}>
                          <td>
                            <strong>{item?.name || label('items', b.itemId)}</strong> ({item?.sku})
                          </td>
                          <td>
                            <span className="badge">{item?.type || 'ITEM'}</span>
                          </td>
                          <td>{label('warehouses', b.warehouseId)}</td>
                          <td>{b.valuationMethod}</td>
                          <td>
                            {b.quantity} {item?.baseUnit || ''}
                          </td>
                          <td>
                            <strong>{b.value}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* 4. STOCK LEDGER TAB */}
        {tab === 'ledger' && (
          <>
            <section className="panel filters">
              <label>
                From Date (Optional)
                <input
                  type="date"
                  value={query.from}
                  onChange={(e) => setQuery({ ...query, from: e.target.value })}
                />
              </label>
              <label>
                As Of Date
                <input
                  required
                  type="date"
                  value={query.asOf}
                  onChange={(e) => setQuery({ ...query, asOf: e.target.value })}
                />
              </label>
              <label>
                Item Filter
                <select
                  value={query.itemId}
                  onChange={(e) => setQuery({ ...query, itemId: e.target.value })}
                >
                  <option value="">All Items</option>
                  {catalog.items.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.sku} · {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Warehouse Filter
                <select
                  value={query.warehouseId}
                  onChange={(e) => setQuery({ ...query, warehouseId: e.target.value })}
                >
                  <option value="">All Warehouses</option>
                  {catalog.warehouses.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.code} · {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <div className="toolbar">
              <h2>Stock Ledger View</h2>
              <div className="switch">
                {['item', 'fifo', 'wac'].map((m) => (
                  <button
                    key={m}
                    className={m === method ? 'active' : ''}
                    onClick={() => setMethod(m)}
                  >
                    {m === 'item' ? 'Item Settings' : m === 'fifo' ? 'FIFO' : 'Weighted Average'}
                  </button>
                ))}
              </div>
            </div>

            <section className="metrics">
              {[
                ['Closing inventory', ledger?.closingValue],
                ['Period COGS', ledger?.cogs],
                ['Period losses', ledger?.writeOffs],
                ['Company WIP', ledger?.workInProgress],
              ].map(([name, value]) => (
                <article key={name}>
                  <small>{name}</small>
                  <strong>{value ?? '—'}</strong>
                  <span>Currency units · exact decimal</span>
                </article>
              ))}
            </section>

            <section className="panel">
              <h2>Stock on Hand</h2>
              <p className="muted">
                Opening inventory value: {ledger?.openingValue || '0'}. Physical stock is tracked by warehouse and batch.
              </p>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Warehouse</th>
                      <th>Quantity</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger?.balances.map((b) => (
                      <React.Fragment key={b.itemId + b.warehouseId}>
                        <tr>
                          <td>
                            <strong>{label('items', b.itemId)}</strong>
                          </td>
                          <td>{label('warehouses', b.warehouseId)}</td>
                          <td>{b.quantity}</td>
                          <td>{b.value}</td>
                        </tr>
                        {b.batches.map((batch, i) => (
                          <tr key={i}>
                            <td colSpan="2" className="muted" style={{ paddingLeft: 30 }}>
                              ↳ Batch {batch.batchId ? label('batches', batch.batchId) : 'Untracked'} · Expiry: {batch.expiryDate || 'None'}
                            </td>
                            <td>{batch.quantity}</td>
                            <td>—</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {!ledger?.balances.length && (
                <p className="empty">No stock on hand for the selected criteria.</p>
              )}
            </section>

            <section className="panel">
              <h2>Stock Movement Journal</h2>
              <input
                aria-label="Search ledger"
                placeholder="Filter by movement type, transaction ID, or reference…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Effective Time (UTC)</th>
                      <th>Movement</th>
                      <th>Item / Warehouse</th>
                      <th>Quantity</th>
                      <th>Cost / Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice((page - 1) * 25, page * 25).map((r) => (
                      <tr key={r.id}>
                        <td>{r.effectiveAt.replace('T', ' ').slice(0, 19)}</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background:
                                r.type === 'RECEIPT'
                                  ? '#e2f3e9'
                                  : r.type === 'SALE'
                                    ? '#dbeafe'
                                    : r.type === 'RETURN'
                                      ? '#fef3c7'
                                      : r.type.includes('WRITE_OFF') || r.type === 'EXPIRY'
                                        ? '#fee2e2'
                                        : '#eef3ef',
                            }}
                          >
                            {r.type}
                          </span>
                          <details>
                            <summary>Layer allocations</summary>
                            <code>ID: {r.transactionId || r.id}</code>
                            {r.allocations.map((a, i) => (
                              <p key={i}>
                                Layer {i + 1}: {a.quantity} units @ total cost {a.value}{' '}
                                {a.batchId && `(Batch: ${label('batches', a.batchId)})`}
                              </p>
                            ))}
                          </details>
                        </td>
                        <td>
                          <strong>{label('items', r.itemId)}</strong> / {label('warehouses', r.warehouseId)}
                        </td>
                        <td style={{ color: Number(r.quantity) < 0 ? '#b91c1c' : '#047857' }}>
                          {Number(r.quantity) > 0 ? `+${r.quantity}` : r.quantity}
                        </td>
                        <td>{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="toolbar">
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span>
                  Page {page} of {Math.max(1, Math.ceil(rows.length / 25))} · {rows.length} total movements
                </span>
                <button disabled={page * 25 >= rows.length} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
            </section>
          </>
        )}

        {/* 5. REPORTS TAB */}
        {tab === 'reports' && (
          <>
            <section className="panel filters">
              <label>
                From Date
                <input
                  type="date"
                  value={query.from}
                  onChange={(e) => setQuery({ ...query, from: e.target.value })}
                />
              </label>
              <label>
                To / As Of Date
                <input
                  required
                  type="date"
                  value={query.asOf}
                  onChange={(e) => setQuery({ ...query, asOf: e.target.value })}
                />
              </label>
              <label>
                Item Filter
                <select
                  value={query.itemId}
                  onChange={(e) => setQuery({ ...query, itemId: e.target.value })}
                >
                  <option value="">All Items</option>
                  {catalog.items.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.sku} · {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Warehouse Filter
                <select
                  value={query.warehouseId}
                  onChange={(e) => setQuery({ ...query, warehouseId: e.target.value })}
                >
                  <option value="">All Warehouses</option>
                  {catalog.warehouses.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.code} · {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <div className="toolbar">
              <div className="switch">
                <button
                  className={reportType === 'valuation' ? 'active' : ''}
                  onClick={() => setReportType('valuation')}
                >
                  Stock Valuation Report
                </button>
                <button
                  className={reportType === 'cogs' ? 'active' : ''}
                  onClick={() => setReportType('cogs')}
                >
                  Period COGS Report
                </button>
                <button
                  className={reportType === 'losses' ? 'active' : ''}
                  onClick={() => setReportType('losses')}
                >
                  Losses & Scrap Report
                </button>
              </div>

              <div className="switch">
                {['item', 'fifo', 'wac'].map((m) => (
                  <button
                    key={m}
                    className={m === method ? 'active' : ''}
                    onClick={() => setMethod(m)}
                  >
                    {m === 'item' ? 'Item Method' : m === 'fifo' ? 'FIFO' : 'Weighted Avg'}
                  </button>
                ))}
              </div>
            </div>

            {reportType === 'valuation' && (
              <section className="panel">
                <h2>Inventory Valuation Report ({method.toUpperCase()})</h2>
                <p className="muted">
                  Displays closing stock quantities, total valuation, and implied unit cost on {query.asOf}.
                </p>
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Item Name</th>
                        <th>Warehouse</th>
                        <th>Valuation Method</th>
                        <th>Closing Quantity</th>
                        <th>Implied Unit Cost</th>
                        <th>Total Valuation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger?.balances.map((b) => {
                        const itm = catalog.items.find((i) => i._id === b.itemId);
                        const qty = Number(b.quantity);
                        const val = Number(b.value);
                        const unitCost = qty > 0 ? (val / qty).toFixed(4) : '0.0000';
                        return (
                          <tr key={b.itemId + b.warehouseId}>
                            <td>
                              <strong>{itm?.sku || label('items', b.itemId)}</strong>
                            </td>
                            <td>{itm?.name || '—'}</td>
                            <td>{label('warehouses', b.warehouseId)}</td>
                            <td>{b.valuationMethod}</td>
                            <td>{b.quantity}</td>
                            <td>{unitCost}</td>
                            <td>
                              <strong>{b.value}</strong>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan="6">Total Valuation:</th>
                        <th>{ledger?.closingValue}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}

            {reportType === 'cogs' && (
              <section className="panel">
                <h2>Cost of Goods Sold (COGS) Report</h2>
                <p className="muted">
                  Sales issues and sales returns with exact restored layer costs.
                </p>
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Item</th>
                        <th>Warehouse</th>
                        <th>Quantity</th>
                        <th>Cost Recognized (COGS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cogsRows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.effectiveAt.slice(0, 10)}</td>
                          <td>
                            <span className="badge">{r.type}</span>
                          </td>
                          <td>{label('items', r.itemId)}</td>
                          <td>{label('warehouses', r.warehouseId)}</td>
                          <td>{r.quantity}</td>
                          <td>{r.type === 'RETURN' ? `-${r.value}` : r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan="5">Net Period COGS:</th>
                        <th>{ledger?.cogs}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {!cogsRows.length && <p className="empty">No sales or returns in this period.</p>}
              </section>
            )}

            {reportType === 'losses' && (
              <section className="panel">
                <h2>Inventory Losses & Scrap Report</h2>
                <p className="muted">
                  Scrapped items, damage write-offs, and automatic batch expiries.
                </p>
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Event</th>
                        <th>Item</th>
                        <th>Warehouse</th>
                        <th>Quantity Lost</th>
                        <th>Loss Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lossRows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.effectiveAt.slice(0, 10)}</td>
                          <td>
                            <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>
                              {r.type}
                            </span>
                          </td>
                          <td>{label('items', r.itemId)}</td>
                          <td>{label('warehouses', r.warehouseId)}</td>
                          <td>{r.quantity}</td>
                          <td>
                            <strong>{r.value}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan="5">Total Period Losses:</th>
                        <th>{ledger?.writeOffs}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {!lossRows.length && <p className="empty">No write-offs or expiries recorded.</p>}
              </section>
            )}
          </>
        )}

        <footer>
          UTC business dates · Perpetual inventory · FIFO & moving weighted average · Decimal-safe calculations
        </footer>
      </main>
    </div>
  );
}
