const { body, param } = require('express-validator');

exports.validateCustomerId = [
  param('customerId')
    .isMongoId()
    .withMessage('Invalid customer ID format')
];

exports.validateCustomerCreate = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required'),
  body('email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('Avatar must be a valid URL')
];