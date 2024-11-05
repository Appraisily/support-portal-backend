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

    // Validar que la petición viene de Google
    const googleIPs = ['66.249.93.', '142.250.', '35.191.'];
    const clientIP = req.headers['x-forwarded-for'] || req.ip;
    
    if (!googleIPs.some(ip => clientIP.startsWith(ip))) {
      logger.warn('Invalid webhook request - unexpected IP:', clientIP);
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Validar el payload
    const message = req.body.message;
    if (!message?.data) {
      logger.warn('Invalid webhook payload - missing message data');
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Decodificar el payload
    const decodedData = Buffer.from(message.data, 'base64').toString();
    const notification = JSON.parse(decodedData);
    logger.info('Decoded webhook data:', notification);

    // Procesar solo si el historyId es mayor que el último procesado
    const lastHistoryId = await GmailService.getLastHistoryId();
    if (!lastHistoryId || notification.historyId > lastHistoryId) {
      await GmailService.processNewEmails(notification);
      await GmailService.updateLastHistoryId(notification.historyId);
    } else {
      logger.info('Skipping notification - already processed:', {
        current: notification.historyId,
        last: lastHistoryId
      });
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
    
    // Obtener los últimos 5 emails sin leer.
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

exports.setupWatch = async (req, res, next) => {
  try {
    logger.info('Setting up Gmail watch...');
    const result = await GmailService.setupGmailWatch();
    
    res.json({
      success: true,
      watchDetails: result
    });
  } catch (error) {
    logger.error('Failed to setup Gmail watch:', error);
    next(error);
  }
};