const { body } = require('express-validator');

exports.validatePredefinedReply = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required'),
  body('category')
    .isIn(['general', 'technical', 'billing', 'feature', 'bug'])
    .withMessage('Invalid category')
];