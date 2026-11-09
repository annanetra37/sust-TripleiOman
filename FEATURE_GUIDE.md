# Triple I ESG Portal — Feature Guide

*For users, admins, and the AI assistant.*

---

## 1. Platform Overview

Triple I ESG Portal is a sustainability management and reporting platform that:
- **Collects** environmental (E1) and social (S1) data from Excel uploads, AI document extraction (invoices, receipts, utility bills), and database connections
- **Calculates** product carbon footprints (PCF) with Monte Carlo uncertainty
- **Reports** against 8+ international standards (GRI, ESRS, TCFD, ISSB, SASB, CDP, IFRS S1/S2)
- **Benchmarks** anonymously against sector peers
- **Collects supplier data** through a token-based portal (no account needed)
- **Models ROI** from sustainability initiatives (energy savings, carbon tax avoidance, contract eligibility, HR retention)

---

## 2. Industry Sector Packs

### What are sector packs?
Each industry has different sustainability reporting requirements. A **sector pack** bundles:
- **KPIs** — the specific metrics your industry must report (e.g., fleet fuel economy for automotive, energy use intensity for real estate)
- **Materiality starters** — pre-built IROs (Impacts, Risks, Opportunities) typical for your sector
- **Emission factors** — industry-specific carbon factors for your materials and processes
- **Report templates** — narrative scaffolds for your sector's report sections

### Why multiple standards in one pack?
A real company reports to **multiple frameworks simultaneously**:
- **SASB** — for US investors (sector-specific quantitative metrics)
- **ESRS** — for EU CSRD compliance (mandatory from 2024 for large EU companies)
- **GRI** — the most widely used voluntary framework globally
- **RBA** — Responsible Business Alliance (electronics supply chain audits)
- **RoHS/REACH** — EU product substance compliance
- **Catena-X** — automotive data exchange ecosystem
- **GRESB** — real estate benchmark
- **PCAF** — financed emissions for banks/asset managers
- **SFDR** — EU fund-level sustainability disclosure

The portal bundles all applicable frameworks per sector so you don't have to figure out which applies.

### Available packs
| Pack | Frameworks | Typical users |
|---|---|---|
| Electronics & Semiconductors | SASB TC-HW/TC-SC, ESRS E1/E5, RBA, Conflict Minerals, RoHS/REACH | EMS, chip makers, hardware OEMs |
| Automotive & Mobility | SASB TR-AU, ESRS E1/E5, EU Fleet CO2, Catena-X, EU Battery Reg | OEMs, Tier-1/2 suppliers |
| Real Estate & Infrastructure | GRESB, ESRS E1, CRREM, EU Taxonomy, SFDR | REITs, asset managers, property companies |
| Financial Services | PCAF, SFDR PAI, TCFD, EU Taxonomy, NZBA | Banks, asset managers, insurers |
| Generic | GRI, ESRS E1/S1 | Companies without a specialised pack |

### Selecting a pack
- **First time**: The Home page shows a "Pick your industry" banner
- **Change later**: Settings → Sector Pack tab
- **What happens**: The dashboard immediately shows sector-specific KPIs; existing data is preserved

---

## 3. Sector KPIs Explained

### Types of KPIs
1. **Quantitative** (unit = tCO2e, %, kWh/m², etc.) — these are numbers. Some are auto-computed from your uploaded data; others need manual entry.
2. **Narrative** (unit = "narrative") — these are written descriptions (e.g., "Discussion of strategy for managing fleet fuel economy"). You draft these in the Reports module.

### Computed vs Pending
- **Computed (green check)** — the portal has enough data to calculate this automatically
- **Pending (clock icon)** — you haven't uploaded the data yet, or this requires manual input

### Click any KPI to learn more
Every KPI tile is clickable. The popup shows:
- Which framework requires it (SASB, ESRS, GRESB, etc.)
- Whether it's quantitative or narrative
- Where the data should come from
- Current value (if computed)

---

## 4. Product Carbon Footprint (PCF)

### What is a PCF?
A Product Carbon Footprint measures the total greenhouse gas emissions caused by a product across its lifecycle, expressed in **kgCO2e** (kilograms of CO2 equivalent).

### Lifecycle stages (EN 15978 / ISO 14040)
| Stage | Name | What it covers | Example |
|---|---|---|---|
| **A1** | Raw material supply | Mining, extraction, primary processing | Aluminum smelting, silicon wafer production |
| **A2** | Transport to manufacturer | Shipping components to assembly | Sea freight from Asia to Europe |
| **A3** | Manufacturing | Factory energy, assembly, testing | SMT soldering, functional testing |
| **A4** | Distribution | Shipping finished product to customer | Last-mile delivery |
| **B1-B7** | Use phase | Energy consumed during product lifetime | Electricity used by an SSD over 5 years |
| **C1-C4** | End of life | Recycling, landfill, incineration | E-waste shredding and material recovery |

The portal currently computes **cradle-to-gate** (A1–A3). Use-phase (B) and end-of-life (C) are on the roadmap.

### How to calculate a PCF
1. **Create a product** — SKU, name, mass, sector
2. **Upload a BOM** (or generate one from a description) — the AI classifies materials and matches emission factors
3. **Review** — check confidence scores, fix low-confidence rows
4. **Run calculation** — the engine multiplies quantities × emission factors, runs 1,000 Monte Carlo trials, outputs p5/p50/p95
5. **Export** — PDF statement or PACT Pathfinder v2 JSON for OEM buyers

### What-if simulator
Explore abatement scenarios without changing your data:
- "What if we use recycled aluminum?" → swaps material factors
- "What if we move assembly to a renewable PPA site?" → swaps grid factors
- "What if we reduce scrap rate by 5%?" → adjusts per-component waste

Scenarios can be saved, compared, and deleted.

### Primary vs secondary data
- **Primary data** = actual reported numbers from your suppliers or your own measurements
- **Secondary data** = industry-average emission factors from databases (Ecoinvent, DEFRA)
- The portal tracks `primaryDataPct` — the share of your PCF based on real supplier data vs averages
- ESRS E1 §51(g) requires disclosure of this percentage
- When a supplier submits data through the Supplier Portal and you approve it, the affected components automatically flip to primary data

---

## 5. Supplier Scope 3 Portal

### How it works
1. **Add suppliers** — name, email, country, category
2. **Send data request** — the supplier receives a branded email with a secure link
3. **Supplier submits** — no account needed; simple form, mobile-friendly, 10 minutes
4. **You review** — see what they submitted, check for anomalies
5. **Approve & ingest** — one click moves their data into your Scope 3 inventory as primary data

### Token security
- 48-byte random token, 30-day expiry
- One submission per token
- Rate-limited (10 req/min)

---

## 6. Sustainability ROI Module

Translates ESG data into USD impact across four pillars:
1. **Energy cost savings** — kWh reduction × electricity price
2. **Carbon tax avoidance** — tCO2e reduction × carbon price
3. **Contract eligibility** — revenue at risk from ESG certification gaps
4. **HR & talent ROI** — avoided recruiting costs from lower turnover

Configure financial assumptions (electricity price, carbon tax rate, recruiting cost, annual revenue) in the Financial Data form.

---

## 7. Real Estate Module

### CRREM Stranding Analysis
CRREM (Carbon Risk Real Estate Monitor) projects each building's energy/emissions intensity forward and compares it against the 1.5°C or 2.0°C pathway. The **stranding year** is when the building's trajectory exceeds the pathway — meaning it becomes non-compliant with a Paris-aligned trajectory and risks value impairment.

### How to use
1. **Add assets** — name, class (office/retail/residential/industrial), floor area, location
2. **Add energy records** — fuel type, monthly or annual consumption
3. **Run CRREM analysis** — see the stranding year under both 1.5°C and 2.0°C scenarios

---

## 8. Financial Services Module

### PCAF Financed Emissions
PCAF (Partnership for Carbon Accounting Financials) measures the GHG emissions financed by a bank's loans and investments. The attribution formula depends on the asset class:

| Asset class | Attribution formula |
|---|---|
| Listed equity / bonds | (investment / EVIC) × investee emissions |
| Business loans | (outstanding / balance sheet) × borrower emissions |
| Project finance | (outstanding / project cost) × project emissions |
| Commercial RE / Mortgages | (outstanding / property value) × building emissions |
| Motor vehicle loans | (outstanding / vehicle value) × vehicle emissions |
| Sovereign debt | (outstanding / GDP) × country emissions |

### Data quality scores (1-5)
1 = Reported, verified (best)
2 = Reported, unverified
3 = Sector average from revenue
4 = Sector average from assets
5 = Proxy (worst)

---

## 9. Anonymous Benchmark Cohort

### How it works
- Opt in via Settings → Sector Pack → "Anonymous benchmark cohort"
- Your aggregated KPI values contribute to sector-level statistics
- You see "You're in the Xth percentile" on dashboard tiles
- **Privacy guarantees**: k-anonymity (cohort hidden if <10 companies), differential privacy (Laplace noise on small cohorts), retroactive withdrawal

---

## 10. Report Generation

Generate standard-compliant sustainability reports in PDF or Word format:
- Select standard (GRI, ESRS, TCFD, ISSB, SASB, CDP)
- Choose topics, year, language
- The report includes cover page, table of contents, standard-aligned disclosures with your data, charts, compliance index
- Sector pack narrative templates are included when a pack is active

---

## 11. Subscription Tiers

| Feature | Starter | Professional | Enterprise |
|---|---|---|---|
| E1 + S1 dashboards | ✅ | ✅ | ✅ |
| Excel/CSV upload | ✅ | ✅ | ✅ |
| GRI reports | ✅ | ✅ | ✅ |
| AI assistant | ✅ | ✅ | ✅ |
| AI document extraction | — | ✅ | ✅ |
| All 8 reporting standards | — | ✅ | ✅ |
| Database connections | — | ✅ | ✅ |
| Audit trail & lineage | — | ✅ | ✅ |
| Multi-language reports | — | ✅ | ✅ |
| Sustainability ROI | — | ✅ | ✅ |
| SSO / SAML | — | — | ✅ |
| Custom branding | — | — | ✅ |
| Dedicated CSM | — | — | ✅ |
| API access | — | — | ✅ |
