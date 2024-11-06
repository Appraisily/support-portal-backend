FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Remove devDependencies
RUN npm prune --production

# Set production environment
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "src/index.js"]
