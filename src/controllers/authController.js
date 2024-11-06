const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { getModels } = require('../config/database');
const bcryptjs = require('bcryptjs');

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

    const models = await getModels();
    const user = await models.User.findOne({ 
      where: { email },
      attributes: ['id', 'email', 'password', 'role', 'name']
    });

    if (!user || !(await bcryptjs.compare(password, user.password))) {
      logger.warn('Login failed: invalid credentials', { email });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info('Login successful', {
      email: user.email,
      role: user.role,
      userId: user.id
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
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