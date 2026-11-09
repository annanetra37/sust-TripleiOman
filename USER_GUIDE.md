# Triple I ESG Portal — User Guide

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Homepage & Navigation](#2-homepage--navigation)
3. [Connecting Environmental Data (E1)](#3-connecting-environmental-data-e1)
4. [Connecting Workforce Data (S1)](#4-connecting-workforce-data-s1)
5. [Dashboards & KPIs](#5-dashboards--kpis)
6. [SBTi Targets](#6-sbti-targets)
7. [Generating Reports](#7-generating-reports)
8. [History & Traceability](#8-history--traceability)
9. [Data Lineage](#9-data-lineage)
10. [Data Connections](#10-data-connections)
11. [User Management](#11-user-management)
12. [Settings](#12-settings)
13. [AI Assistant](#13-ai-assistant)
14. [FAQ](#14-faq)

---

## 1. Getting Started

### Creating an Account

1. Go to the Triple I ESG Portal URL
2. Click **"Sign up"**
3. **Step 1**: Enter your name, email, and password
   - Password must be 8+ characters with uppercase, number, and special character
4. **Step 2**: Enter company details (name, country, industry, size)
5. Check your email for a **6-digit verification code**
6. Enter the code to activate your account

### Signing In

1. Enter your email and password
2. Click **"Sign In"**
3. You'll be redirected to the homepage

### Dark Mode

Click the sun/moon icon in the top-right corner to toggle between light and dark mode.

---

## 2. Homepage & Navigation

The homepage shows three ESG pillars with expandable sections:

- **Environmental**: Climate & Emissions, Pollution, Water, Biodiversity, Circular Economy
- **Social**: Workforce & Employees, Supply Chain Labor, Community Impact, Consumer Protection
- **Governance**: Board & Leadership, Ethics & Compliance

The sidebar provides quick access to all features:
- **Analytics** — Combined E1 + S1 analytics
- **SBTi Targets** — Science Based Target setting
- **Reports** — Generate ESG compliance reports
- **Data Connections** — Connect external databases
- **Data Lineage** — Trace data from source to dashboard
- **History** — View all uploads and transformations
- **Activity Log** — Track user actions (Admin only)
- **Users** — Manage team members (Admin only)
- **Settings** — Org units, standards, branding, data reset

---

## 3. Connecting Environmental Data (E1)

Navigate to **Environmental → Climate & Emissions → Connect Data**

### Three Ways to Connect Data

#### Spreadsheet Upload
1. Select **Reporting Year** (the year this data represents)
2. Select **Organizational Unit**
3. Click the **Spreadsheet** tab
4. Drag and drop your Excel/CSV file (any format, any language)
5. Click **"Process with AI"**
6. Our algorithms automatically map columns, clean values, and calculate emissions

#### Invoice & Receipt Scanning
1. Click the **Invoices & Receipts** tab
2. Select **Document Type**: Travel, Stay, Energy, or Company Vehicle
3. Drop PDF, JPG, or PNG files (up to 20 files)
4. Click **"Extract Documents"**
5. AI reads the documents using OCR and extracts emission data

#### Database Connection
1. Click the **Database** tab
2. Select a connected database (must be set up in Data Connections first)
3. Browse available tables
4. Select a table and preview its data
5. Click **"Pull"** then **"Process with AI"**

### What Happens During Processing

- **Reading**: Your data is ingested
- **AI Mapping**: Columns are automatically identified (works in any language)
- **Cleaning**: Values are normalized (gender codes, units, dates)
- **Validation**: Data types and ranges are checked
- **Loading**: Clean records are inserted into the data model

### Credits
- Spreadsheet upload: **1 credit per row**
- Document extraction: **2 credits per document**

---

## 4. Connecting Workforce Data (S1)

Navigate to **Social → Workforce & Employees → Connect Data**

Same process as E1, but for workforce data:
- Employee composition (headcount by gender, contract type)
- Diversity metrics (disability status)
- Training hours
- Turnover (voluntary/involuntary)
- Workplace injuries

Upload any HR spreadsheet — the AI handles the mapping regardless of column names, language, or format.

---

## 5. Dashboards & KPIs

### Environmental Dashboard

Navigate to **Environmental → Climate & Emissions**

**Primary KPIs:**
| KPI | Description |
|-----|-------------|
| Total GHG Emissions | Sum of all Scope 1+2+3 emissions (tCO2e) |
| GHG Intensity | Emissions per employee |
| Total Energy Consumption | All energy sources converted to MWh |
| SBTi Progress | Progress toward decarbonization target |

**Secondary KPIs:**
- Scope 1/2/3 individual breakdown
- Year-over-Year change %
- Activity count and employee count

**Charts:**
- Emissions by Scope (doughnut)
- Emissions by Activity (treemap)
- Emissions Trend year-over-year (line)
- Energy Consumption by Source (bar)
- SBTi Target Progress (gauge)
- Top Emission Sources (ranked bars)

**Filters:**
- **Year**: Select specific year or "All Years"
- **Org Units**: Filter by specific units or "All Units"

**Export:**
- **Visuals**: Opens browser print dialog → Save as PDF (captures all charts)
- **Data**: Downloads Excel workbook with all raw data

**Copy Charts:** Hover over any chart → copy icon copies as PNG image, download icon saves as PNG file.

### Workforce Dashboard

Navigate to **Social → Workforce & Employees**

**Primary KPIs:**
| KPI | Description |
|-----|-------------|
| Total Employees | Headcount |
| Female % | Gender diversity metric |
| Avg Training Hours | Hours per trained employee |
| Turnover Rate | Total turnover / employees |

**Secondary KPIs:**
- Permanent/Temporary split
- Voluntary/Involuntary turnover rates
- Disability count and rate
- LTIR (Lost Time Injury Rate per 200K hours)

**Charts:**
- Employees by Gender (bar)
- Gender Distribution (pie)
- Training Hours by Gender (bar)
- Disability by Gender (bar)
- Contract Type breakdown (pie)
- Turnover by Gender (stacked bar)

---

## 6. SBTi Targets

Navigate to **SBTi Targets** in the sidebar.

### Setting a Target
1. Click **"New Target"**
2. Select **Base Year** (reference year for emissions)
3. Select **Target Year** (when to achieve the reduction)
4. Choose **Method**: Absolute Contraction, Intensity-based, or Renewable Energy Share
5. Choose **Scope**: Scope 1+2, Scope 3, or All
6. Enter **Reduction Percentage** (minimum 4.2% per year for 1.5°C alignment)
7. Click **"Create Target"**

The target progress appears on the E1 dashboard as a gauge chart.

---

## 7. Generating Reports

Navigate to **Reports** in the sidebar.

### Step-by-Step
1. **Select Standard**: ESRS, GRI, TCFD, or ISSB
2. **Select Year** and language
3. **Choose Topics**: Check/uncheck which ESG topics to include
4. Click **"Validate Data Coverage"** — shows which disclosures have data, which are missing, and which need narrative input
5. Review the coverage report:
   - ✅ Green = Data available
   - ❌ Red = Missing quantitative data
   - ℹ️ Blue = Narrative section (auto-generated placeholder)
6. Click **"Generate Report"** — downloads a PDF

### Report Contents
- **Cover page**: Company logo, name, standard, year
- **Table of contents**: Numbered sections
- **Organizational boundaries**: Org units, locations, operations
- **Methodology**: GHG Protocol, emission factors, scope definitions
- **Topic sections**: Each disclosure with metrics or narrative placeholders
- **Standard index**: Every disclosure code with status (✓ Reported / ✗ No data / ○ Narrative)
- **Trend narratives**: Year-over-year comparisons with context

### Supported Standards
| Standard | Coverage |
|----------|----------|
| ESRS (CSRD) | E1, S1, G1 — 32+ disclosures |
| GRI | 300, 400, 200 — 13 disclosures |
| TCFD | 4 pillars — 10 disclosures |
| ISSB (IFRS S2) | Climate — 6 disclosures |

---

## 8. History & Traceability

Navigate to **History** in the sidebar.

### Upload History
- View all uploaded files with status, org unit, user, date
- Filter by type (Environmental/Social), status, or search by name
- Click any row to see the **detail view**

### Detail View
- **Upload summary**: File name, type, org unit, who uploaded, processing stats
- **Source files**: View or download the original uploaded document
- **Audit trail**: Audit status (Pending/Verified/Flagged/Rejected), reviewer, date
- **ETL Pipeline**: Visual showing Source → AI Mapping → Cleaning → Validation → Loaded
- **Transformed data**: Table showing every extracted record with all fields
- **Source column**: Click document names to view the original file

### Audit Controls (Admin)
- **Verify**: Mark the upload as auditor-verified
- **Flag**: Flag for review with a note
- **Reject**: Mark as rejected

### Deleted Data
When data is reset, history records are preserved with a "DATA DELETED" badge showing who deleted it and when.

---

## 9. Data Lineage

Navigate to **Data Lineage** in the sidebar.

A visual tree tracing every data point from ESG topic to source:

```
Environmental (2 uploads)
  └─ Headquarters (USA)
      └─ mary dav (demo@triple.io)
          └─ invoice_123.pdf   COMPLETED  verified
```

**Features:**
- Filter by Topic, Org Unit, or User
- Expand/Collapse all (+/- buttons)
- Zoom in/out (50%-150%)
- Click any upload to view details
- Eye icon to view source files
- Export as PDF or Word with clickable source file links

---

## 10. Data Connections

Navigate to **Data Connections** in the sidebar.

### Available Connectors
- **PostgreSQL** — Direct database connection
- **MySQL / MariaDB** — MySQL-compatible databases
- **SQL Server** — Microsoft SQL Server
- **AWS RDS** — Amazon managed databases
- **REST API** — Any REST endpoint with auth support

### Setting Up a Connection
1. Click a connector card
2. Enter connection details (host, port, database, credentials)
3. Click **"Create Connection"**
4. Click **"Test"** to verify connectivity

### Using Connections
Once connected, go to any **Connect Data** page (E1 or S1) → **Database** tab → select your connection → browse tables → pull data.

---

## 11. User Management

Navigate to **Users** in the sidebar (Admin only).

### Inviting Users
1. Click **"Invite User"**
2. Enter name, email, phone, job title
3. Select **Role**: Admin (full access) or Custom (restricted)
4. For Custom role: set permissions per org unit (View/Upload/Delete)
5. Click **"Send Invite"**
6. If email fails, a manual invite link is provided

### Managing Users
- **Activate/Deactivate**: Toggle user access
- **Edit Permissions**: Change org unit access levels
- **Delete**: Remove user permanently

---

## 12. Settings

Navigate to **Settings** in the sidebar.

### Organizational Units
- Add/remove business units or offices
- Each unit has a name and country
- Data is tracked separately per unit

### Company Branding
- Upload company logo (PNG/JPG/WebP)
- Logo appears on report cover pages

### ESG Standards
- Select the reporting standard (ESRS, GRI, TCFD, SASB, CDP, IFRS)
- Determines report structure and compliance rules

### Data Reset
1. Select data type (S1 or E1) and year
2. Click **"Preview Data to Delete"** — shows exactly what will be removed
3. Type the year to confirm
4. Data is deleted but history records are preserved

### Credit Transactions
- View credit usage history with date filtering
- See which operations consumed credits

---

## 13. AI Assistant

Click the **chat bubble** (bottom-right corner) on any page.

The AI assistant can help with:
- **Platform features**: "How do I upload data?"
- **ESG concepts**: "What is Scope 3?"
- **Reporting standards**: "Explain the difference between ESRS and GRI"
- **Data guidance**: "What format should my spreadsheet be in?"
- **Troubleshooting**: "Why is my dashboard showing 0?"

Suggested questions appear when you first open the chat.

---

## 14. FAQ

**Q: What file formats are supported?**
A: Excel (.xlsx, .xls), CSV, PDF, JPG, PNG for document extraction.

**Q: Does the data need specific column names?**
A: No. Our algorithms work with any column names in any language.

**Q: How are emissions calculated?**
A: Using the GHG Protocol with emission factors from DEFRA, EPA, and IEA databases.

**Q: What if I upload data for the wrong year?**
A: You select the reporting year before uploading. All data is assigned to that year.

**Q: Can I undo a data deletion?**
A: No, but the history record is preserved showing what was deleted and by whom.

**Q: How many credits do I have?**
A: Your credit balance is shown in the top-right corner of every page.

**Q: Can multiple users work simultaneously?**
A: Yes. Each user has their own permissions per organizational unit.

**Q: What languages are supported?**
A: Data upload works in any language. Reports can be generated in English, French, German, Arabic, Spanish, Armenian, and Swedish.
