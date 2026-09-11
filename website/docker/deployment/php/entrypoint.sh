#!/bin/sh
set -e

cd /var/www/backend

# Wait for the (external) database to accept connections before migrating.
echo "Waiting for the database to become available..."
tries=0
until php bin/console dbal:run-sql "SELECT 1" --no-interaction >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "Database still not reachable after ${tries} attempts — continuing without a confirmed connection."
    break
  fi
  sleep 2
done

echo "Applying database migrations..."
php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration || \
  echo "WARNING: migration step failed; starting the app anyway."

exec "$@"
