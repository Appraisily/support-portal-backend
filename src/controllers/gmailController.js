const GmailService = require('../services/GmailService');
const TicketService = require('../services/TicketService');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { getModels } = require('../config/database');
const secretManager = require('../utils/secretManager');

exports.handleWebhook = async (req, res) => {
  try {
    logger.info('=== INICIO WEBHOOK GMAIL ===');
    
    // 1. Asegurarnos de que la aplicación está inicializada
    if (process.env.NODE_ENV === 'production') {
      await secretManager.loadSecrets();
    }
    await getModels();
    await GmailService.setupGmail();

    // 2. Procesar el webhook
    logger.info('1. Webhook recibido:', { body: req.body, headers: req.headers });

    // Validar IP de Google
    const googleIPs = ['66.249.93.', '142.250.', '35.191.'];
    const clientIP = req.headers['x-forwarded-for'] || req.ip;
    
    logger.info('2. Validando IP:', { clientIP, isGoogleIP: googleIPs.some(ip => clientIP.startsWith(ip)) });

    // Decodificar payload
    const message = req.body.message;
    const decodedData = Buffer.from(message.data, 'base64').toString();
    const notification = JSON.parse(decodedData);
    logger.info('3. Datos decodificados:', notification);

    // Verificar historyId
    const lastHistoryId = await GmailService.getLastHistoryId();
    logger.info('4. Comparando historyId:', {
      nuevo: notification.historyId,
      anterior: lastHistoryId
    });

    if (!lastHistoryId || notification.historyId > lastHistoryId) {
      logger.info('5. Procesando nuevos emails...');
      await GmailService.processNewEmails(notification);
      
      logger.info('6. Actualizando historyId...');
      try {
        await GmailService.updateLastHistoryId(notification.historyId);
        logger.info('HistoryId actualizado correctamente');
      } catch (error) {
        logger.error('Error actualizando historyId:', error);
      }
    } else {
      logger.warn('5. Saltando notificación - ya procesada');
    }

    logger.info('=== FIN WEBHOOK GMAIL ===');
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error en webhook Gmail:', error);
    // Siempre devolver 200 a Google para evitar reintentos
    res.status(200).send('Error processed');
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