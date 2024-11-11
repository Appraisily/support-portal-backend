const { google } = require('googleapis');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

class GmailService {
  // ... existing initialization code ...

  async processWebhook(data) {
    try {
      const message = await this.getMessage(data.messageId);
      
      // Only process messages that:
      // 1. Are in the INBOX
      // 2. Are not spam/automated notifications
      // 3. Have valid sender information
      if (!this._shouldProcessMessage(message)) {
        logger.info('Skipping message - does not meet processing criteria', {
          messageId: data.messageId,
          threadId: message.threadId,
          labelIds: message.labelIds
        });
        return { processed: false };
      }

      // Process the message
      // ... rest of processing logic ...
    } catch (error) {
      logger.error('Error processing webhook:', error);
      throw error;
    }
  }

  _shouldProcessMessage(message) {
    // Check if message is in INBOX
    if (!message.labelIds?.includes('INBOX')) {
      return false;
    }

    // Skip if marked as spam
    if (message.labelIds?.includes('SPAM')) {
      return false;
    }

    // Skip automated notifications (customize this list based on your needs)
    const skipDomains = [
      'noreply@',
      'no-reply@',
      'donotreply@',
      'automated@',
      'notifications@github.com',
      'notification@',
      'alerts@'
    ];

    const from = message.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value || '';
    if (skipDomains.some(domain => from.toLowerCase().includes(domain))) {
      return false;
    }

    // Skip messages with certain subjects (customize as needed)
    const subject = message.payload?.headers?.find(h => h.name.toLowerCase() === 'subject')?.value || '';
    const skipSubjects = [
      'automatic reply',
      'out of office',
      'away from office',
      'vacation response'
    ];

    if (skipSubjects.some(skip => subject.toLowerCase().includes(skip))) {
      return false;
    }

    return true;
  }

  // ... rest of the service code ...
}

module.exports = new GmailService();