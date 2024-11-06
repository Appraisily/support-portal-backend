FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install bcryptjs explícitamente first
RUN npm install bcryptjs@2.4.3

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Remove devDependencies and ensure bcryptjs remains
RUN npm prune --production && \
    npm list | grep bcryptjs

# Set production environment
ENV NODE_ENV=production

EXPOSE 8080

# Verify dependencies installed at startup
CMD ["sh", "-c", "npm list | grep bcryptjs && node src/index.js"]
