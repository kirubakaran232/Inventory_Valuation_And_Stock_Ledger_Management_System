import { transaction, reportQuery } from '../validation/schemas.js';
export function createInventoryController(service) {
  return {
    post: async (req, res) => res.status(201).json(await service.post(transaction.parse(req.body))),
    report: (name) => async (req, res) => {
      const query = reportQuery.parse(req.query),
        report = await service.report(query);
      if (name === 'valuation') return res.json(report);
      const result = report[query.method.toLowerCase()];
      const rows =
        name === 'cogs'
          ? result.rows.filter((r) => ['SALE', 'RETURN'].includes(r.type))
          : name === 'losses'
            ? result.rows.filter((r) => ['WRITE_OFF', 'EXPIRY'].includes(r.type))
            : result.rows;
      res.json({ revision: report.revision, ...result, rows });
    },
  };
}
