const winston = require('winston');

// Formato personalizado para los logs
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  // Simplificar el manejo de metadatos
  let meta = '';
  if (Object.keys(metadata).length > 0) {
    // Filtrar el campo 'data' si existe y usar directamente el contenido
    const cleanMeta = metadata.data ? JSON.parse(metadata.data) : metadata;
    meta = `\n${JSON.stringify(cleanMeta, null, 2)}`;
  }

  return `${timestamp} ${level}: ${message}${meta}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        customFormat
      )
    })
  ]
});

// Métodos simplificados
logger.debug = (message, meta = {}) => {
  logger.log('debug', message, meta);
};

logger.info = (message, meta = {}) => {
  // Evitar doble stringify
  const cleanMeta = typeof meta === 'string' ? JSON.parse(meta) : meta;
  logger.log('info', message, cleanMeta);
};

logger.error = (message, meta = {}) => {
  // Para errores, incluir stack trace si está disponible
  const errorMeta = meta instanceof Error ? 
    { 
      message: meta.message,
      stack: meta.stack,
      ...meta
    } : meta;
  
  logger.log('error', message, errorMeta);
};

module.exports = logger;