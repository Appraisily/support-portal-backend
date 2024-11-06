const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

exports.validateAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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