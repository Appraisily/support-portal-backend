const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { validateAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

// Middleware to log email route access
router.use((req, res, next) => {
  logger.info('Email route accessed:', {
    method: req.method,
    path: req.path,
    params: req.params,
    query: req.query,
    hasBody: !!req.body,
    contentLength: req.headers['content-length'],
    contentType: req.headers['content-type']
  });
  next();
});

// Configure express to parse JSON
router.use(express.json());

// Generate AI reply for a ticket
router.post('/generate-ticket-reply/:ticketId', validateAuth, async (req, res, next) => {
  try {
    logger.info('Starting AI reply generation request:', {
      ticketId: req.params.ticketId,
      userId: req.user?.id,
      body: req.body
    });
    await emailController.generateTicketReply(req, res);
  } catch (error) {
    logger.error('Error in email route handler:', {
      error: error.message,
      stack: error.stack,
      ticketId: req.params.ticketId
    });
    next(error);
  }
});

module.exports = router;