#!/bin/sh
set -e

echo "⏳ Running database migrations..."
node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma

echo "⏳ Seeding database..."
node prisma/seed.js || true

echo "✅ Starting application..."
exec node server.js
