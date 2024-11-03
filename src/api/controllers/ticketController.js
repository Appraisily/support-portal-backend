const TicketService = require('../../services/TicketService');
const logger = require('../../utils/logger');

exports.listTickets = async (req, res, next) => {
  try {
    const result = await TicketService.listTickets(req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.getTicket = async (req, res, next) => {
  try {
    const ticket = await TicketService.getTicketById(req.params.id);
    res.json({ ticket });
  } catch (error) {
    next(error);
  }
};

exports.createTicket = async (req, res, next) => {
  try {
    const ticket = await TicketService.createTicket(req.body);
    res.status(201).json({ ticket });
  } catch (error) {
    next(error);
  }
};

exports.updateTicket = async (req, res, next) => {
  try {
    const ticket = await TicketService.updateTicket(req.params.id, req.body);
    res.json({ ticket });
  } catch (error) {
    next(error);
  }
};