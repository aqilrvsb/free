# NestJS API that returns FreeSWITCH XML via /fs/xml
# Multi-stage build: build with dev deps, run with prod deps only

# Stage used by docker-compose (bind-mounted source, entrypoint handles dev/prod modes)
FROM node:20-slim AS dev
WORKDIR /app
CMD ["node"]

FROM node:20-slim AS builder
ARG NODE_ENV=production
WORKDIR /app
COPY package*.json ./
# Dù NODE_ENV là production vẫn cần dev deps để build -> buộc include=dev
RUN npm ci --include=dev || npm install --include=dev
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
ARG NODE_ENV=production
ARG APP_PORT=3000
# cài curl cho healthcheck "curl http://localhost:3000/health"
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN if [ "$NODE_ENV" = "production" ]; then npm ci --omit=dev || npm install --omit=dev; else npm install; fi
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=${NODE_ENV}
ENV APP_PORT=${APP_PORT}
EXPOSE 3000
CMD ["node", "dist/main.js"]
