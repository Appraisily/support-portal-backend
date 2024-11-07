const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

exports.validateAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const jwtSecret = await secretManager.getSecret('jwt-secret');
    if (!jwtSecret) {
      throw new Error('JWT secret not configured');
    }

    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;

    logger.info('Token validated', {
      userId: decoded.id,
      role: decoded.role
    });

    next();
  } catch (error) {
    logger.error('Token validation error', {
      error: error.message,
      token: req.headers.authorization?.substring(0, 20) + '...'
    });
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};