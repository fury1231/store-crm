#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy 2>/dev/null || echo "No Prisma schema yet — skipping migrations"

exec "$@"
