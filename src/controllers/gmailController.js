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
    const clientIP = req.headers['x-forwarded-for'] || req.ip;
    const googleIPs = ['66.249.93.', '142.250.', '35.191.'];
    
    if (!googleIPs.some(ip => clientIP.startsWith(ip))) {
      logger.warn(`Invalid IP: ${clientIP}`);
      return res.status(200).send('OK');
    }

    const notification = JSON.parse(
      Buffer.from(req.body.message.data, 'base64').toString()
    );

    logger.info('Received webhook notification:', {
      historyId: notification.historyId,
      emailAddress: notification.emailAddress,
      raw: notification
    });

    // Si es una notificación de configuración inicial, solo logueamos y OK
    if (!notification.emailAddress || !notification.historyId) {
      logger.info('Received watch setup confirmation');
      return res.status(200).send('OK');
    }

    // Solo procesamos si parece una notificación real de email
    const result = await GmailService.processNewEmails(notification);
    logger.info('Email processing complete:', {
      success: true,
      emailsProcessed: result.processed,
      ticketsCreated: result.tickets,
      historyId: notification.historyId
    });

    res.status(200).send('OK');

  } catch (error) {
    logger.error('Webhook error:', {
      error: error.message,
      stack: error.stack,
      notification: req.body?.message?.data
    });
    res.status(200).send('Error processed');
  }
};