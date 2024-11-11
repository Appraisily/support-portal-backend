#!/bin/sh
set -e

# Wait for Cloud SQL proxy in production
if [ "$NODE_ENV" = "production" ]; then
    echo "Waiting for Cloud SQL proxy..."
    # Wait for the Unix Domain Socket to be available
    until [ -S "/cloudsql/${CLOUD_SQL_CONNECTION_NAME}/.s.PGSQL.5432" ] || [ -S "/tmp/cloudsql/${CLOUD_SQL_CONNECTION_NAME}/.s.PGSQL.5432" ]; do
        echo "Waiting for Cloud SQL socket..."
        sleep 2
    done
    echo "Cloud SQL proxy is ready"
fi

# Run migrations if in production
if [ "$NODE_ENV" = "production" ]; then
    echo "Running database migrations..."
    sequelize-cli db:migrate
fi

# Start the application
exec node src/index.js