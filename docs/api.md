# REST API

Base path: `/api/v1`. JSON bodies and responses. Decimal quantities/costs are strings; UUID identifiers are strings.

| Method   | Path               | Purpose                                        |
| -------- | ------------------ | ---------------------------------------------- |
| GET/POST | /items             | Read/create items                              |
| PATCH    | /items/:id         | Change name or active flag                     |
| GET/POST | /warehouses        | Read/create warehouses                         |
| PATCH    | /warehouses/:id    | Change name or active flag                     |
| GET/POST | /batches           | Read/create immutable batch metadata           |
| GET/POST | /production-jobs   | Read/create jobs                               |
| POST     | /transactions      | Atomic multi-line posting                      |
| GET      | /transactions      | Filtered paginated source history              |
| GET      | /transactions/:id  | Source event and both cost allocations         |
| GET      | /reports/stock     | Closing stock with physical batches            |
| GET      | /reports/ledger    | Opening/closing balances and period movements  |
| GET      | /reports/valuation | Both valuations and supporting catalog/journal |
| GET      | /reports/cogs      | Sales and return cost movements                |
| GET      | /reports/losses    | Scrap/manual write-offs and expiry             |
| GET      | /health            | MongoDB readiness                              |

Queries: `asOf`, `from`, `to` (YYYY-MM-DD), `itemId`, `warehouseId`, `method=FIFO|WAC`; source history also accepts `page` and `limit` (maximum 100). `to` overrides `asOf`. Batches can be filtered by itemId.

Receipt body (replace UUID placeholders with actual IDs):

```json
{
  "requestId": "client-generated-uuid",
  "effectiveAt": "2026-01-01T12:00:00.000Z",
  "type": "RECEIPT",
  "lines": [
    {
      "_id": "client-generated-line-uuid",
      "itemId": "registered-item-uuid",
      "warehouseId": "registered-warehouse-uuid",
      "quantity": "10",
      "unitCost": "12.50"
    }
  ]
}
```

Returns add `referenceTransactionId` at transaction level and `originalSaleLineId` per line. Transfers add `destinationWarehouseId` per line. Production movements add `productionJobId`. Write-offs add a nonempty `reason`. Expiry-tracked incoming stock requires `batchId` referencing a registered batch. Unknown body fields are rejected.

Errors have `{code,message,details}`. Invalid input is 400, missing endpoint/record is 404, stock/reference/idempotency conflicts are 409, unexpected failures are 500 without exposing internal details. Identical retries return the original transaction (201). Never reuse a request ID for changed content.
