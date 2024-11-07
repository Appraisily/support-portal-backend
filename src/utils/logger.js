const winston = require('winston');

// Custom format that properly handles objects and errors
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let meta = '';
  
  // Handle metadata/additional context
  if (Object.keys(metadata).length > 0) {
    // Remove empty objects and undefined values
    const cleanMeta = Object.entries(metadata).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});

    // Only add metadata if there's actual content
    if (Object.keys(cleanMeta).length > 0) {
      meta = `\n${JSON.stringify(cleanMeta, null, 2)}`;
    }
  }

  return `${timestamp} [${level}]: ${message}${meta}`;
});

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    customFormat
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        customFormat
      )
    })
  ]
});

// Helper methods with improved formatting
const formatError = (error) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      ...(error.code && { code: error.code }),
      ...(error.statusCode && { statusCode: error.statusCode })
    };
  }
  return error;
};

logger.debug = (message, meta = {}) => {
  if (meta instanceof Error) {
    meta = formatError(meta);
  }
  logger.log('debug', message, meta);
};

logger.info = (message, meta = {}) => {
  if (meta instanceof Error) {
    meta = formatError(meta);
  }
  logger.log('info', message, meta);
};

logger.warn = (message, meta = {}) => {
  if (meta instanceof Error) {
    meta = formatError(meta);
  }
  logger.log('warn', message, meta);
};

logger.error = (message, meta = {}) => {
  if (meta instanceof Error) {
    meta = formatError(meta);
  }
  logger.log('error', message, meta);
};

module.exports = logger;