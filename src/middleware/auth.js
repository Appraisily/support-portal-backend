const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

exports.validateAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = await secretManager.getSecret('jwt-secret');

    if (!jwtSecret) {
      logger.error('JWT secret not configured');
      throw new Error('Authentication configuration missing');
    }

    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;

    logger.debug('Token validated', {
      userId: decoded.id,
      role: decoded.role
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid token', { error: error.message });
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      logger.warn('Token expired');
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    logger.error('Auth middleware error', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};