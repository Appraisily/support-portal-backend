FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies temporarily)
RUN npm install

# Copy application code
COPY . .

# Remove devDependencies
RUN npm prune --production

# Set production environment
ENV NODE_ENV=production

# Ensure the port is exposed
EXPOSE 8080

# Use node directly instead of npm for better container signals handling
CMD ["node", "src/index.js"]