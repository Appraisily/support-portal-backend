const { body, param } = require('express-validator');
const { validateResult } = require('../middleware/validator');

exports.validateEmailGeneration = [
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ max: 5000 })
    .withMessage('Message too long (max 5000 characters)'),

  body('context')
    .optional()
    .isObject()
    .withMessage('Context must be an object'),

  body('context.customerStatus')
    .optional()
    .isString()
    .withMessage('Customer status must be a string'),

  body('context.previousInteractions')
    .optional()
    .isString()
    .withMessage('Previous interactions must be a string'),

  body('context.recentPurchases')
    .optional()
    .isBoolean()
    .withMessage('Recent purchases must be a boolean'),

  body('context.priority')
    .optional()
    .isString()
    .withMessage('Priority must be a string'),

  validateResult
];

exports.validateTicketReplyGeneration = [
  param('ticketId')
    .isUUID()
    .withMessage('Invalid ticket ID format'),

  validateResult
];