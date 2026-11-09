FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE ${PORT:-4000}

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server.js"]
