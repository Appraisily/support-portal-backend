const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { validateAuth } = require('../middleware/auth');
const { 
  validateTicketCreate, 
  validateTicketUpdate,
  validateTicketReply 
} = require('../validators/ticketValidator');

// Aplicar autenticación a todas las rutas
router.use(validateAuth);

// Rutas de tickets
router.get('/', ticketController.listTickets);
router.get('/:id', ticketController.getTicket);
router.post('/', validateTicketCreate, ticketController.createTicket);
router.patch('/:id', validateTicketUpdate, ticketController.updateTicket);
router.post('/:id/reply', validateTicketReply, ticketController.replyToTicket);

module.exports = router;