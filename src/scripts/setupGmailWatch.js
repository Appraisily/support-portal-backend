const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');
const secretManager = require('../utils/secretManager');
const logger = require('../utils/logger');

async function setup() {
  try {
    // 1. Cargar secretos primero
    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets...');
      await secretManager.loadSecrets();
    }

    // 2. Configurar OAuth2 con los secretos cargados
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );

    // 3. Configurar credenciales
    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    // 4. Configurar Gmail API
    const gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client
    });

    // 5. Verificar permisos de Pub/Sub
    const pubsub = new PubSub();
    const [topics] = await pubsub.getTopics();
    logger.info('Available topics:', {
      topics: topics.map(t => t.name)
    });

    // 6. Configurar watch
    const response = await gmail.users.watch({
      userId: 'info@appraisily.com',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`,
        labelFilterAction: 'include'
      }
    });

    logger.info('Watch setup successful:', {
      historyId: response.data.historyId,
      expiration: response.data.expiration
    });
  } catch (error) {
    logger.error('Setup failed:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

setup().catch(console.error); 