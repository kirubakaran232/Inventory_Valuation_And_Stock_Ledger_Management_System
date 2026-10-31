# ▦ Stockbook — Perpetual Inventory & Valuation System

> **Enterprise-grade, event-sourced perpetual inventory and financial valuation platform.**
> Built with **Node.js, Express, React, and MongoDB**, featuring independent **FIFO** and **Moving Weighted Average (WAC)** valuation engines, physical batch-expiry tracking (FEFO), production Work-In-Progress (WIP) absorption, and automatic retroactive backdating revaluation.

---

## 📑 Table of Contents
1. [Executive Summary](#-executive-summary)
2. [Core Capabilities & Features](#-core-capabilities--features)
3. [Financial Valuation Engine Explained](#-financial-valuation-engine-explained)
4. [System Architecture](#-system-architecture)
5. [The 5 UI Modules](#-the-5-ui-modules)
6. [Quickstart & Running Locally](#-quickstart--running-locally)
7. [Comprehensive Workflow & Mathematical Example](#-comprehensive-workflow--mathematical-example)
8. [API Reference](#-api-reference)
9. [Tech Stack & Precision Standards](#-tech-stack--precision-standards)

---

## 🏛 Executive Summary

Traditional inventory systems suffer from two fatal flaws:
1. **Floating-Point Rounding Drift**: Binary IEEE 754 math corrupts ledger balance sheets over time ($0.1 + 0.2 \ne 0.3$).
2. **Destructive Historical Updates**: Inability to record backdated deliveries or supplier invoice adjustments without corrupting historical cost layers and Cost of Goods Sold (COGS).

**Stockbook** solves these challenges using an immutable, journal-driven architecture:
- Every stock movement is recorded as an immutable business event.
- An in-memory, deterministic **accounting replay engine** recalculates all cost layers, COGS, write-offs, and closing balances in chronological order.
- Entering a transaction effective in the past automatically recomputes all downstream valuations while maintaining exact audit trails.
- All financial calculations execute using **40-digit decimal-safe arithmetic**.

---

## ⚡ Core Capabilities & Features

### 1. Dual Accounting Valuation (FIFO & WAC)
- Each item can be configured with either **FIFO** (First-In, First-Out) or **WAC** (Moving Weighted Average Cost).
- The system simultaneously computes the entire ledger under **both methods**, providing instant executive side-by-side financial comparison matrices.

### 2. Complete Stock Movement Spectrum (7 Movement Types)
- **`RECEIPT`**: Inward purchase from suppliers with explicit unit cost; creates new purchase layers (FIFO) or updates moving average unit cost (WAC).
- **`PRODUCTION_ISSUE`**: Issues raw materials into an active production job, moving material cost out of raw inventory and into **Company WIP**.
- **`FINISHED_GOODS`**: Completes a production job, booking finished goods that absorb 100% of the accumulated raw material cost.
- **`SALE`**: Delivers finished goods or items to customers, relieving oldest FIFO layers or current moving average cost into **Period COGS**.
- **`RETURN`**: Customer sales return; references the exact original sale line and restores the original purchase cost layer back into inventory, crediting COGS.
- **`WRITE_OFF`**: Records damaged, lost, or scrapped stock with a mandatory business reason, recognizing **Period Losses**.
- **`TRANSFER`**: Transfers stock between warehouses without price or cost distortion.

### 3. Traceable Sales Returns
When goods are returned by customers, Stockbook does not make assumptions about current market price:
- It looks up the original sale line.
- Identifies the exact cost layer and batch allocated during the original sale.
- Restores that specific cost layer into inventory and reduces net Period COGS accordingly.

### 4. Automatic Batch Expiry Tracking (FEFO)
- Separation of concerns: **Physical logistics uses FEFO** (First-Expired, First-Out) while **financial accounting uses FIFO/WAC**.
- When an expiry-tracked batch reaches its expiry date, the engine automatically books an `EXPIRY` loss transaction, zeros out remaining physical units, and moves the asset value into **Period Losses**.

### 5. Retrospective Backdated Posting
- If an invoice or receipt dated 3 days ago is posted today, the engine re-sorts the global journal by effective date and replays all subsequent issues, production absorptions, and sales.
- Downstream COGS and ending balances update to reflect true historical reality.

### 6. Strict Data Validation & Idempotency
- **Zero Negative Stock**: Movements that would cause stock to drop below zero at any point in time are rejected (`INSUFFICIENT_STOCK`).
- **Idempotent API**: Repeated requests with the same `requestId` return the original transaction without duplicate postings.
- **Referential Integrity**: Inactive items, non-existent warehouses, or mismatched production jobs are strictly blocked before journal insertion.

---

## 🧮 Financial Valuation Engine Explained

Stockbook maintains independent financial cost pools for each `(Item, Warehouse)` pair:

### FIFO (First-In, First-Out)
$$\text{Inventory Value} = \sum_{i=1}^{n} (\text{Quantity}_i \times \text{UnitCost}_i)$$
When stock is issued (sold, transferred, or scrapped), the engine depletes the oldest available purchase layer first. If an issue spans multiple purchase layers, it creates multiple deterministic allocation rows.

### Moving Weighted Average Cost (WAC)
Upon every inward receipt:
$$\text{New Average Cost} = \frac{\text{Current Inventory Value} + (\text{Received Quantity} \times \text{Received Unit Cost})}{\text{Current Quantity} + \text{Received Quantity}}$$
All subsequent issues are valued at this exact moving average rate until the next receipt occurs. When stock is fully depleted, the engine ensures inventory value reaches exactly `0.00` with zero residual fractions.

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       React Frontend                        │
│   Dashboard  │  Stock Ledger  │  Movements  │  Reports      │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON REST API
┌──────────────────────────────▼──────────────────────────────┐
│                    Express.js API Server                    │
│   Route Layer  │  Zod Validation  │  Error Middleware       │
└──────────────────────────────┬──────────────────────────────┘
                               │ Service Orchestration
┌──────────────────────────────▼──────────────────────────────┐
│               Deterministic Replay Domain Engine            │
│   ├── Chronological Timeline Sorter                         │
│   ├── FIFO Cost Layer Allocator (fifo.js)                   │
│   ├── Moving WAC Calculator (weightedAverage.js)            │
│   ├── FEFO Expiry Processor (expiry.js)                     │
│   └── 40-Digit Decimal Math Core (Decimal.js)               │
└──────────────────────────────┬──────────────────────────────┘
                               │ Atomic Ledger Append
┌──────────────────────────────▼──────────────────────────────┐
│                   MongoDB Database (Port 27017)             │
│   ├── stockTransactions (Event Store)                       │
│   ├── ledgerRevisions   (Sequence Lock)                     │
│   └── Master Collections (items, warehouses, batches, jobs) │
└─────────────────────────────────────────────────────────────┘
```

---

## 🖥 The 5 UI Modules

The frontend is organized into 5 focused tabs:

### 1. Finance Dashboard
- **Executive Metric Cards**: Real-time **Closing Inventory**, **Period COGS**, **Period Losses**, and **Company WIP**.
- **Valuation Comparison Matrix**: Side-by-side comparison of **FIFO** vs. **Weighted Average Cost (WAC)** vs. **Item Default**, displaying asset variance.
- **Production & WIP Tracker**: Live status of all production jobs with total raw materials absorbed.
- **Asset Valuation Summary**: Tabular breakdown of asset value per item and warehouse.

### 2. Stock Ledger
- **Perpetual Journal**: Complete chronological record of every receipt, sale, return, issue, transfer, and write-off.
- **Layer Allocation Breakdown**: Expand any row to see exact purchase cost layers, unit costs, and batch origins.
- **Stock on Hand Table**: Current on-hand quantities, physical batches, and expiry dates.
- Instant search and pagination.

### 3. Stock Movements
- Unified form to post all 7 transaction types.
- Context-aware validation:
  - Automatically filters items to raw materials for production issues.
  - Automatically populates output finished goods for jobs.
  - Pulls original sale lines and quantities for sales returns.
  - Mandates scrap reasons for write-offs.

### 4. Valuation & Financial Reports
- Complete reporting filters: **From Date**, **To / As-Of Date**, **Item**, **Warehouse**, and **Valuation Method**.
- Three dedicated reports:
  1. **Stock Valuation Report**: Units on hand, implied average unit cost, total valuation.
  2. **Period COGS Report**: Sales issues and returns with net recognized cost of sales.
  3. **Losses & Scrap Report**: Damaged stock, scrap write-offs, and batch expiries.

### 5. Master Data
- Full lifecycle management (Create, View, Edit, Deactivate, Delete) for:
  - **Items**: SKU, name, type (Raw Material vs Finished Good), base unit, and Valuation Method (`FIFO` or `WAC`).
  - **Warehouses**: Code, name, and active status.
  - **Batches**: Batch code, item association, and first unusable date.
  - **Production Jobs**: Job code and output finished good.

---

## 🚀 Quickstart & Running Locally

### Prerequisites
- **Node.js** version `20+` or `22+`
- **MongoDB** running locally on port **`27017`** (standard local service or MongoDB Compass)

### 1. Clone & Install Dependencies
```powershell
# Navigate to project folder
cd "inventory"

# Install all workspace dependencies
npm install
```

### 2. Environment Configuration
The server connects to your local MongoDB instance. Inspect `server/.env`:
```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DATABASE=stockbook
PORT=3001
```

### 3. Seed Comprehensive Demonstration Data
Run the workflow seed script to populate realistic sample data:
```powershell
cd server
npm run seed:workflow
```
*This populates 4 items, sets up FIFO and WAC rules, issues raw materials, bakes finished goods, sells stock, performs returns, records write-offs, triggers batch expiries, and posts a backdated purchase.*

### 4. Launch the Full Application
From the project root:
```powershell
npm run dev
```
- **Web UI**: Open **http://127.0.0.1:5173** in your browser.
- **API Server**: Listening on **http://127.0.0.1:3001**.

---

## 📊 Comprehensive Workflow & Mathematical Example

The automated seed scenario demonstrates how financial valuations behave in practice:

### 1. Raw Material with WAC (`DEMO-WHEAT`)
- **Day 27**: Purchase 10 kg @ \$20/kg $\rightarrow$ Inventory: 10 kg, Value: \$200 (Avg: \$20.00)
- **Day 28**: Purchase 10 kg @ \$30/kg $\rightarrow$ Inventory: 20 kg, Value: \$500 (Avg: \$25.00)
- **Day 28**: Issue 6 kg to Production Job `DEMO-BAKE-001` $\rightarrow$ 6 kg @ \$25.00 = **\$150.00 transferred to WIP**. Remaining: 14 kg @ \$25.00 = \$350.
- **Day 29**: Sale of 4 kg $\rightarrow$ COGS: 4 kg @ \$25.00 = **\$100.00**. Remaining: 10 kg @ \$25.00 = \$250.
- **Day 30**: Write-off 1 kg damaged $\rightarrow$ Loss: 1 kg @ \$25.00 = **\$25.00**. Remaining: 9 kg = \$225.

### 2. Finished Goods Production (`DEMO-BREAD` - FIFO)
- **Day 29**: Complete Job `DEMO-BAKE-001` $\rightarrow$ Output 3 bread packs.
  - Absorbs \$150.00 WIP cost $\rightarrow$ Unit cost: **\$50.00 per pack**.
- **Day 30**: Transfer 1 bread pack to Bakery Counter warehouse.
- **Day 30**: Sell 1 bread pack from counter $\rightarrow$ COGS: **\$50.00**.
- **Day 31**: Customer returns 1 bread pack $\rightarrow$ COGS reduced by **-\$50.00**, 1 pack restored to inventory @ \$50.00.
- **Day 31**: Write off damaged return $\rightarrow$ Loss recognized: **\$50.00**.

### 3. FIFO Finished Goods (`DEMO-COFFEE`)
- **Day 27**: Purchase 10 kg @ \$50/kg (Layer 1 = \$500)
- **Day 28**: Purchase 10 kg @ \$65/kg (Layer 2 = \$650)
- **Day 29**: Sell 12 kg:
  - Depletes Layer 1: 10 kg @ \$50 = \$500
  - Depletes Layer 2: 2 kg @ \$65 = \$130
  - Total COGS: **\$630.00**. Ending Stock: 8 kg @ \$65 = **\$520.00**.
- **Day 30**: Return 1 kg $\rightarrow$ Restores Layer 2 @ \$65. COGS adjusted to **\$565.00**.

### 4. The Backdated Posting Test
- **Entered last with effective date Day 26**: Purchase 5 kg `DEMO-WHEAT` @ \$10/kg.
- **What happens**:
  - The engine retroactively places this receipt before the Day 27 receipt.
  - The moving average for `DEMO-WHEAT` automatically drops from \$25.00 to **\$20.00**.
  - The 6 kg production issue cost drops from \$150.00 to **\$120.00**.
  - The finished goods bread cost drops from \$50.00/pack to **\$40.00/pack**.
  - Wheat COGS and write-offs recompute downwards.
  - Closing inventory reflects exact mathematical reality across the entire journal.

---

## 📡 API Reference

Base URL: `/api/v1`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health and database ping check |
| `GET` | `/items` | List catalog items |
| `POST` | `/items` | Create new item (`sku`, `name`, `type`, `valuationMethod`, `baseUnit`) |
| `PATCH` | `/items/:id` | Update item details (name, sku, or active status) |
| `DELETE` | `/items/:id` | Delete item (prevented if referenced by historical transactions) |
| `GET` | `/warehouses` | List warehouses |
| `POST` | `/warehouses` | Create warehouse (`code`, `name`) |
| `DELETE` | `/warehouses/:id` | Delete warehouse |
| `GET` | `/batches` | List inventory batches with expiry dates |
| `POST` | `/batches` | Register batch (`itemId`, `batchCode`, `expiryDate`) |
| `GET` | `/production-jobs`| List production jobs and live WIP statuses |
| `POST` | `/production-jobs`| Register production job (`jobCode`, `outputItemId`) |
| `POST` | `/transactions` | Record a stock movement (`requestId`, `effectiveAt`, `type`, `lines`) |
| `GET` | `/transactions` | List all transactions with date and warehouse filtering |
| `GET` | `/reports/valuation` | Full multi-method valuation snapshot (`fifo`, `wac`, `item`) |
| `GET` | `/reports/cogs` | Filtered Cost of Goods Sold report |
| `GET` | `/reports/losses` | Filtered Scrap and Expiry losses report |

---

## 🛠 Tech Stack & Precision Standards

| Component | Technology | Role |
|---|---|---|
| **Backend** | Node.js (ES Modules) + Express 5 | High-performance API server |
| **Frontend** | React 19 + Vite | Responsive, zero-latency SPA |
| **Database** | MongoDB 6.0+ (Port 27017) | Event store and catalog persistence |
| **Validation** | Zod 4 | Strict runtime schema enforcement |
| **Financial Math** | Decimal.js (`precision: 40`) | 40-digit decimal-safe calculation engine |
| **Styling** | Modular Vanilla CSS | Clean, responsive design |

---

## ⚖️ License
Internal Proprietary Enterprise System — Stockbook Accounting & Valuation Engine.
All rights reserved.


#   I n v e n t o r y _ V a l u a t i o n _ A n d _ S t o c k _ L e d g e r _ M a n a g e m e n t _ S y s t e m  
 