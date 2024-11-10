#!/bin/sh
set -e

# Wait for database to be ready (in production)
if [ "$NODE_ENV" = "production" ]; then
    echo "Waiting for Cloud SQL proxy..."
    # Wait for the Unix Domain Socket to be available
    while [ ! -S "/cloudsql/${CLOUD_SQL_CONNECTION_NAME}/.s.PGSQL.5432" ]; do
        echo "Waiting for Cloud SQL socket..."
        sleep 2
    done
fi

# Start the application
exec node src/index.js