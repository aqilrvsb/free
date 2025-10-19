# NestJS API for Fly.io deployment
# Multi-stage build: build with dev deps, run with prod deps only

FROM node:20-slim AS builder
ARG NODE_ENV=production
WORKDIR /app
COPY app/package*.json ./
# Install all dependencies including dev dependencies for build
RUN npm ci --include=dev || npm install --include=dev
COPY app/ .
RUN npm run build

FROM node:20-slim AS runtime
ARG NODE_ENV=production
ARG APP_PORT=3000
# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY app/package*.json ./
RUN if [ "$NODE_ENV" = "production" ]; then npm ci --omit=dev || npm install --omit=dev; else npm install; fi
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=${NODE_ENV}
ENV APP_PORT=${APP_PORT}
EXPOSE 3000
CMD ["node", "dist/main.js"]
