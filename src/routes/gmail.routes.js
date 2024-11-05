const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const GmailService = require('../services/GmailService');

// Webhook para notificaciones de Gmail
router.post('/webhook', async (req, res) => {
  try {
    logger.info('Received Gmail notification:', {
      body: req.body,
      headers: req.headers
    });

    // Verificar que el mensaje viene de Google
    if (!req.headers['x-goog-resource-state']) {
      logger.warn('Invalid webhook request - missing Google headers');
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Procesar la notificación
    const data = req.body;
    if (data.message && data.message.data) {
      // Decodificar el payload en base64
      const decodedData = Buffer.from(data.message.data, 'base64').toString();
      const notification = JSON.parse(decodedData);
      
      logger.info('Processed Gmail notification:', notification);

      // Aquí puedes añadir la lógica para procesar los emails
      // Por ejemplo:
      await GmailService.processNewEmails(notification);
    }

    // Responder a Google
    res.status(200).json({ status: 'ok' });

  } catch (error) {
    logger.error('Error processing Gmail webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 