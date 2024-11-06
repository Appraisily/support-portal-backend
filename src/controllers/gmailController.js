const GmailService = require('../services/GmailService');
const logger = require('../utils/logger');

exports.handleWebhook = async (req, res) => {
  try {
    logger.info('=== INICIO WEBHOOK GMAIL ===');

    // Validar IP de Google
    const googleIPs = ['66.249.93.', '142.250.', '35.191.'];
    const clientIP = req.headers['x-forwarded-for'] || req.ip;
    const isGoogleIP = googleIPs.some(ip => clientIP.startsWith(ip));
    
    if (!isGoogleIP) {
      logger.warn('IP no autorizada:', clientIP);
      return res.status(200).send('OK'); // Siempre 200 para webhooks
    }

    // Decodificar payload
    const message = req.body.message;
    const decodedData = Buffer.from(message.data, 'base64').toString();
    const notification = JSON.parse(decodedData);

    // Verificar historyId
    const lastHistoryId = await GmailService.getLastHistoryId();
    
    if (!lastHistoryId || notification.historyId > lastHistoryId) {
      await GmailService.processNewEmails(notification);
      await GmailService.updateLastHistoryId(notification.historyId);
    }

    logger.info('=== FIN WEBHOOK GMAIL ===');
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error en webhook Gmail:', error);
    res.status(200).send('Error processed');
  }
};