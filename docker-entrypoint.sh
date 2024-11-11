#!/bin/sh
set -e

# Maximum wait time in seconds
MAX_WAIT=60
START_TIME=$(date +%s)

# Wait for Cloud SQL proxy in production
if [ "$NODE_ENV" = "production" ]; then
    echo "Waiting for Cloud SQL proxy..."
    until [ -S "/cloudsql/${CLOUD_SQL_CONNECTION_NAME}/.s.PGSQL.5432" ]; do
        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - START_TIME))
        
        if [ $ELAPSED -gt $MAX_WAIT ]; then
            echo "Timeout waiting for Cloud SQL proxy"
            exit 1
        fi
        
        echo "Waiting for Cloud SQL socket..."
        sleep 2
    done
    echo "Cloud SQL proxy is ready"
fi

# Start the application - let Node.js handle secrets loading
echo "Starting application..."
exec node src/index.js