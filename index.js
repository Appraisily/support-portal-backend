const logger = require('./src/utils/logger');

logger.info('Node.js version information', {
  nodeVersion: process.versions.node,
  v8Version: process.versions.v8,
  environment: process.env.NODE_ENV
});
