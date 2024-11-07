const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { validateAuth } = require('../middleware/auth');

// Apply authentication to all routes
router.use(validateAuth);

// Ticket routes
router.get('/', ticketController.listTickets);
router.get('/:id', ticketController.getTicket);
router.post('/', ticketController.createTicket);
router.patch('/:id', ticketController.updateTicket);

module.exports = router;