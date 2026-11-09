# Triple i Oman — web app (Railway root directory: frontend)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve@14.2.4
COPY --from=build /app/dist ./dist
COPY serve.json ./dist/serve.json
COPY start.sh ./start.sh
EXPOSE 3000
# start.sh writes the API URL (API_URL variable) into dist/config.js at boot — no rebuild needed to change it.
CMD ["sh", "./start.sh"]
