const GmailService = require('../services/GmailService');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');
const appState = require('../utils/singleton');

exports.testConnection = async (req, res) => {
  try {
    await GmailService.testConnection();
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Test connection failed:', error);
    res.status(500).json({ error: 'Connection test failed' });
  }
};

exports.syncThread = async (req, res) => {
  try {
    const { id } = req.params;
    await GmailService.syncThread(id);
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Thread sync failed:', error);
    res.status(500).json({ error: 'Thread sync failed' });
  }
};

exports.setupWatch = async (req, res) => {
  try {
    await GmailService.setupGmailWatch();
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Watch setup failed:', error);
    res.status(500).json({ error: 'Watch setup failed' });
  }
};

exports.handleWebhook = async (req, res) => {
  try {
    logger.info('Raw webhook request:', {
      headers: req.headers,
      body: req.body,
      rawBody: req.rawBody,
      query: req.query
    });

    const clientIP = req.headers['x-forwarded-for'] || req.ip;
    const googleIPs = ['66.249.93.', '142.250.', '35.191.'];
    
    if (!req.body?.message?.data) {
      logger.warn('Missing message data structure:', {
        hasBody: !!req.body,
        hasMessage: !!req.body?.message,
        hasData: !!req.body?.message?.data,
        body: JSON.stringify(req.body)
      });
      return res.status(200).send('OK');
    }

    // Decodificar el mensaje en base64
    const rawData = req.body.message.data;
    const decodedData = Buffer.from(rawData, 'base64').toString();
    
    logger.info('Webhook data details:', {
      rawData,
      decodedData,
      decodedJSON: JSON.parse(decodedData),
      messageId: req.body.message.messageId,
      publishTime: req.body.message.publishTime
    });

    const notification = JSON.parse(decodedData);

    logger.info('Decoded webhook notification:', {
      historyId: notification.historyId,
      emailAddress: notification.emailAddress,
      notification: JSON.stringify(notification),
      rawData: req.body.message.data
    });

    // Si es una notificación de configuración inicial, solo logueamos y OK
    if (!notification.emailAddress || !notification.historyId) {
      logger.info('Received watch setup confirmation:', {
        notification: JSON.stringify(notification)
      });
      return res.status(200).send('OK');
    }

    // Asegurarnos de que la app está inicializada
    logger.info('Initializing application before processing webhook...', {
      historyId: notification.historyId,
      emailAddress: notification.emailAddress
    });
    await appState.initialize();

    // Solo procesamos si parece una notificación real de email
    const result = await GmailService.processNewEmails(notification);
    
    logger.info('Email processing complete:', {
      success: true,
      emailsProcessed: result?.processed || 0,
      ticketsCreated: result?.tickets || 0,
      historyId: notification.historyId,
      result: JSON.stringify(result)
    });

    res.status(200).send('OK');

  } catch (error) {
    logger.error('Webhook error:', {
      error: error.message,
      stack: error.stack,
      notification: JSON.stringify(req.body?.message?.data),
      rawBody: JSON.stringify(req.body),
      type: error.constructor.name
    });
    res.status(200).send('Error processed');
  }
};