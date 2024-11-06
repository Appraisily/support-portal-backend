const GmailService = require('../services/GmailService');
const logger = require('../utils/logger');

exports.handleWebhook = async (req, res) => {
  try {
    logger.info('Gmail webhook received', {
      messageId: req.body?.message?.messageId,
      publishTime: req.body?.message?.publishTime
    });

    if (!req.body?.message?.data) {
      logger.warn('Invalid webhook data', {
        hasMessage: !!req.body?.message,
        hasData: !!req.body?.message?.data
      });
      return res.status(200).send('OK');
    }

    const rawData = req.body.message.data;
    const decodedData = Buffer.from(rawData, 'base64').toString();
    const notification = JSON.parse(decodedData);

    logger.info('Processing Gmail notification', {
      historyId: notification.historyId,
      emailAddress: notification.emailAddress
    });

    const result = await GmailService.processNewEmails(notification);
    
    logger.info('Gmail processing complete', {
      emailsProcessed: result?.processed || 0,
      ticketsCreated: result?.tickets || 0,
      historyId: notification.historyId
    });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Gmail webhook error', {
      error: error.message,
      notification: req.body?.message?.data
    });
    res.status(200).send('Error processed');
  }
};