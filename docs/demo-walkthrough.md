# Simple grocery-shop example

One item: **Rice (sample)**, measured in kilograms. One warehouse: **Sample grocery shop**. These are illustrative costs in INR, not live market prices. Clear all ledger filters and choose October 31, 2026 to see all five movements.

| Date       | Movement                 | Quantity |            Purchase cost |
| ---------- | ------------------------ | -------: | -----------------------: |
| October 27 | Purchase rice            |    10 kg |                   ₹50/kg |
| October 28 | Purchase rice            |    10 kg |                   ₹60/kg |
| October 29 | Sell to a customer       |    12 kg |   Calculated by FIFO/WAC |
| October 30 | Customer returns rice    |     1 kg |       Original sale cost |
| October 31 | Damaged rice written off |     1 kg | Calculated carrying cost |

**Remaining stock: 8 kg.** Selling prices are not included: this project calculates stock cost and COGS, not revenue.

To explain FIFO versus weighted average, first select October 29:

- FIFO: issue 10 kg at ₹50 and 2 kg at ₹60. COGS = ₹620; closing stock = ₹480.
- Weighted average: ₹1,100 / 20 kg = ₹55/kg. COGS = ₹660; closing stock = ₹440.

After the return and damaged-stock write-off on October 31:

| Result            | FIFO | Weighted average |
| ----------------- | ---: | ---------------: |
| Closing inventory | ₹470 |             ₹440 |
| Net COGS          | ₹570 |             ₹605 |
| Write-off loss    |  ₹60 |              ₹55 |

FIFO returns restore original sale cost and enter at the return date, so the damaged kilogram consumes an older ₹60 layer. Both methods reconcile: closing inventory + net COGS + loss = ₹1,100 purchase cost.

Run `npm run seed:demo` to add these five sample transactions safely on a fresh database. Repeating the command does not duplicate them. The previous larger mock dataset was backed up under `.local/` before its requested replacement. Normal seeding does not delete anything.
