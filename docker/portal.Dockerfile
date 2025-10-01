# Build Next.js portal for production

# Stage used by docker-compose (bind-mounted source, entrypoint drives runtime)
FROM node:20-slim AS dev
WORKDIR /portal
CMD ["node"]

FROM node:20-slim AS deps
WORKDIR /portal
COPY package*.json ./
# Require dev dependencies to build
RUN npm ci --include=dev || npm install --include=dev

FROM deps AS builder
COPY . .
RUN npm run build

FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /portal
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=builder /portal/.next ./.next
COPY --from=builder /portal/public ./public
COPY --from=builder /portal/next.config.ts ./next.config.ts
COPY --from=builder /portal/tsconfig.json ./tsconfig.json
EXPOSE 3001
CMD ["npm", "run", "start"]
