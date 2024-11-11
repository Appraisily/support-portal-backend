#!/bin/sh
set -e

# Function to wait for secrets to be available
wait_for_secrets() {
    echo "Waiting for secrets to be available..."
    until [ -n "$DB_USER" ] && [ -n "$DB_PASSWORD" ] && [ -n "$DB_NAME" ]; do
        echo "Waiting for database secrets..."
        sleep 2
    done
    echo "Database secrets are available"
}

# Wait for Cloud SQL proxy in production
if [ "$NODE_ENV" = "production" ]; then
    echo "Waiting for Cloud SQL proxy..."
    until [ -S "/cloudsql/${CLOUD_SQL_CONNECTION_NAME}/.s.PGSQL.5432" ] || [ -S "/tmp/cloudsql/${CLOUD_SQL_CONNECTION_NAME}/.s.PGSQL.5432" ]; do
        echo "Waiting for Cloud SQL socket..."
        sleep 2
    done
    echo "Cloud SQL proxy is ready"

    # Wait for secrets
    wait_for_secrets

    # Run migrations
    echo "Running database migrations..."
    sequelize-cli db:migrate
fi

# Start the application
exec node src/index.js