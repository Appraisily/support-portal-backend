const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { validateAuth } = require('../middleware/auth');

// Generate AI reply for a ticket
router.post('/generate-ticket-reply/:ticketId', validateAuth, emailController.generateTicketReply);

module.exports = router;