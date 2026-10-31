# Accounting policies

## Time and physical stock

UTC is the business timezone. Effective timestamps are canonical ISO strings with milliseconds. Expiry dates are the first unusable UTC day, at midnight. Before each movement and at the reporting cutoff, all due batches are written off chronologically.

Physical stock dispatch follows first-expiring-first-out (FEFO), with non-expiring batches last. The caller can explicitly select a batch. Physical batches are tracked separately from cost pools; batch identity does not force financial specific-identification costing.

## FIFO

Maintain ordered cost layers per item/warehouse. Issues consume oldest financial layers. Each partial allocation uses remaining layer value proportionally; complete depletion consumes the remaining value. Physical and financial allocations are zipped together for accurate partial returns. Transfers and returns create new destination/return-time layers.

## Weighted average

Maintain total quantity/value per item/warehouse. Receipts, transfers in and returns add their carrying cost to the pool. Outgoing cost is current pool value × issued quantity / pool quantity. Complete depletion consumes the whole remaining value. This is perpetual moving average, not periodic weighted average.

## Movement effects

| Movement         | Quantity                              | Value destination                                             |
| ---------------- | ------------------------------------- | ------------------------------------------------------------- |
| Receipt          | Increase                              | Quantity × receipt unit cost into inventory                   |
| Sale             | Decrease                              | Inventory to COGS                                             |
| Return           | Increase                              | Original sale allocation cost back to inventory; reverse COGS |
| Production issue | Decrease                              | Material inventory to job WIP                                 |
| Finished goods   | Increase                              | All job WIP to one output item                                |
| Write-off/scrap  | Decrease                              | Inventory to loss; reason mandatory                           |
| Expiry           | Decrease                              | Inventory to expiry loss                                      |
| Transfer         | Source decrease, destination increase | Carry cost across warehouses, no profit                       |

Production supports multiple input lines/issues, one finished item and one completion. Further issues/completions after closure are rejected. Each method carries its own WIP and output cost.

## Returns and expiry

Returns must reference the original sale and line and cannot exceed unreturned eligible quantity. Returned batches preserve original expiry. Original allocation cost is restored, even when current average or receipt prices differ. Damaged returns can be followed by a separate write-off.

Expired returns are restored and immediately written off at return time, not on the historical expiry date. Normal expiry losses occur at expiry midnight, even if the next user transaction is much later. Derived expiry IDs use date, pool, batch and occurrence; rerunning the same journal does not duplicate events. Backdating may legitimately restate these derived adjustments.

## Reporting

All source amounts and calculated report values are decimal strings. No binary floating-point arithmetic is used by the financial engine. Period COGS nets return reversals within that period; it can be negative. Loss reports exclude COGS. Opening balances precede the requested start day; closing balances include the entire cutoff day. WIP is company-wide. Inventory value is per cost pool; batch quantities have no separately assigned financial value under this design.
