const logger = require('../utils/logger');
const GmailService = require('../services/GmailService');

async function setup() {
  const startTime = Date.now();
  let gmailService = null;

  try {
    // Validar variables de entorno primero
    const requiredEnvVars = [
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN',
      'GOOGLE_CLOUD_PROJECT_ID',
      'GMAIL_USER_EMAIL'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Inicializar el servicio
    gmailService = new GmailService();
    await gmailService.ensureInitialized();

    // Configurar el watch
    const watchResult = await gmailService.setupGmailWatch();

    logger.info('Gmail watch setup completed', {
      historyId: gmailService.lastHistoryId,
      watchResult,
      setupTime: Date.now() - startTime
    });

    process.exit(0);
  } catch (error) {
    logger.error('Gmail watch setup failed', {
      error: error.message,
      stack: error.stack,
      setupTime: Date.now() - startTime
    });
    process.exit(1);
  }
}

// Manejar errores no capturados
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection in Gmail setup', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

setup(); 