#!/bin/sh
set -e

echo "Running database migrations..."
if npx prisma migrate deploy 2>/tmp/prisma.log; then
  echo "Migrations complete."
else
  if grep -qiE "no.*schema|schema.*not.*found|P1012" /tmp/prisma.log 2>/dev/null; then
    echo "No Prisma schema yet — skipping migrations"
  else
    echo "ERROR: Migration failed:" >&2
    cat /tmp/prisma.log >&2
    exit 1
  fi
fi

exec "$@"
