#!/bin/sh
set -e

mkdir -p /data/uploads

echo "Applying database migrations..."
npx prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding database..."
  npm run db:seed || true
fi

echo "Starting ShelfLedger on port ${PORT:-3000}..."
exec "$@"
