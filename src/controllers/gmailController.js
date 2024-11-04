const GmailService = require('../services/GmailService');
const TicketService = require('../services/TicketService');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.handleWebhook = async (req, res, next) => {
  try {
    const { message } = req.body;
    const result = await GmailService.handleWebhook(message);
    
    logger.info('Gmail webhook processed successfully');
    res.json({
      success: true,
      ticketId: result.ticketId,
      messageId: result.messageId
    });
  } catch (error) {
    next(error);
  }
};

exports.syncThread = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await TicketService.getTicketById(id);
    
    if (!ticket.gmailThreadId) {
      throw new ApiError(400, 'Ticket not linked to Gmail thread');
    }

    const result = await GmailService.syncThread(ticket.gmailThreadId);
    
    logger.info(`Gmail thread synced for ticket ${id}`);
    res.json({
      success: true,
      newMessages: result.newMessages
    });
  } catch (error) {
    next(error);
  }
};

exports.testConnection = async (req, res, next) => {
  try {
    logger.info('Testing Gmail connection...');
    
    // Obtener los últimos 5 emails sin leer
    const result = await GmailService.testConnection();
    
    res.json({
      success: true,
      connectionStatus: 'OK',
      testResult: result
    });
  } catch (error) {
    logger.error('Gmail connection test failed:', error);
    next(error);
  }
};