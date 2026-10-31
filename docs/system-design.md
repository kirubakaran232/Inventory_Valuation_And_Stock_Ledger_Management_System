# System design

## Requirements

Maintain items, warehouses, batches, production jobs and an immutable stock journal. Support receipts, production issues/completion, sales/returns, loss, expiry and transfers. Produce item/warehouse/batch stock, FIFO and perpetual weighted average, period COGS/losses and opening/closing balances. Prevent negative historical stock, excess returns, duplicate posting and concurrent overselling.

Reliability requirements: decimal calculations, atomic operations, validated references, deterministic time order, auditable inputs and pure testable accounting logic. The first version uses full replay and serialized writes for simplicity.

## Collections and relationships

All primary keys are UUID strings in `_id`. MongoDB has no native foreign-key constraints; the repository validates references within the posting transaction.

| Collection        | Main fields                                                                                                | Constraints / references                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| items             | sku, name, type, baseUnit, expiryTracked, active                                                           | unique sku; RAW_MATERIAL or FINISHED_GOOD             |
| warehouses        | code, name, active                                                                                         | unique code                                           |
| batches           | itemId, batchCode, expiryDate                                                                              | itemId references items; unique itemId/batchCode      |
| productionJobs    | jobCode, outputItemId                                                                                      | unique jobCode; output references finished item       |
| stockTransactions | requestId, effectiveAt, sequence, recordedAt, type, referenceTransactionId, productionJobId, reason, lines | unique requestId; date/sequence and reference indexes |
| ledgerRevisions   | revision                                                                                                   | singleton `_id=ledger` serializes mutations           |

Embedded lines have `_id`, itemId, warehouseId, quantity, optional unitCost, batchId, destinationWarehouseId and originalSaleLineId. Quantities and input costs are stored as Decimal128, serialized as strings. Immutable catalog fields prevent retrospective changes to batch expiry, units or item accounting type. Master names/active flags may change.

Derived balances, cost layers, sale allocations, job status and expiry adjustments are not independently editable or persisted. Reports read the journal, master records and revision under one MongoDB snapshot transaction.

## Posting flow

Validate shape → acquire revision inside MongoDB transaction → check idempotency → validate references → enrich journal with batch expiry → sort by UTC effective timestamp and sequence → replay FIFO and WAC → insert event → commit.

All writers, including master changes, contend on the same revision document. MongoDB driver transaction retries resolve write conflicts. A failed replay rolls back the revision and all candidate lines. Identical request IDs and payloads return the original result; different payloads conflict.

## Backdating

Rebuild both methods from source transactions, including events after the inserted transaction. This propagates through WIP, finished goods, transfers, sales and returns. Any later invalid state rejects the new transaction. Same-time events use posting sequence. Future-dated entries are permitted and validated, but excluded from earlier reports.

Full replay avoids missing cross-item or cross-warehouse dependencies. At larger scale, use revisioned checkpoints and dependency-aware invalidation; do not introduce independent mutable balance fields.

## Financial invariants

Opening inventory + opening WIP + receipt cost = closing inventory + closing WIP + net COGS + losses.

Transfers preserve company quantity/value. Production moves value through WIP without creating profit. Returns restore original allocated cost. Depletion consumes the entire remaining layer or average-pool value. Inputs allow up to six decimal places and twelve integer digits; calculations retain 40 significant digits.

## Limitations and interview discussion

There is no closed-period restriction or general reversal workflow. Backdating restates historical reports. No auth is included in this local interview project. Write serialization limits throughput. Report generation is full replay, including catalog enrichment; a large journal will require pagination at storage level and snapshots. Exact decimal results can be long; display rounding must never feed back into postings.
