const GmailService = require('../services/GmailService');
const TicketService = require('../services/TicketService');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.handleWebhook = async (req, res, next) => {
  try {
    logger.info('Webhook received:', { 
      body: req.body,
      headers: req.headers 
    });

    const message = req.body.message;
    
    if (!message?.data) {
      logger.warn('Invalid webhook payload received:', req.body);
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Decodificar el payload
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    logger.info('Decoded webhook data:', data);
    
    if (data.emailId) {
      await GmailService.handleNewEmail(data.emailId);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error handling Gmail webhook:', error);
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