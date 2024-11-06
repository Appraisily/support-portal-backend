const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...rest }) => {
      // Convertir los datos adicionales a string si existen
      const extraData = Object.keys(rest).length ? 
        '\n' + JSON.stringify(rest, null, 2) : '';
      
      return `${timestamp} ${level}: ${message}${extraData}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
          // Asegurarnos de que los objetos se muestran correctamente
          const extraData = Object.keys(rest).length ? 
            '\n' + JSON.stringify(rest, null, 2) : '';
          
          return `${timestamp} ${level}: ${message}${extraData}`;
        })
      )
    })
  ]
});

// Añadir método para logging más detallado
logger.debug = (message, data) => {
  logger.log('debug', message, { data: JSON.stringify(data, null, 2) });
};

logger.info = (message, data) => {
  logger.log('info', message, data ? { data: JSON.stringify(data, null, 2) } : {});
};

logger.error = (message, data) => {
  logger.log('error', message, data ? { data: JSON.stringify(data, null, 2) } : {});
};

module.exports = logger;