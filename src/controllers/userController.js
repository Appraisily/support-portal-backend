const User = require('../models/user');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
};

exports.updatePreferences = async (req, res, next) => {
  try {
    const { notifications, theme } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        'preferences.notifications': notifications,
        'preferences.theme': theme
      },
      { new: true }
    ).select('preferences');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    logger.info(`User ${req.user.id} preferences updated`);
    res.json({ preferences: user.preferences });
  } catch (error) {
    next(error);
  }
};