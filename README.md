# ▦ Stockbook — Perpetual Inventory & Valuation System

<p align="center">
  <img src="https://img.shields.io/badge/Architecture-Event--Sourced%20Perpetual%20Ledger-153e35?style=for-the-badge" alt="Architecture" />
  <img src="https://img.shields.io/badge/Node.js-20%2B%20%2F%2022%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/React-19%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/MongoDB-Port%2027017-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Math-40--Digit%20Decimal%20Precision-blue?style=for-the-badge" alt="Precision" />
</p>

---

## 📌 At a Glance

| What it does | Why it's different | Core Tech |
|---|---|---|
| Tracks every inventory movement and calculates asset valuation in real-time. | **Dual Valuation**: Runs **FIFO** and **Moving Weighted Average** side-by-side. | **React 19**, **Express 5**, **MongoDB**, **Decimal.js** |
| Manages **Receipts**, **Sales**, **Production WIP**, **Returns**, and **Write-offs**. | **Backdating Engine**: Inserting an old receipt automatically recalculates all future COGS & balances. | Event-sourced replay engine (deterministic timeline) |
| Enforces physical batch shelf-life (**FEFO**). | **Traceable Returns**: Restores original cost layer without altering past market rates. | Zero floating-point math; 40-digit decimal safety |

---

## 🎯 6 Core Capabilities

```
  ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
  │ 1. Dual FIFO/WAC│       │ 2. Real-Time WIP│       │ 3. FEFO Expiry  │
  │ Valuation Engine│       │   Absorption    │       │ Batch Tracking  │
  └────────┬────────┘       └────────┬────────┘       └────────┬────────┘
           │                         │                         │
  ┌────────▼────────┐       ┌────────▼────────┐       ┌────────▼────────┐
  │ 4. Backdated    │       │ 5. Traceable    │       │ 6. Zero Decimal │
  │ Replay Engine   │       │ Sales Returns   │       │ Floating Drift  │
  └─────────────────┘       └─────────────────┘       └─────────────────┘
```

| Feature | How It Works | Business Value |
|---|---|---|
| **Dual Valuation** | Configurable per item (`FIFO` or `WAC`); calculates both methods simultaneously. | Compare tax and margin impacts between FIFO and WAC in real-time. |
| **Production & WIP** | Issues raw materials to a Job (`Company WIP`), absorbed into finished goods on completion. | True manufacturing cost tracking without external spreadsheets. |
| **Batch Expiry (FEFO)** | Batches track expiry dates. Items past their date automatically book an `EXPIRY` loss. | Prevents selling expired goods; isolates financial cost pools from physical lots. |
| **Backdated Replay** | Journal entries sort by effective date. Inserting a past receipt re-values all downstream events. | Fix late supplier invoices without corrupting historical journal integrity. |
| **Traceable Returns** | Sales returns link to the exact original sale line and restore its original cost layer. | Eliminates COGS distortion caused by arbitrary return cost assumptions. |
| **Decimal Precision** | 40-digit decimal arithmetic via `Decimal.js` (`ROUND_HALF_UP`). | Guarantees Balance Sheet debits equal credits ($0.1 + 0.2 = 0.3$). |

---

## 🔄 Supported Stock Movement Types

| Movement | Direction | Inventory Impact | Financial Impact | Required Details |
|:---:|:---:|---|---|---|
| 🟢 **`RECEIPT`** | **IN** | Increases stock on hand | Adds new FIFO layer / updates WAC average | Quantity, `unitCost`, optional Batch |
| 🔵 **`SALE`** | **OUT** | Decreases stock on hand | Relieves oldest layer / current WAC into **COGS** | Quantity, Item, Warehouse |
| 🟡 **`RETURN`** | **IN** | Restores stock to warehouse | **Decreases COGS**; restores original cost layer | `referenceTransactionId`, `originalSaleLineId` |
| 🟠 **`PRODUCTION_ISSUE`** | **OUT** | Decreases raw materials | Increases **Company WIP** asset | `productionJobId`, Raw Material Item |
| 🟣 **`FINISHED_GOODS`** | **IN** | Increases finished goods | Clears WIP; absorbs accumulated material cost | `productionJobId`, Output Item |
| 🔴 **`WRITE_OFF`** | **OUT** | Decreases stock on hand | Recognizes **Period Loss** (scrap/spoilage) | Quantity, mandatory `reason` |
| ⚪ **`TRANSFER`** | **MOVE** | Moves stock between locations | Zero net value change; preserves cost allocations | Source & Destination Warehouses |

---

## 🖥 The 5 System Modules

<details open>
<summary><b>1. 📊 Finance Dashboard</b></summary>

- **Executive KPI Cards**: Real-time **Closing Inventory**, **Period COGS**, **Period Losses**, and **Company WIP**.
- **Valuation Comparison Matrix**: Side-by-side comparison of **FIFO** vs. **WAC** vs. **Item Default** showing balance sheet variance.
- **Production & WIP Tracker**: Live status of all production jobs with total accumulated raw material costs.
- **Asset Summary Table**: Instant breakdown of stock values across warehouses.
</details>

<details open>
<summary><b>2. 📜 Stock Ledger</b></summary>

- **Perpetual Journal**: Complete chronological history of every transaction with signed quantities and financial values.
- **Allocation Layer Inspector**: Expand any transaction to see the exact purchase layers, unit costs, and batches consumed.
- **Stock on Hand Table**: Current inventory counts with batch numbers and expiry dates.
</details>

<details>
<summary><b>3. ⚡ Stock Movements</b></summary>

- Unified interface to record all 7 movement types.
- **Smart Validation**:
  - Restricts production issues to Raw Materials.
  - Automatically selects finished good output for completed jobs.
  - Pulls original sale lines and quantities for sales returns.
  - Rejects transactions that would lead to negative stock.
</details>

<details>
<summary><b>4. 📈 Valuation & Financial Reports</b></summary>

- Filter by **Date Range (From / To)**, **Item**, **Warehouse**, and **Valuation Method**.
- **3 Tabular Reports**:
  1. *Stock Valuation Statement*: Quantities, implied average unit costs, and total valuation.
  2. *Period COGS Report*: Sales issues and returns with net recognized cost of sales.
  3. *Losses & Scrap Report*: Damaged stock, scrap write-offs, and batch expiries.
</details>

<details>
<summary><b>5. 🗄 Master Data</b></summary>

- **Items**: Create, edit, and deactivate items with valuation rules (`FIFO` or `WAC`) and expiry tracking toggles.
- **Warehouses**: Manage multi-warehouse storage locations.
- **Batches**: Register lot numbers with first unusable dates.
- **Production Jobs**: Define manufacturing jobs linking raw materials to finished goods.
</details>

---

## ⚡ Quickstart (Run in 2 Minutes)

### Step 1: Clone & Install
```powershell
cd inventory
npm install
```

### Step 2: Seed Sample Data
Ensure your local MongoDB is running on port **`27017`**, then run:
```powershell
cd server
npm run seed:workflow
```
> [!NOTE]
> This creates 4 sample items, issues raw materials, bakes finished goods, executes sales, processes returns, writes off damaged stock, and executes a **backdated purchase** to demonstrate automatic revaluation.

### Step 3: Start the App
From the root directory:
```powershell
npm run dev
```
- 🌐 **Web App**: Open [**http://127.0.0.1:5173**](http://127.0.0.1:5173)
- 🔌 **API Server**: Running on [**http://127.0.0.1:3001**](http://127.0.0.1:3001)

---

## 🔢 Step-by-Step Mathematical Walkthrough

Here is the exact numerical flow executed by the workflow seed:

```
[Day 27: Buy 10kg Wheat @ $20] ──┐
                                 ├─► [Avg: $25.00/kg] ─► Issue 6kg to Bake Job ─► [$150 WIP]
[Day 28: Buy 10kg Wheat @ $30] ──┘                                                      │
                                                                                        ▼
[Day 29: Complete Bake Job] ◄───────────────────────────────────────────────────────────┘
   └─► Output: 3 Bread Packs @ $50.00/pack (absorbed $150 WIP)
   └─► Sell 1 Pack @ Counter ─────────► COGS: $50.00
   └─► Customer Returns 1 Pack ───────► COGS: -$50.00 (Restored to stock @ $50.00)
   └─► Damaged in Counter ────────────► Write-Off Loss: $50.00

⭐ THE BACKDATED EVENT (Entered last, dated Day 26):
   Buy 5kg Wheat @ $10/kg
   └─► Replay Engine triggers!
   └─► Wheat Average drops: $25.00/kg ──► $20.00/kg
   └─► Bake Job WIP drops:  $150.00   ──► $120.00
   └─► Bread Unit Cost:     $50.00    ──► $40.00
   └─► Downstream COGS and Ending Valuations update automatically!
```

### Comparison Table for Sample Dataset

| Metric | Item Default | FIFO Valuation | WAC Valuation |
|---|:---:|:---:|:---:|
| **Closing Inventory** | **\$900.00** | **\$920.00** | **\$895.00** |
| **Period COGS** | **\$645.00** | **\$615.00** | **\$650.00** |
| **Period Losses** | **\$135.00** | **\$140.00** | **\$135.00** |
| **Company WIP** | **\$0.00** (Job Closed) | **\$0.00** | **\$0.00** |

---

## 🔌 REST API Reference

| Endpoint | Method | Purpose |
|---|:---:|---|
| `/api/v1/health` | `GET` | Health check & MongoDB ping |
| `/api/v1/items` | `GET` / `POST` | List or create catalog items (FIFO/WAC) |
| `/api/v1/items/:id` | `PATCH` / `DELETE` | Update or delete item (deletions blocked if historical transactions exist) |
| `/api/v1/warehouses` | `GET` / `POST` / `DELETE` | Manage storage facilities |
| `/api/v1/batches` | `GET` / `POST` | Track item batches with expiry dates |
| `/api/v1/production-jobs` | `GET` / `POST` | Production jobs and live WIP statuses |
| `/api/v1/transactions` | `POST` | Post an immutable stock movement |
| `/api/v1/transactions` | `GET` | Query perpetual journal with date/item filters |
| `/api/v1/reports/valuation` | `GET` | Multi-method valuation summary (`fifo`, `wac`, `item`) |
| `/api/v1/reports/cogs` | `GET` | Cost of Goods Sold analysis |
| `/api/v1/reports/losses` | `GET` | Scrap write-offs and batch expiry losses |

---

## 🛠 Technology Stack

- **Frontend**: React 19, Vite, Pure CSS (Zero UI library dependencies)
- **Backend**: Node.js (ES Modules), Express 5
- **Database**: MongoDB 6.0+ (Port 27017, Standalone or Replica Set compatible)
- **Validation**: Zod 4 runtime schema enforcement
- **Math Engine**: Decimal.js (40-digit decimal-safe calculation core)
- **Testing**: Node.js built-in test runner (`node --test`)

---

<p align="center">
  <b>Stockbook Inventory & Valuation Platform</b> · Enterprise-Grade Accounting Engine
</p>
