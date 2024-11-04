const { models } = require('../config/database');
const jwt = require('jsonwebtoken');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    logger.info('Login attempt:', { email });

    const user = await models.User.findOne({ 
      where: { email }
    });

    if (!user) {
      logger.warn('Login failed: User not found', { email });
      throw new ApiError(401, 'Invalid email or password');
    }

    const isValidPassword = await user.comparePassword(password);
    logger.info('Password check:', { 
      email,
      isValid: isValidPassword
    });

    if (!isValidPassword) {
      logger.warn('Login failed: Invalid password', { email });
      throw new ApiError(401, 'Invalid email or password');
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env['jwt-secret'],
      { expiresIn: '24h' }
    );

    logger.info(`User ${user.email} logged in`);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
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