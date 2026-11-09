# Deploying Triple i Oman on Railway

The repository deploys as **one Railway service** (API + web app, built from the root `Dockerfile`) plus **one PostgreSQL database**. `railway.json` already configures the Docker build, the health check (`/api/health`) and restart policy. Database migrations run automatically on every deploy (`prisma migrate deploy`), and the tax-rules library seeds itself on first boot.

## 1. Create the project

1. Go to <https://railway.com/new> → **Deploy from GitHub repo** → choose `sust-TripleiOman` (pick the branch you want to deploy).
2. In the same project: **+ New → Database → PostgreSQL**.

Leave the service's *Root Directory* empty (repo root). Railway detects `railway.json` and builds with the `Dockerfile`, so you don't need custom build or start commands.

## 2. Set variables (service → Variables)

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | ✅ | `${{Postgres.DATABASE_URL}}` (reference to the Postgres service) |
| `JWT_SECRET` | ✅ | long random string, e.g. `openssl rand -hex 48` |
| `JWT_REFRESH_SECRET` | ✅ | a **different** long random string |
| `NODE_ENV` | ✅ | `production` (already set in the image) |
| `BOOTSTRAP_ADMIN_EMAIL` | recommended | your email: the account that signs up with it becomes the staff `PLATFORM_ADMIN` |
| `APP_URL` | recommended | public URL, e.g. `https://om.triplei.io` (defaults to the Railway domain) |
| `MFA_REQUIRED` | optional | `true` by default in production; every user enrols an authenticator app |
| `ALLOW_PUBLIC_SIGNUP` | optional | `true` (self sign-up) or `false` (invitation only) |
| `TRIPLEI_URL` | optional | link for the "Triple i: Sustainability" card, default `https://app.triplei.io` |
| `RESEND_API_KEY`, `RESEND_FROM` | optional | real emails (reset links, invitations, reminders); without them emails are only logged |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional | AI answers in the tax assistant; without them it answers from the curated library |
| `ASP_PROVIDER`, `ASP_BASE_URL`, `ASP_API_KEY` | optional | `sandbox` simulates Fawtara; set `http` + partner ASP URL/key once contracted |

Don't set `PORT`. Railway injects it.

## 3. Networking

Service → **Settings → Networking → Generate Domain** (or add a custom domain such as `om.triplei.io` and point a CNAME to it). If you set a custom domain, also set `APP_URL` to it.

## 4. First login

1. Open the domain. You see the Triple i / Triple i Oman chooser.
2. Choose **Triple i Oman → Create an account** using the `BOOTSTRAP_ADMIN_EMAIL` address. You'll be asked to scan a QR code with an authenticator app.
3. Create your organisation and answer the questionnaire. The calendar and reminders are generated automatically.
4. The **Staff console** (sidebar) lets you review the tax rules library. Confirm the `[VERIFY]` items with your Omani tax adviser.

Optional demo data, from the service shell (`railway run` or the Railway shell):

```bash
cd /app/backend && node src/prisma/seed.js --demo
```

## Operations

- **Health:** `GET /api/health` returns `{"status":"ok","db":"ok"}`.
- **Migrations:** schema changes go in `backend/prisma/migrations` (`npx prisma migrate dev --name <change>` locally); deploys apply them automatically.
- **Backups:** enable Railway Postgres backups. Document files are stored in the database (`TaxDocument.data`), so backups include them.
- **Reminders** run hourly inside the service (set `DISABLE_REMINDERS=1` to turn them off).

## ⚠️ Data residency (plan §5.3)

The development plan says **Railway cannot pin data to Oman**, so it is not suitable for real production tax data under Oman's PDPL and TaxOman's expectations for service providers. Use Railway for **development, staging, demos and pilots with consenting customers**. For production, run the same Docker image on an in-country provider (e.g. Oman Data Park) with Postgres in Oman. The image is provider-neutral: it needs one container plus `DATABASE_URL` and the variables above. Confirm the hosting location with your lawyer and TaxOman first.
