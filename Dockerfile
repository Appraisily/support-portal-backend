FROM node:18-slim as base
WORKDIR /app
COPY package*.json ./

# Development stage with devDependencies
FROM base as development
RUN npm install
COPY . .
EXPOSE 8080
CMD ["npm", "run", "dev"]

# Production stage
FROM base as production
# Install production dependencies and sequelize-cli globally
RUN npm ci --only=production && \
    npm install -g sequelize-cli

COPY . .

# Create directory for Cloud SQL and set up entrypoint
RUN mkdir -p /cloudsql && \
    chown -R node:node /cloudsql && \
    cp docker-entrypoint.sh /usr/local/bin/ && \
    chmod +x /usr/local/bin/docker-entrypoint.sh && \
    chown node:node /usr/local/bin/docker-entrypoint.sh

# Set production environment variables
ENV NODE_ENV=production

# Switch to non-root user
USER node

EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]