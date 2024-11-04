const jwt = require('jsonwebtoken');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    logger.info('Login attempt:', { email });

    // Verificar contra las credenciales de Secret Manager
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
      logger.warn('Login failed: Invalid credentials');
      throw new ApiError(401, 'Invalid email or password');
    }

    const token = jwt.sign(
      { 
        id: '1',  // ID fijo para el admin
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info(`Admin logged in successfully`);
    res.json({
      token,
      user: {
        id: '1',
        name: 'Admin',
        email: process.env.ADMIN_EMAIL,
        role: 'admin'
      }
    });
  } catch (error) {
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