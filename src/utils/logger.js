const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ level, message, timestamp }) => {
          // Simplificar el formato de timestamp
          const time = new Date(timestamp).toLocaleTimeString();
          return `${time} ${level}: ${message}`;
        })
      )
    })
  ]
});

// Reducir logs en producción
if (process.env.NODE_ENV === 'production') {
  logger.level = 'info';
}

module.exports = logger;