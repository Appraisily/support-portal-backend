const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');
const secretManager = require('../utils/secretManager');
const logger = require('../utils/logger');
const GmailService = require('../services/GmailService');

const gmailService = new GmailService();

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

    // Usar la instancia existente
    await gmailService.ensureInitialized();
    await gmailService.setupGmailWatch();

    logger.info('Gmail watch setup completed', {
      historyId: gmailService.lastHistoryId,
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