const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { validateAuth } = require('../middleware/auth');
const { 
  validateTicketCreate, 
  validateTicketUpdate,
  validateTicketReply 
} = require('../validators/ticketValidator');

// Apply authentication to all routes
router.use(validateAuth);

// Ticket routes with proper controller methods
router.get('/', ticketController.listTickets);
router.get('/:id', ticketController.getTicket);
router.post('/', validateTicketCreate, ticketController.createTicket);
router.patch('/:id', validateTicketUpdate, ticketController.updateTicket);
router.post('/:id/reply', validateTicketReply, ticketController.replyToTicket);

module.exports = router;