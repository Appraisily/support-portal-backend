const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');
const secretManager = require('../utils/secretManager');
const logger = require('../utils/logger');

async function setup() {
  const startTime = Date.now();
  try {
    // Validar variables de entorno requeridas
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

    logger.info('Starting Gmail watch setup', {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });

    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets from Secret Manager');
      await secretManager.loadSecrets();
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    logger.info('OAuth2 client configured');

    const gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client
    });

    const pubsub = new PubSub();
    const [topics] = await pubsub.getTopics();
    
    logger.info('PubSub configuration verified', {
      availableTopics: topics.map(t => t.name),
      targetTopic: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`
    });

    const response = await gmail.users.watch({
      userId: 'info@appraisily.com',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`,
        labelFilterAction: 'include'
      }
    });

    // Validar respuesta de watch
    if (!response?.data?.historyId) {
      throw new Error('Invalid response from Gmail watch setup');
    }

    logger.info('Gmail watch setup completed', {
      historyId: response.data.historyId,
      expiration: response.data.expiration,
      setupTime: Date.now() - startTime
    });
  } catch (error) {
    logger.error('Gmail watch setup failed', {
      error: error.message,
      stack: error.stack,
      setupTime: Date.now() - startTime,
      environment: process.env.NODE_ENV
    });
    process.exit(1); // Terminar el proceso en caso de error
  }
}

setup().catch(console.error); 