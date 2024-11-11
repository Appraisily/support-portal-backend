// src/validators/ticketValidator.js
const { body, param } = require('express-validator');
const { validateResult } = require('../middleware/validator');

exports.validateTicketCreate = [
  body('subject')
    .trim()
    .notEmpty()
    .withMessage('Subject is required')
    .isLength({ min: 3, max: 255 })
    .withMessage('Subject must be between 3 and 255 characters'),
  
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
    .isUUID(4)
    .withMessage('Invalid customer ID format'),

  validateResult
];

exports.validateTicketUpdate = [
  param('id')
    .isUUID(4)
    .withMessage('Invalid ticket ID format'),
    
  body('status')
    .optional()
    .isIn(['open', 'in_progress', 'closed'])
    .withMessage('Invalid status'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority level'),
  
  body('assignedToId')
    .optional()
    .isUUID(4)
    .withMessage('Invalid agent ID format'),

  validateResult
];

exports.validateTicketReply = [
  param('id')
    .isUUID(4)
    .withMessage('Invalid ticket ID format'),
    
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Reply content is required')
    .isLength({ max: 10000 })
    .withMessage('Reply content too long'),
  
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array')
    .custom((value) => {
      if (value && value.length > 10) {
        throw new Error('Maximum 10 attachments allowed');
      }
      return true;
    }),

  validateResult
];
