# Triple i Oman — API service (Railway root directory: backend)
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma.config.ts reads DATABASE_URL; a placeholder is enough to generate the client.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
COPY . .
EXPOSE 4000
# Apply pending migrations, then start. Railway injects PORT.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
