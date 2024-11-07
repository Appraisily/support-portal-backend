const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

exports.validateResult = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation failed', {
      errors: errors.array(),
      path: req.path,
      method: req.method,
      body: req.body
    });

    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  next();
}; 