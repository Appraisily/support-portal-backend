#!/bin/sh
set -e

# Wait for database to be ready (in production)
if [ "$NODE_ENV" = "production" ]; then
    echo "Waiting for Cloud SQL proxy..."
    # Add a small delay to ensure the Cloud SQL proxy is ready
    sleep 5
    
    echo "Running database migrations..."
    NODE_ENV=production /app/node_modules/.bin/sequelize-cli db:migrate
    
    if [ $? -ne 0 ]; then
        echo "Migration failed!"
        exit 1
    fi
fi

# Start the application
exec node src/index.js