# Deploying Triple I ESG Portal on Railway

## Prerequisites
- A [Railway](https://railway.app) account (sign up with GitHub)
- This repository pushed to GitHub

## Step-by-Step Deployment

### 1. Create a New Project on Railway

1. Go to [railway.app/new](https://railway.app/new)
2. Click **"Deploy from GitHub repo"**
3. Select your `sust` repository

### 2. Add PostgreSQL Database

1. In your Railway project, click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway will provision a PostgreSQL instance automatically
3. Copy the `DATABASE_URL` from the PostgreSQL service's **Variables** tab

### 3. Deploy the Backend

1. Click **"+ New"** → **"GitHub Repo"** → select your repo
2. In the service settings:
   - **Root Directory**: `backend`
   - **Start Command**: `npx prisma generate && npx prisma db push --accept-data-loss && node src/server.js`
3. Go to the **Variables** tab and add:

```
DATABASE_URL=<paste from PostgreSQL service>
JWT_SECRET=<generate a random 64-char string>
JWT_REFRESH_SECRET=<generate another random 64-char string>
PORT=4000
FRONTEND_URL=https://your-frontend-url.up.railway.app
ANTHROPIC_API_KEY=sk-ant-your-api-key
ANTHROPIC_MODEL=claude-sonnet-5
NODE_ENV=production
```

4. Railway will auto-deploy. Check the **Deployments** tab for logs.

### 4. Deploy the Frontend

1. Click **"+ New"** → **"GitHub Repo"** → select your repo again
2. In the service settings:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npx serve dist -s -l $PORT`
3. Go to the **Variables** tab and add:

```
VITE_API_URL=https://your-backend-url.up.railway.app
```

4. In the frontend's `vite.config.js`, the proxy targets `localhost:4000`. For production, update the API base URL in `frontend/src/services/api.js` to use the backend's Railway URL, or set up a custom domain.

### 5. Set Custom Domains (Optional)

1. In each service, go to **Settings** → **Networking** → **Generate Domain** or add a custom domain
2. Update `FRONTEND_URL` in the backend to match the frontend's domain

### 6. Seed the Database

After the backend deploys successfully:
1. Open the backend service's **Shell** tab in Railway
2. Run: `node src/prisma/seed.js`

This populates emission factor categories.

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for access token signing |
| `JWT_REFRESH_SECRET` | Yes | Secret for refresh token signing |
| `PORT` | Yes | Server port (Railway sets this) |
| `FRONTEND_URL` | Yes | Frontend URL for CORS |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for AI features |
| `ANTHROPIC_MODEL` | No | AI model (default: claude-sonnet-5) |
| `SMTP_HOST` | No | Email server (leave empty for dev mode) |
| `SMTP_PORT` | No | Email port (default: 587) |
| `SMTP_USER` | No | Email sender address |
| `SMTP_PASS` | No | Email password / app password |

## Troubleshooting

- **Build fails**: Check that `package.json` has all dependencies listed
- **Database errors**: Ensure `DATABASE_URL` is correct and the Prisma schema is pushed
- **CORS errors**: Ensure `FRONTEND_URL` matches the actual frontend domain
- **AI features not working**: Verify `ANTHROPIC_API_KEY` is set correctly
