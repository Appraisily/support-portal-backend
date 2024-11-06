const jwt = require('jsonwebtoken');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.login = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    logger.info('Login attempt', { 
      email,
      hasCredentials: !!process.env.ADMIN_EMAIL
    });

    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      logger.error('Missing admin credentials');
      throw new ApiError(500, 'Server configuration error');
    }

    if (email !== process.env.ADMIN_EMAIL || 
        req.body.password !== process.env.ADMIN_PASSWORD) {
      logger.warn('Login failed', { email });
      throw new ApiError(401, 'Invalid credentials');
    }

    const token = jwt.sign(
      { id: '1', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info('Login successful', {
      email: process.env.ADMIN_EMAIL,
      role: 'admin'
    });

    res.json({
      token,
      user: {
        id: '1',
        email: process.env.ADMIN_EMAIL,
        role: 'admin'
      }
    });
  } catch (error) {
    logger.error('Login error', {
      error: error.message,
      email: req.body.email
    });
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    logger.info(`User ${req.user.id} logged out`);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};