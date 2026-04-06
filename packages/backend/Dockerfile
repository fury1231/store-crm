# ── Stage 1: Build ────────────────────────────
# NOTE: Dev mode (target: build) runs as root intentionally.
# Volume mounts from the host require matching UID/GID; running as
# a non-root user would cause permission errors with bind-mounted src/.
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

# Use standalone tsconfig for Docker (avoids ../../tsconfig.base.json
# which is outside the build context)
COPY tsconfig.docker.json ./tsconfig.json
COPY src/ ./src/
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

RUN npm run build

ENTRYPOINT ["./docker-entrypoint.sh"]  # nosemgrep: dockerfile.security.missing-user-entrypoint

# ── Stage 2: Production ──────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
