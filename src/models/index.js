const database = require('../config/database');
const logger = require('../utils/logger');

try {
  logger.info('Loading database models');
  module.exports = database;
} catch (error) {
  logger.error('Failed to load database models', {
    error: error.message,
    stack: error.stack
  });
  throw error;
}