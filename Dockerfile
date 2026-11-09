# Triple i Oman — single-service image: Express API + built React app.
# Used by Railway (see railway.json) or any container host.

# ---- 1. Build the frontend ----
FROM node:22-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Backend dependencies + Prisma client ----
FROM node:22-alpine AS api
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./
# prisma.config.ts reads DATABASE_URL; a placeholder is enough to generate the client.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# ---- 3. Runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY --from=web /app/frontend/dist ./frontend/dist
WORKDIR /app/backend
EXPOSE 4000
# Apply pending migrations, then start. Railway injects PORT.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
