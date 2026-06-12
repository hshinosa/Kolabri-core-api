#!/bin/sh
set -e

echo "🚀 Starting Kolabri Core API..."
echo "📊 Running database migrations..."

# Jalankan migrasi Prisma
npx prisma migrate deploy

echo "✅ Migrations completed successfully"
echo "🌐 Starting application server..."

# Jalankan aplikasi
exec "$@"
