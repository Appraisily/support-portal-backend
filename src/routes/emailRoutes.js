const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { validateAuth } = require('../middleware/auth');
const { validateEmailGeneration, validateTicketReplyGeneration } = require('../validators/emailValidator');

router.post('/generate-reply', validateAuth, validateEmailGeneration, emailController.generateReply);
router.post('/generate-ticket-reply/:ticketId', validateAuth, validateTicketReplyGeneration, emailController.generateTicketReply);

module.exports = router;