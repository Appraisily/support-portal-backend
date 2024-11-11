// src/validators/messageValidator.js
const { body } = require('express-validator');

exports.validateMessage = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Message content is required'),
  
  body('internal')
    .optional()
    .isBoolean()
    .withMessage('Internal flag must be a boolean')
];
