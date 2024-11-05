const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const GmailService = require('../services/GmailService');

// Webhook para notificaciones de Gmail
router.post('/webhook', async (req, res) => {
  try {
    logger.info('Received Gmail notification');

    // Verificar que el mensaje viene de Google (por la IP y otros headers)
    const googleIPs = ['66.249.93.', '142.250.', '35.191.']; // IPs de Google
    const clientIP = req.headers['x-forwarded-for'] || req.ip;
    
    if (!googleIPs.some(ip => clientIP.startsWith(ip))) {
      logger.warn('Invalid webhook request - unexpected IP:', clientIP);
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Procesar la notificación
    const data = req.body;
    if (data.message && data.message.data) {
      // Decodificar el payload en base64
      const decodedData = Buffer.from(data.message.data, 'base64').toString();
      const notification = JSON.parse(decodedData);
      
      logger.info('Processed Gmail notification:', notification);

      // Solo procesar si el historyId es mayor que el último procesado
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
    }

    // Responder a Google
    res.status(200).json({ status: 'ok' });

  } catch (error) {
    logger.error('Error processing Gmail webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 