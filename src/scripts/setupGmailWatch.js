const logger = require('../utils/logger');
const GmailService = require('../services/GmailService');

async function setup() {
  const startTime = Date.now();

  try {
    logger.info('Starting Gmail watch setup');

    const watchResult = await GmailService.setupGmailWatch();

    logger.info('Gmail watch setup completed', {
      historyId: watchResult.historyId,
      expiration: watchResult.expiration,
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

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection in Gmail setup', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

setup();