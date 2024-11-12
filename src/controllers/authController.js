const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
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

    logger.info('Login attempt', { email });

    // Get all required secrets
    const [jwtSecret, adminEmail, adminPassword] = await Promise.all([
      secretManager.getSecret('jwt-secret'),
      secretManager.getSecret('ADMIN_EMAIL'),
      secretManager.getSecret('ADMIN_PASSWORD')
    ]);

    if (!jwtSecret || !adminEmail || !adminPassword) {
      logger.error('Missing required secrets for authentication');
      throw new Error('Authentication configuration missing');
    }

    // Verify credentials
    if (email !== adminEmail || password !== adminPassword) {
      logger.warn('Invalid login credentials', { email });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
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
      token,
      user: {
        id: 'admin',
        email: adminEmail,
        name: 'Administrator',
        role: 'admin'
      }
    });

  } catch (error) {
    logger.error('Login error', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

exports.logout = async (req, res) => {
  try {
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