# ── Stage 1: Build ────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Production ──────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
