const jwt = require('jsonwebtoken');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    logger.info('Login attempt:', { 
      email,
      hasAdminEmail: !!process.env.ADMIN_EMAIL,
      hasAdminPassword: !!process.env.ADMIN_PASSWORD
    });

    // Verificar que tenemos las credenciales cargadas
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      logger.error('Admin credentials not loaded');
      throw new ApiError(500, 'Error de configuración del servidor');
    }

    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
      logger.warn('Login failed:', { 
        email,
        invalidEmail: email !== process.env.ADMIN_EMAIL,
        invalidPassword: password !== process.env.ADMIN_PASSWORD
      });
      throw new ApiError(401, 'Credenciales inválidas');
    }

    // Verificar que tenemos el secreto JWT
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET not loaded');
      throw new ApiError(500, 'Error de configuración del servidor');
    }

    const token = jwt.sign(
      { 
        id: '1',
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info('Admin logged in successfully:', {
      email: process.env.ADMIN_EMAIL,
      tokenGenerated: !!token
    });

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
    logger.error('Login error:', {
      error: error.message,
      stack: error.stack
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