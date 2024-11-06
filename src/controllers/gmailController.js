const GmailService = require('../services/GmailService');
const logger = require('../utils/logger');

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