const { google } = require('googleapis');
const logger = require('../utils/logger');

class GmailService {
  constructor() {
    if (!process.env.GMAIL_USER_EMAIL) {
      throw new Error('GMAIL_USER_EMAIL environment variable is not set');
    }

    this.userEmail = process.env.GMAIL_USER_EMAIL;
    logger.info(`Initializing Gmail service for: ${this.userEmail}`);
  }

  async setupGmail() {
    try {
      logger.info('Setting up Gmail with OAuth2...');
      
      // Verificar credenciales
      const requiredVars = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        throw new Error(`Missing required Gmail variables: ${missingVars.join(', ')}`);
      }

      // Configurar OAuth2
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
      );

      // Configurar credenciales
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
      });

      // Crear cliente Gmail
      this.gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      // Verificar la conexión
      const userInfo = await this.gmail.users.getProfile({
        userId: this.userEmail
      });

      logger.info('Gmail setup successful, acting as:', userInfo.data);
      return userInfo.data;

    } catch (error) {
      logger.error('Failed to setup Gmail:', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      throw error;
    }
  }

  async setupGmailWatch() {
    try {
      logger.info('Setting up Gmail watch...');
      
      // Asegurarse de que Gmail está inicializado
      if (!this.gmail) {
        await this.setupGmail();
      }

      const topicName = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`;
      logger.info(`Using Pub/Sub topic: ${topicName}`);

      // Detener watch existente si hay uno
      try {
        await this.gmail.users.stop({
          userId: this.userEmail
        });
        logger.info('Stopped existing Gmail watch');
      } catch (error) {
        logger.warn('No existing watch to stop or error stopping watch:', error.message);
      }

      // Configurar nuevo watch con retry
      const maxRetries = 3;
      let lastError;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const response = await this.gmail.users.watch({
            userId: this.userEmail,
            requestBody: {
              labelIds: ['INBOX'],
              topicName: topicName,
              labelFilterAction: 'include'
            }
          });

          logger.info('Gmail watch setup successful:', response.data);
          return response.data;
        } catch (error) {
          lastError = error;
          logger.warn(`Watch setup attempt ${i + 1} failed:`, {
            error: error.message,
            response: error.response?.data
          });
          
          if (i < maxRetries - 1) {
            const delay = Math.pow(2, i) * 1000;
            logger.info(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError;

    } catch (error) {
      logger.error('Failed to setup Gmail watch:', {
        error: error.message,
        stack: error.stack,
        details: error.response?.data
      });
      throw error;
    }
  }

  async renewWatch() {
    try {
      logger.info('Renewing Gmail watch...');
      await this.setupGmailWatch();
      logger.info('Gmail watch renewed successfully');
    } catch (error) {
      logger.error('Failed to renew Gmail watch:', error);
    }
  }

  async handleWebhook(messageData) {
    try {
      if (this.mockMode) {
        logger.info('Mock Gmail webhook processing:', messageData);
        return {
          success: true,
          ticketId: 'mock-ticket-id',
          messageId: 'mock-message-id'
        };
      }

      const { from, subject, content, threadId } = messageData;
      logger.info(`Processing email from ${from} with subject: ${subject}`);
      
      return await this.processEmailThread(threadId, messageData);
    } catch (error) {
      logger.error('Gmail webhook processing error:', error);
      throw error;
    }
  }

  async processEmailThread(threadId, messageData) {
    if (this.mockMode) {
      return {
        ticketId: 'mock-ticket-id',
        messageId: 'mock-message-id'
      };
    }

    try {
      const thread = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId
      });

      // Process thread messages
      const messages = thread.data.messages || [];
      const emailData = this.extractEmailData(messages[0]);

      return {
        threadId,
        subject: emailData.subject,
        from: emailData.from,
        content: emailData.content
      };
    } catch (error) {
      logger.error(`Error processing thread ${threadId}:`, error);
      throw error;
    }
  }

  extractEmailData(message) {
    const headers = message.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    
    let content = '';
    if (message.payload.parts) {
      const textPart = message.payload.parts.find(
        part => part.mimeType === 'text/plain'
      );
      if (textPart && textPart.body.data) {
        content = Buffer.from(textPart.body.data, 'base64').toString();
      }
    }

    return { subject, from, content };
  }

  async testConnection() {
    try {
      if (this.mockMode) {
        return {
          status: 'mock',
          message: 'Running in mock mode'
        };
      }

      // Intentar listar los últimos 5 emails no leídos..
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: 5,
        q: 'is:unread'
      });

      const emails = response.data.messages || [];
      const emailDetails = [];

      for (const email of emails) {
        const details = await this.gmail.users.messages.get({
          userId: 'me',
          id: email.id
        });

        const headers = details.data.payload.headers;
        emailDetails.push({
          id: email.id,
          subject: headers.find(h => h.name === 'Subject')?.value,
          from: headers.find(h => h.name === 'From')?.value
        });
      }

      return {
        status: 'connected',
        emailCount: emails.length,
        recentEmails: emailDetails
      };
    } catch (error) {
      logger.error('Gmail test connection failed:', error);
      throw error;
    }
  }

  async handleNewEmail(emailId) {
    try {
      const email = await this.gmail.users.messages.get({
        userId: 'me',
        id: emailId
      });

      const headers = email.data.payload.headers;
      const to = headers.find(h => h.name === 'To')?.value;
      
      // Solo procesar emails enviados a info@appraisily.com
      if (!to?.includes('info@appraisily.com')) {
        return;
      }

      const subject = headers.find(h => h.name === 'Subject')?.value;
      const from = headers.find(h => h.name === 'From')?.value;
      const content = this.extractEmailContent(email.data.payload);

      // Crear ticket
      const models = await getModels();
      
      // Extraer email del remitente
      const emailMatch = from.match(/<(.+?)>/);
      const senderEmail = emailMatch ? emailMatch[1] : from;

      // Buscar o crear cliente
      let customer = await models.Customer.findOne({ 
        where: { email: senderEmail } 
      });

      if (!customer) {
        customer = await models.Customer.create({
          email: senderEmail,
          name: from.split('<')[0].trim()
        });
      }

      // Crear ticket
      const ticket = await models.Ticket.create({
        subject: subject || 'Sin asunto',
        status: 'open',
        priority: 'medium',
        category: 'email',
        customerId: customer.id,
        gmailThreadId: email.data.threadId
      });

      // Crear mensaje inicial
      await models.Message.create({
        content,
        ticketId: ticket.id,
        author: 'customer'
      });

      logger.info(`New ticket created from email: ${ticket.id}`);
      return ticket;
    } catch (error) {
      logger.error('Error processing new email:', error);
      throw error;
    }
  }
}

module.exports = new GmailService();
