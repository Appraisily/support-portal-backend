const jwt = require('jsonwebtoken');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    logger.info('Auth headers:', { 
      hasAuth: !!authHeader,
      headerValue: authHeader
    });
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authentication required');
    }

    const token = authHeader.split(' ')[1];
    logger.info('Verifying token with secret:', { 
      hasToken: !!token,
      hasSecret: !!process.env['jwt-secret']
    });

    const decoded = jwt.verify(token, process.env['jwt-secret']);
    logger.info('Token verified successfully:', { userId: decoded.id });
    
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    if (error.name === 'JsonWebTokenError') {
      next(new ApiError(401, 'Invalid token'));
    } else {
      next(error);
    }
  }
};