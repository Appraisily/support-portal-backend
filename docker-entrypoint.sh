#!/bin/sh
set -e

# Maximum wait time in seconds
MAX_WAIT=30
START_TIME=$(date +%s)

# Function to check if required environment variables are set
check_env_vars() {
    for var in "$@"; do
        if [ -z "$(eval echo \$$var)" ]; then
            return 1
        fi
    done
    return 0
}

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

    # Check required environment variables
    REQUIRED_VARS="DB_USER DB_PASSWORD DB_NAME CLOUD_SQL_CONNECTION_NAME"
    echo "Checking required environment variables..."
    
    until check_env_vars $REQUIRED_VARS; do
        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - START_TIME))
        
        if [ $ELAPSED -gt $MAX_WAIT ]; then
            echo "Timeout waiting for environment variables"
            echo "Missing variables:"
            for var in $REQUIRED_VARS; do
                if [ -z "$(eval echo \$$var)" ]; then
                    echo "- $var"
                fi
            done
            exit 1
        fi
        
        echo "Waiting for environment variables..."
        sleep 2
    done
    echo "All required environment variables are set"

    # Print configuration (without sensitive data)
    echo "Configuration:"
    echo "NODE_ENV: $NODE_ENV"
    echo "DB_HOST: $DB_HOST"
    echo "DB_NAME: $DB_NAME"
    echo "DB_USER: $DB_USER"
    echo "CLOUD_SQL_CONNECTION_NAME: $CLOUD_SQL_CONNECTION_NAME"
fi

# Start the application
echo "Starting application..."
exec node src/index.js