# Deploying Triple i Oman on Railway (3 services)

```
            om.triplei.io                      api.om.triplei.io
 browser ──► [Frontend service] ──── HTTPS ──► [Backend service] ──private──► [Postgres]
             root: frontend/                   root: backend/
```

Triple i Oman is **separate from original Triple i** (plan §5.1–5.2): its own API domain, database, user accounts and audit log.
**Do not reuse `api.triplei.io`.** It stays with the original Triple i backend and nothing about it changes.

| Service | Source | Root directory | Config file | Domain |
|---|---|---|---|---|
| **oman-backend** | this GitHub repo | `backend` | `/backend/railway.json` | `api.om.triplei.io` |
| **oman-frontend** | this GitHub repo | `frontend` | `/frontend/railway.json` | `om.triplei.io` |
| **Postgres** | Railway database | — | — | none (private) |

## 1. Create the project and Postgres

1. <https://railway.com/new> → **Empty project** (or *Deploy from GitHub repo*).
2. **+ New → Database → Add PostgreSQL**.

## 2. Backend service

1. **+ New → GitHub Repo** → `sust-TripleiOman`. Rename the service to `oman-backend`.
2. **Settings → Source**: *Root Directory* = `backend`; *Branch* = the branch you deploy.
3. **Settings → Config-as-code → Railway Config File** = `/backend/railway.json`. The config path does not follow the root directory, so use the full path. It sets the Dockerfile build and the `/api/health` health check.
4. **Variables:**

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `JWT_SECRET` | random, e.g. `openssl rand -hex 48` (**not** the same as original Triple i) |
   | `JWT_REFRESH_SECRET` | another, different random string |
   | `CORS_ORIGINS` | `https://om.triplei.io` (plus `,https://<frontend>.up.railway.app` while testing) |
   | `APP_URL` | `https://om.triplei.io` (links in emails point to the web app) |
   | `SERVE_FRONTEND` | `false` |
   | `BOOTSTRAP_ADMIN_EMAIL` | your email (that account becomes staff admin) |
   | `TRIPLEI_URL` | `https://app.triplei.io` (the "Triple i" card on the login chooser) |
   | optional | `RESEND_API_KEY`, `RESEND_FROM`, `ANTHROPIC_API_KEY`, `MFA_REQUIRED`, `ALLOW_PUBLIC_SIGNUP`, `ASP_PROVIDER/ASP_BASE_URL/ASP_API_KEY` |

   Don't set `PORT`; Railway injects it.
5. **Settings → Networking → Generate Domain** (for testing), then **Custom Domain** → `api.om.triplei.io`.
6. Deploy. Migrations run automatically (`prisma migrate deploy`), then the tax-rules library seeds itself.
   Check `https://api.om.triplei.io/api/health` → `{"status":"ok","db":"ok"}`.

## 3. Frontend service

1. **+ New → GitHub Repo** → the same repo again. Rename it `oman-frontend`.
2. **Settings → Source**: *Root Directory* = `frontend`.
3. **Settings → Config-as-code → Railway Config File** = `/frontend/railway.json`.
4. **Variables:**

   | Variable | Value |
   |---|---|
   | `API_URL` | `https://api.om.triplei.io` (or `https://${{oman-backend.RAILWAY_PUBLIC_DOMAIN}}`) |

   This is the **only endpoint setting** in the frontend. It's read when the container starts and written to `/config.js`, so changing it needs only a redeploy, not a code change. `/api` is appended automatically.
5. **Networking → Custom Domain** → `om.triplei.io`.

## 4. DNS (Cloudflare or your DNS provider)

Railway shows a CNAME target (plus sometimes a TXT verification record) for each custom domain:

| Type | Name | Target |
|---|---|---|
| CNAME | `om` | the target Railway shows for **oman-frontend** |
| CNAME | `api.om` | the target Railway shows for **oman-backend** |

On Cloudflare, either leave the records **DNS only** (grey cloud) until Railway shows the certificate as issued, or proxy them with SSL mode **Full**. Existing records (`api`, `app`, …) for original Triple i are not touched.

> The free Cloudflare Universal SSL certificate covers only one subdomain level (`*.triplei.io`). If you proxy `api.om.triplei.io` through Cloudflare, you need an advanced certificate. Otherwise use `om-api.triplei.io` instead (and update `API_URL`).

## 5. First login

1. Open `https://om.triplei.io` → **Triple i Oman** → **Create an account** with the `BOOTSTRAP_ADMIN_EMAIL` address → scan the QR code with an authenticator app.
2. Create your organisation and answer the questionnaire.
3. Optional demo data, from the backend service shell: `node src/prisma/seed.js --demo` (users `fatma@demo.om` etc., password `Demo12345!`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login says "Cannot reach the server" / CORS error in the browser console | `CORS_ORIGINS` on the backend must exactly match the frontend origin (scheme + host, no trailing slash). Redeploy the backend. |
| Frontend calls its own domain `/api/...` and gets 404 | `API_URL` not set on the frontend service. Set it and redeploy. |
| Backend crashes at boot with "Missing required environment variable" | Set `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`. |
| Health check fails right after the first deploy | Check the backend logs for the migration step; `DATABASE_URL` must reference the Postgres service. |
| Password-reset / invitation links point to the wrong host | `APP_URL` = the frontend URL. |

## Single-service alternative

The root `Dockerfile` still builds API + web app into one container (the API then serves the web app; leave `SERVE_FRONTEND` unset and use `/api/health`). Use it only if you prefer one service over two.

## ⚠️ Data residency (plan §5.3)

Railway cannot pin data to Oman. Use it for development, staging, demos and consenting pilot customers. For production tax data, run the same two images on an in-country provider (e.g. Oman Data Park) after confirming with your lawyer and TaxOman.
