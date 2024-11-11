const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { validateTicketCreate, validateTicketUpdate } = require('../validators/ticketValidator');

router.get('/', ticketController.listTickets);
router.get('/:id', ticketController.getTicket);
router.post('/', validateTicketCreate, ticketController.createTicket);
router.patch('/:id', validateTicketUpdate, ticketController.updateTicket);

module.exports = router;