# Triple i Oman — Tax compliance platform

**تريبل آي عُمان — منصة الامتثال الضريبي**

Triple i Oman is the "TurboTax layer" for taxpayers who deal with the **Oman Tax Authority (TaxOman / OTA)**. It collects data, calculates, checks, prepares, files (where a channel exists) and reminds. It covers VAT, Fawtara e-invoicing, corporate income tax, withholding tax, excise and (from 2028) personal income tax, in **English and Arabic (RTL)**.

It has nothing to do with ESG: original Triple i stays separate, with separate accounts, a separate identity realm (JWT `iss=triplei-oman`, `aud=om-api`) and a separate database. See `docs/plan/Triple_i_Oman_Development_Plan.docx` for the product plan this code implements.

> Rules we never break: we never ask for or store a TaxOman password or digital-ID PIN, we never screen-scrape the portal, and nothing is submitted without a named human approval.

## What is built

| Plan epic | Feature | Where |
|---|---|---|
| E0 | Login chooser (Triple i / Triple i Oman), separate realm, neutral sign-in errors, TOTP MFA + recovery codes, lockout, 7-role matrix enforced in the API, hash-chained audit log, just-in-time support access, PDPL privacy (export, delete, consents), full AR/EN + RTL, Arabic digits, Hijri display | `routes/auth.js`, `middleware/auth.js`, `services/audit.js`, `pages/Chooser.jsx` |
| E1 | Organisation onboarding (CR, TIN, VAT number validation), plain-language questionnaire, obligations with "why", VAT threshold monitor (OMR 38,500 / 19,250), e-invoicing wave (1 Apr / 1 Oct 2027), money stored as integer baisa | `routes/orgs.js`, `engines/obligations.js` |
| E2 | Compliance calendar with Fri–Sat weekend and holiday shifting, status board, iCal export, 30/14/7/1-day reminders plus escalation, versioned **rules library** with four-eyes approval | `engines/obligations.js`, `services/reminders.js`, `rules/library.json`, `routes/admin.js` |
| E3 | Bilingual Excel/CSV template and import, row-level errors, data-quality checks (invalid VAT no., rate mismatch, duplicates, blocked input…), chart-of-accounts mapping with history | `routes/transactions.js`, `engines/vat.js` |
| E4 | VAT classification (reverse charge, exports, exempt/zero keywords), box-by-box VAT return with drill-down and "explain this number", variance vs previous quarter, apportionment, prepare → review → **four-eyes approval** → lock, filing companion with copy buttons, submission reference, payment | `engines/vat.js`, `routes/returns.js`, `pages/ReturnDetail.jsx` |
| E5 | Fawtara: UBL 2.1 / PINT OM XML builder, business-rule validation with AR/EN fix hints, SHA-256, B2C QR, partner-ASP **submission adapter** (sandbox + HTTP) with idempotency and retries, credit/debit notes, inbound supplier XML → purchase ledger, readiness score | `engines/fawtara.js`, `services/asp.js`, `routes/einvoices.js` |
| E6 | CIT wizard: adjustments, loss carry-forward with expiry, 3% small-enterprise check, credits, draft return in the same workflow | `engines/cit.js` |
| E7 | WHT: categories, treaty rates gated on a valid residency certificate, gross-up, monthly statement | `engines/wht.js`, `routes/wht.js` |
| E8 | Excise calculation and quarterly return, digital tax-stamp reconciliation | `engines/excise.js` |
| E9 | Public "Am I affected?" checker (no sign-up), personal tracker: income, deductions with receipt vault, 183-day residency counter, foreign tax credit | `engines/pit.js`, `pages/Pit.jsx` |
| E10 | Tax assistant, "cite or decline", grounded in a curated library (uses Claude when `ANTHROPIC_API_KEY` is set, otherwise retrieval only) | `routes/assistant.js`, `rules/knowledge.json` |
| E11 | One-click audit pack (ZIP), TaxOman letters inbox with deadlines, bilingual objection template | `routes/audit.js`, `routes/letters.js` |
| E12 | Accountant workspace: all clients by deadline risk, client switching | `pages/Clients.jsx` |
| E13–E15 | In-app and email notifications, OMR plans page, staff console (rules, tenants, users, MFA reset with identity note) | `routes/account.js`, `routes/admin.js` |

Items marked **[VERIFY]** in the rules library (plan §12) must be confirmed with an Omani tax adviser before you rely on them. Change them in the staff console: a specialist proposes a new version and a second specialist approves it.

## Stack

- **Backend:** Node 22, Express, Prisma 7 + PostgreSQL. Pure, unit-tested calculation engines in `backend/src/engines`.
- **Frontend:** React 18, Vite, Tailwind, IBM Plex Sans Arabic. In production the backend serves the built frontend, so it all runs as **one service**.

## Local development

```bash
# 1. Database
createdb triplei_oman
cp backend/.env.example backend/.env       # set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, MFA_REQUIRED=false

# 2. Backend
cd backend && npm install
npx prisma migrate deploy
node src/prisma/seed.js --demo           # optional demo data (password Demo12345!)
npm run dev                              # http://localhost:4000

# 3. Frontend (second terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api)
```

Demo users: `fatma@demo.om` (owner), `ahmed@demo.om` (approver), `sara@demo.om` (external accountant), `staff@triplei.om` (staff).

Tests (engine worked examples plus an end-to-end API flow against Postgres):

```bash
cd backend && npm test
```

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for Railway.
