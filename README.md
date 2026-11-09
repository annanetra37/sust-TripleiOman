# Triple I ESG Portal

ESG (Environmental, Social, Governance) data management and reporting platform.

## Architecture

- **Backend**: Node.js + Express + Prisma ORM + PostgreSQL
- **Frontend**: React 18 + Vite + TailwindCSS + Recharts

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Backend Setup
```bash
cd backend
cp .env.example .env    # Edit with your database credentials
npm install
npx prisma generate
npx prisma db push
node src/prisma/seed.js  # Seed emission categories
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Features

| Module | Status |
|--------|--------|
| Authentication (signup, OTP, JWT, invite) | Active |
| E1 — Climate Change | Active |
| S1 — Own Workforce | Active |
| Credits System | Active |
| Reports (PDF/DOCX) | Active |
| Data Connections (ETL) | Active |
| E2-E5, S2-S4, G1 | Planned |

## API Endpoints

| Route | Description |
|-------|-------------|
| POST /api/auth/signup | 2-step registration |
| POST /api/auth/login | JWT authentication |
| GET /api/s1/dashboard | S1 workforce analytics |
| POST /api/s1/upload | Upload workforce Excel |
| GET /api/e1/dashboard | E1 emissions analytics |
| POST /api/e1/upload | Upload emissions Excel |
| POST /api/e1/doc-extract | Document extraction (OCR + pattern engine) |
| POST /api/reports/generate | Generate ESG report |
| GET /api/settings/* | Org units, standards, credits |
