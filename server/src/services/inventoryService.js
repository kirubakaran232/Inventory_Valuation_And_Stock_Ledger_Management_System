import { replay } from '../domain/replay.js';
import { D, sum } from '../domain/money.js';
const enrich = (transactions, catalog) =>
  transactions.map((tx) => ({
    ...tx,
    lines: tx.lines.map((l) => ({
      ...l,
      expiryDate: catalog.batches.find((b) => b._id === l.batchId)?.expiryDate,
    })),
  }));
const end = (date) => `${date}T23:59:59.999Z`;
export function createInventoryService(repository) {
  return {
    repository,
    async post(input) {
      return repository.append(input, (transactions, catalog) => {
        const events = enrich(transactions, catalog);
        replay(events, 'FIFO');
        replay(events, 'WAC');
        replay(
          events,
          'ITEM',
          undefined,
          Object.fromEntries(catalog.items.map((i) => [i._id, i.valuationMethod || 'FIFO'])),
        );
      });
    },
    async report(query) {
      const snapshot = await repository.snapshot();
      const cutoff = end(query.to || query.asOf || new Date().toISOString().slice(0, 10));
      const events = enrich(snapshot.transactions, snapshot.catalog);
      const itemMethods = Object.fromEntries(
        snapshot.catalog.items.map((i) => [i._id, i.valuationMethod || 'FIFO']),
      );
      const matches = (r) =>
        (!query.itemId || r.itemId === query.itemId) &&
        (!query.warehouseId || r.warehouseId === query.warehouseId);
      const project = (method) => {
        const closing = replay(events, method, cutoff, itemMethods);
        const opening = query.from
          ? replay(
              events,
              method,
              new Date(Date.parse(`${query.from}T00:00:00.000Z`) - 1).toISOString(),
              itemMethods,
            )
          : null;
        const rows = closing.rows.filter(
          (r) => matches(r) && (!query.from || r.effectiveAt >= `${query.from}T00:00:00.000Z`),
        );
        const balances = closing.balances.filter(matches);
        return {
          ...closing,
          balances,
          openingBalances: (opening?.balances || []).filter(matches),
          rows,
          closingValue: sum(balances.map((b) => b.value)).toString(),
          openingValue: sum(
            (opening?.balances || []).filter(matches).map((b) => b.value),
          ).toString(),
          cogs: sum(
            rows
              .filter((r) => ['SALE', 'RETURN'].includes(r.type))
              .map((r) => D(r.value).mul(r.type === 'RETURN' ? -1 : 1)),
          ).toString(),
          writeOffs: sum(
            rows.filter((r) => ['WRITE_OFF', 'EXPIRY'].includes(r.type)).map((r) => r.value),
          ).toString(),
        };
      };
      const fifo = project('FIFO');
      const wac = project('WAC');
      const item = project('ITEM');
      return {
        revision: snapshot.revision,
        catalog: {
          ...snapshot.catalog,
          productionJobs: snapshot.catalog.productionJobs.map((job) => ({
            ...job,
            status: fifo.jobs.find((state) => state._id === job._id)?.status || 'OPEN',
          })),
        },
        transactions: snapshot.transactions,
        fifo,
        wac,
        item,
      };
    },
  };
}
