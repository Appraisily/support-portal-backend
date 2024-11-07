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
RUN npm ci --only=production
COPY . .

# Create directory for Cloud SQL
RUN mkdir -p /cloudsql && \
    chown -R node:node /cloudsql

# Run migrations during build
RUN npm run migrate

USER node
EXPOSE 8080
CMD ["node", "src/index.js"]