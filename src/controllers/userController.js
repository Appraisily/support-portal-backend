const User = require('../models/user');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.getCurrentUser = async (req, res, next) => {
  try {
    logger.info('Getting current user', {
      userId: req.user?.id
    });

    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      logger.warn('User not found', { userId: req.user.id });
      throw new ApiError(404, 'User not found');
    }

    logger.info('User retrieved successfully', {
      userId: user.id,
      email: user.email
    });

    res.json({ user });
  } catch (error) {
    logger.error('Error getting current user', {
      userId: req.user?.id,
      error: error.message
    });
    next(error);
  }
};

exports.updatePreferences = async (req, res, next) => {
  try {
    const { notifications, theme } = req.body;
    
    logger.info('Updating user preferences', {
      userId: req.user?.id,
      updates: { notifications, theme }
    });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        'preferences.notifications': notifications,
        'preferences.theme': theme
      },
      { new: true }
    ).select('preferences');

    if (!user) {
      logger.warn('User not found for preference update', { 
        userId: req.user.id 
      });
      throw new ApiError(404, 'User not found');
    }

    logger.info('User preferences updated successfully', {
      userId: user.id,
      preferences: user.preferences
    });

    res.json({ preferences: user.preferences });
  } catch (error) {
    logger.error('Error updating preferences', {
      userId: req.user?.id,
      error: error.message
    });
    next(error);
  }
};