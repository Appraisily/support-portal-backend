const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');
const secretManager = require('../utils/secretManager');
const logger = require('../utils/logger');
const GmailService = require('../services/GmailService');

async function setup() {
  const startTime = Date.now();
  try {
    // Validar variables de entorno
    const requiredEnvVars = [
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN',
      'GOOGLE_CLOUD_PROJECT_ID'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Inicializar GmailService
    const gmailService = new GmailService();
    await gmailService.ensureInitialized();

    // Configurar watch
    const response = await gmailService.gmail.users.watch({
      userId: gmailService.userEmail,
      requestBody: {
        labelIds: ['INBOX'],
        topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`,
        labelFilterAction: 'include'
      }
    });

    if (!response?.data?.historyId) {
      throw new Error('Invalid response from Gmail watch setup');
    }

    // Guardar historyId inicial
    await gmailService.updateLastHistoryId(response.data.historyId);

    logger.info('Gmail watch setup completed', {
      historyId: response.data.historyId,
      expiration: response.data.expiration,
      setupTime: Date.now() - startTime
    });
  } catch (error) {
    logger.error('Gmail watch setup failed', {
      error: error.message,
      stack: error.stack,
      setupTime: Date.now() - startTime
    });
    process.exit(1);
  }
}

setup().catch(console.error); 