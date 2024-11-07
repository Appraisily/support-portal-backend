const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

exports.errorHandler = (err, req, res, next) => {
  logger.error('Error handler caught error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Handle specific API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
  }

  // Handle Sequelize errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // Handle other errors
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};