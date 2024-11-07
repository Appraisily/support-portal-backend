#!/bin/sh
set -e

# Wait for database to be ready (in production)
if [ "$NODE_ENV" = "production" ]; then
    echo "Waiting for database..."
    /app/node_modules/.bin/sequelize-cli db:migrate
fi

# Start the application
exec node src/index.js