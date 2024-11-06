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

    if (process.env.NODE_ENV === 'production' && !secretManager.initialized) {
      logger.info('Loading secrets before processing webhook...');
      await secretManager.loadSecrets();
    }

    if (!appState.initialized) {
      logger.info('Initializing application before processing webhook...');
      await appState.initialize();
    }

    const notification = JSON.parse(
      Buffer.from(req.body.message.data, 'base64').toString()
    );

    if (await GmailService.isNotificationProcessed(notification.historyId)) {
      logger.info(`Skipping processed notification: ${notification.historyId}`);
      return res.status(200).send('OK');
    }

    await GmailService.processNewEmails(notification);
    res.status(200).send('OK');

  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(200).send('Error processed');
  }
};