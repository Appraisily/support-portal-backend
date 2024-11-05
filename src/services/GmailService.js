const { google } = require('googleapis');
const logger = require('../utils/logger');
const { PubSub } = require('@google-cloud/pubsub');

class GmailService {
  constructor() {
    if (!process.env.GMAIL_USER_EMAIL) {
      throw new Error('GMAIL_USER_EMAIL environment variable is not set');
    }

    this.userEmail = process.env.GMAIL_USER_EMAIL;
    logger.info(`Initializing Gmail service for: ${this.userEmail}`);

    // Siempre usar OAuth2
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );
  }

  async setupGmail() {
    try {
      logger.info('Setting up Gmail with OAuth2...');
      
      // Usar el refresh token guardado
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
      });

      this.gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      // Verificar que funciona
      const userInfo = await this.gmail.users.getProfile({
        userId: this.userEmail
      });
      logger.info('Gmail setup successful, acting as:', userInfo.data);

    } catch (error) {
      logger.error('Failed to setup Gmail:', error);
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

      // Verificar permisos de Pub/Sub
      const pubsub = new PubSub();
      const [topics] = await pubsub.getTopics();
      logger.info('Available Pub/Sub topics:', topics.map(t => t.name));

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

      // Configurar nuevo watch
      const response = await this.gmail.users.watch({
        userId: this.userEmail,
        requestBody: {
          labelIds: ['INBOX'],
          topicName: topicName,
          labelFilterAction: 'include'
        }
      });

      logger.info('Gmail watch setup response:', response.data);
      return response.data;

    } catch (error) {
      logger.error('Failed to setup Gmail watch:', {
        error: error.message,
        stack: error.stack,
        code: error.code,
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

  async setupGmailWatch() {
    try {
      if (process.env.NODE_ENV === 'production') {
        logger.info('Starting Gmail watch setup in production...');
        
        // Asegurarse de que Gmail está inicializado
        if (!this.gmail) {
          logger.info('Gmail not initialized, setting up...');
          await this.setupGmail();
        }

        // Verificar credenciales
        const client = await this.auth.getClient();
        logger.info('Auth client obtained successfully');

        // Obtener información del usuario usando el email específico
        const userInfo = await this.gmail.users.getProfile({
          userId: this.userEmail // Usar el email en lugar de 'me'
        });
        logger.info('Gmail user profile:', userInfo.data);

        const topicName = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`;
        logger.info(`Using Pub/Sub topic: ${topicName}`);

        // Configurar watch usando el email específico
        const response = await this.gmail.users.watch({
          userId: this.userEmail, // Usar el email en lugar de 'me'
          requestBody: {
            labelIds: ['INBOX'],
            topicName: topicName,
            labelFilterAction: 'include'
          }
        });

        logger.info('Gmail watch setup response:', response.data);
        return response.data;
      } else {
        // Código existente para desarrollo
        const authClient = await this.oauth2Client.getAccessToken();
        logger.info('Current credentials:', {
          hasAccessToken: !!authClient.token,
          tokenExpiry: authClient.res?.data?.expiry_date,
          scopes: this.oauth2Client.credentials.scope
        });

        // Intentar obtener información del usuario
        const userInfo = await this.gmail.users.getProfile({
          userId: 'me'
        });
        logger.info('Acting as Gmail user:', userInfo.data);

        // Verificar permisos de Pub/Sub
        const pubsub = new PubSub();
        try {
          const [topics] = await pubsub.getTopics();
          logger.info('Pub/Sub topics accessible:', topics.map(t => t.name));
        } catch (error) {
          logger.error('Failed to list Pub/Sub topics:', error);
        }

        if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
          throw new Error('GOOGLE_CLOUD_PROJECT_ID environment variable is not set');
        }

        logger.info('Setting up Gmail watch with project:', process.env.GOOGLE_CLOUD_PROJECT_ID);

        // Primero, detener cualquier watch existente
        try {
          await this.gmail.users.stop({
            userId: 'me'
          });
          logger.info('Stopped existing Gmail watch');
        } catch (error) {
          logger.warn('No existing watch to stop');
        }

        const topicName = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`;
        logger.info('Using topic name:', topicName);

        // Configurar nuevo watch
        const response = await this.gmail.users.watch({
          userId: this.userEmail,
          requestBody: {
            labelIds: ['INBOX'],
            topicName: topicName,
            labelFilterAction: 'include'
          }
        });

        logger.info(`Gmail watch setup successfully for ${this.userEmail}:`, response.data);
        return response.data;
      }
    } catch (error) {
      logger.error('Gmail watch setup failed:', {
        error: error.message,
        stack: error.stack,
        code: error.code,
        details: error.response?.data
      });
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
