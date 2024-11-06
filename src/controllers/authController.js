const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    logger.info('Login attempt', {
      email,
      hasCredentials: !!password,
      timestamp: new Date().toISOString()
    });

    const models = await getModels();
    const user = await models.User.findOne({ 
      where: { email },
      attributes: ['id', 'email', 'password', 'role', 'name']
    });

    if (!user || !(await user.comparePassword(password))) {
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

exports.validateToken = async (req, res, next) => {
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