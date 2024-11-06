// src/validators/ticketValidator.js
const { body } = require('express-validator');

exports.validateTicketCreate = [
  body('subject')
    .trim()
    .notEmpty()
    .withMessage('Subject is required'),
  
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority level'),
  
  body('customerId')
    .notEmpty()
    .withMessage('Customer ID is required')
];

exports.validateTicketUpdate = [
  body('status')
    .optional()
    .isIn(['open', 'hold', 'closed'])
    .withMessage('Invalid status'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority level'),
  
  body('assignedToId')
    .optional()
    .notEmpty()
    .withMessage('Invalid agent ID')
];

exports.validateTicketReply = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Reply content is required'),
  
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array')
];
