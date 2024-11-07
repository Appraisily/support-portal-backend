const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const bcryptjs = require('bcryptjs');
const secretManager = require('../utils/secretManager');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    logger.info('Login attempt', {
      email,
      hasCredentials: true
    });

    // Obtener credenciales de admin desde Secret Manager
    const adminEmail = await secretManager.getSecret('ADMIN_EMAIL');
    const adminPassword = await secretManager.getSecret('ADMIN_PASSWORD');

    // Verificar si las credenciales coinciden con el admin
    if (email !== adminEmail || password !== adminPassword) {
      logger.warn('Login failed: invalid credentials', { email });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verificar JWT_SECRET
    const jwtSecret = await secretManager.getSecret('jwt-secret');
    if (!jwtSecret) {
      logger.error('JWT secret not found');
      throw new Error('JWT configuration missing');
    }

    const token = jwt.sign(
      { 
        id: 'admin',
        email: adminEmail,
        role: 'admin'
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    logger.info('Login successful', {
      email: adminEmail,
      role: 'admin'
    });

    res.json({
      success: true,
      data: {
        user: {
          id: 'admin',
          email: adminEmail,
          name: 'Administrator',
          role: 'admin'
        },
        token
      }
    });

  } catch (error) {
    logger.error('Login error', {
      error: error.message,
      stack: error.stack,
      email: req.body.email
    });
    next(error);
  }
};

exports.logout = async (req, res) => {
  try {
    // Implementar lógica de logout si es necesario
    // Por ejemplo, invalidar el token en una lista negra
    logger.info('User logged out', {
      userId: req.user?.id
    });
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error', {
      error: error.message,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error during logout'
    });
  }
};