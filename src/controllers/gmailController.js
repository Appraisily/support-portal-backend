const GmailService = require('../services/GmailService');
const logger = require('../utils/logger');

exports.handleWebhook = async (req, res) => {
  const startTime = Date.now();
  try {
    // Validar el cuerpo de la solicitud
    if (!req.body || typeof req.body !== 'object') {
      logger.warn('Invalid request body', { body: req.body });
      return res.status(400).send('Invalid request');
    }

    logger.info('Gmail webhook received', {
      messageId: req.body?.message?.messageId,
      publishTime: req.body?.message?.publishTime,
      hasData: !!req.body?.message?.data
    });

    // Añadir validación de tamaño de datos
    if (req.body?.message?.data?.length > 1000000) { // 1MB limit
      logger.warn('Webhook data too large', {
        size: req.body.message.data.length
      });
      return res.status(413).send('Payload too large');
    }

    if (!req.body?.message?.data) {
      logger.warn('Invalid webhook data received', {
        body: JSON.stringify(req.body),
        hasMessage: !!req.body?.message
      });
      return res.status(200).send('OK - Invalid data');
    }

    const rawData = req.body.message.data;
    let notification;
    try {
      const decodedData = Buffer.from(rawData, 'base64').toString();
      notification = JSON.parse(decodedData);
    } catch (error) {
      logger.error('Error decoding webhook data', {
        error: error.message,
        rawData,
        body: JSON.stringify(req.body)
      });
      return res.status(200).send('OK - Invalid data format');
    }

    if (!notification?.historyId || !notification?.emailAddress) {
      logger.warn('Missing required notification data', {
        notification: JSON.stringify(notification)
      });
      return res.status(200).send('OK - Invalid notification format');
    }

    logger.info('Processing Gmail notification', {
      historyId: notification.historyId,
      emailAddress: notification.emailAddress,
      timestamp: new Date().toISOString()
    });

    const result = await GmailService.processNewEmails(notification);
    
    logger.info('Gmail webhook processing complete', {
      emailsProcessed: result?.processed || 0,
      ticketsCreated: result?.tickets || 0,
      historyId: notification.historyId,
      newHistoryId: result?.historyId,
      skipped: result?.skipped,
      updated: result?.updated,
      processingTime: Date.now() - startTime
    });

    res.status(200).send('OK');
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Gmail webhook error', {
      error: error.message,
      stack: error.stack,
      processingTime,
      body: typeof req.body === 'object' ? JSON.stringify(req.body) : 'invalid'
    });
    
    // Siempre devolver 200 para evitar reintentos de PubSub
    res.status(200).send('Error processed');
  }
};

exports.healthCheck = async (req, res) => {
  try {
    logger.info('Gmail health check initiated');
    
    const gmailService = new GmailService();
    const status = await gmailService.testConnection();
    
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