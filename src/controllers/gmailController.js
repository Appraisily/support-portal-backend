const GmailService = require('../services/GmailService');
const logger = require('../utils/logger');

// No crear la instancia inmediatamente
let gmailService = null;

// Función helper para obtener/inicializar el servicio
const getGmailService = async () => {
  if (!gmailService) {
    gmailService = new GmailService();
    await gmailService.ensureInitialized();
  }
  return gmailService;
};

exports.handleWebhook = async (req, res) => {
  const startTime = Date.now();
  try {
    const service = await getGmailService();
    
    // Validar el cuerpo de la solicitud
    if (!req.body?.message?.data) {
      logger.warn('Invalid webhook data', { 
        body: req.body,
        hasMessage: !!req.body?.message 
      });
      return res.status(200).send('OK - Invalid data');
    }

    let notification;
    try {
      const decodedData = Buffer.from(req.body.message.data, 'base64').toString();
      notification = JSON.parse(decodedData);
    } catch (error) {
      logger.error('Error decoding webhook data', {
        error: error.message,
        rawData: req.body.message.data
      });
      return res.status(200).send('OK - Invalid data format');
    }

    if (!notification?.historyId || !notification?.emailAddress) {
      logger.warn('Invalid notification format', { notification });
      return res.status(200).send('OK - Invalid notification');
    }

    const result = await service.processNewEmails(notification);
    
    logger.info('Webhook processed successfully', {
      historyId: notification.historyId,
      processed: result?.processed || 0,
      tickets: result?.tickets || 0,
      processingTime: Date.now() - startTime
    });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Gmail webhook error', {
      error: error.message,
      stack: error.stack,
      processingTime: Date.now() - startTime,
      body: req.body
    });
    res.status(200).send('Error processed');
  }
};

exports.healthCheck = async (req, res) => {
  try {
    logger.info('Gmail health check initiated');
    
    const service = await getGmailService();
    const status = await service.testConnection();
    
    logger.info('Gmail health check completed', { status });
    
    res.json({ status });
  } catch (error) {
    logger.error('Gmail health check failed', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Gmail service health check failed' });
  }
};