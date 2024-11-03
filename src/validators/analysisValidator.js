const { body } = require('express-validator');

exports.validateAnalysisRequest = [
  body('customerId')
    .notEmpty()
    .withMessage('Customer ID is required'),
  
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .isString()
    .withMessage('Message must be a string'),
  
  body('purchaseHistory')
    .isArray()
    .withMessage('Purchase history must be an array'),
  
  body('purchaseHistory.*.id')
    .notEmpty()
    .withMessage('Purchase ID is required'),
  
  body('purchaseHistory.*.date')
    .notEmpty()
    .withMessage('Purchase date is required')
    .isISO8601()
    .withMessage('Invalid date format'),
  
  body('purchaseHistory.*.amount')
    .isNumeric()
    .withMessage('Amount must be a number'),
  
  body('purchaseHistory.*.status')
    .isIn(['completed', 'pending', 'refunded', 'cancelled'])
    .withMessage('Invalid purchase status'),
  
  body('purchaseHistory.*.items')
    .isArray()
    .withMessage('Items must be an array'),
  
  body('purchaseHistory.*.items.*.name')
    .notEmpty()
    .withMessage('Item name is required'),
  
  body('purchaseHistory.*.items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  
  body('purchaseHistory.*.items.*.price')
    .isNumeric()
    .withMessage('Price must be a number')
];