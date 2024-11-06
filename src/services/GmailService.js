const { google } = require('googleapis');
const logger = require('../utils/logger');
const appState = require('../utils/singleton');

class GmailService {
  constructor() {
    this.userEmail = 'info@appraisily.com';
    this.gmail = null;
    this.initialized = false;
    logger.info(`Creating Gmail service instance for: ${this.userEmail}`);
  }

  async setupGmail() {
    if (this.initialized) {
      logger.info('Gmail service already initialized');
      return;
    }

    try {
      logger.info('Setting up Gmail with OAuth2...');
      
      // Solo verificar las credenciales de OAuth2
      const requiredVars = [
        'GMAIL_CLIENT_ID', 
        'GMAIL_CLIENT_SECRET', 
        'GMAIL_REFRESH_TOKEN'
      ];
      
      const missingVars = requiredVars.filter(varName => {
        const value = process.env[varName];
        if (!value) {
          logger.error(`Missing ${varName} environment variable`);
          return true;
        }
        return false;
      });
      
      if (missingVars.length > 0) {
        const error = new Error(`Missing required Gmail variables: ${missingVars.join(', ')}`);
        logger.error('Gmail setup failed:', {
          error: error.message,
          missingVars
        });
        throw error;
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

      this.initialized = true;
      logger.info('Gmail setup successful, acting as:', userInfo.data);
      return userInfo.data;

    } catch (error) {
      logger.error('Gmail setup failed:', error);
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

      // Asegurarse de que Gmail está inicializado
      if (!this.gmail) {
        logger.info('Gmail not initialized, setting up...');
        await this.setupGmail();
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

  async handleNewEmail(emailData) {
    try {
      logger.info('Processing new email:', { subject: emailData.subject });
      const models = await appState.getModels();

      // Extraer email del remitente
      const emailMatch = emailData.from.match(/<(.+?)>/) || [null, emailData.from];
      const senderEmail = emailMatch[1].toLowerCase();

      // Buscar ticket existente por threadId
      const existingTicket = await models.Ticket.findOne({
        where: {
          gmailThreadId: emailData.threadId
        },
        include: [{
          model: models.Message,
          as: 'messages',
          order: [['createdAt', 'DESC']]
        }]
      });

      if (existingTicket) {
        logger.info(`Adding message to existing ticket ${existingTicket.id}`);
        
        // Añadir mensaje y actualizar ticket
        await Promise.all([
          models.Message.create({
            ticketId: existingTicket.id,
            content: emailData.content,
            from: senderEmail,
            gmailMessageId: emailData.messageId
          }),
          existingTicket.update({
            status: 'open',  // Siempre reabrir el ticket al recibir una respuesta
            lastMessageAt: new Date()
          })
        ]);

        logger.info(`Ticket ${existingTicket.id} reopened due to new response`);
        return existingTicket;
      }

      // Crear nuevo ticket
      const customer = await this.findOrCreateCustomer(senderEmail);
      
      const ticket = await models.Ticket.create({
        subject: emailData.subject || '(No subject)',
        status: 'open',
        priority: 'medium',
        category: 'general',
        customerId: customer.id,
        gmailThreadId: emailData.threadId,
        gmailMessageId: emailData.messageId,
        lastMessageAt: new Date()
      });

      await models.Message.create({
        ticketId: ticket.id,
        content: emailData.content,
        from: senderEmail,
        gmailMessageId: emailData.messageId
      });

      logger.info(`Created new ticket ${ticket.id} for email from ${senderEmail}`);
      return ticket;

    } catch (error) {
      logger.error('Error handling new email:', error);
      throw error;
    }
  }

  async processNewEmails(notification) {
    try {
      logger.info('=== INICIO PROCESAMIENTO EMAIL ===');
      logger.info('1. Inicializando Gmail...');
      
      if (!this.gmail) {
        await this.setupGmail();
      }

      const historyId = notification.historyId;
      logger.info('2. Obteniendo historial desde:', { historyId });

      const response = await this.gmail.users.history.list({
        userId: this.userEmail,
        startHistoryId: historyId,
        historyTypes: ['messageAdded']
      });

      logger.info('3. Respuesta de Gmail:', {
        hasHistory: !!response.data.history,
        historyLength: response.data.history?.length,
        response: response.data
      });

      if (!response.data.history) {
        logger.info('No hay mensajes nuevos');
        return;
      }

      for (const history of response.data.history) {
        logger.info('4. Procesando historia:', {
          historyId: history.id,
          messagesAdded: history.messagesAdded?.length
        });

        for (const message of history.messagesAdded || []) {
          logger.info('5. Procesando mensaje:', {
            messageId: message.message.id,
            threadId: message.message.threadId
          });
          const messageId = message.message.id;
          logger.info('6. Procesando mensaje:', { messageId });

          if (await this.isMessageProcessed(messageId)) {
            logger.info('7. Mensaje ya procesado, saltando');
            continue;
          }

          try {
            logger.info('8. Creando ticket para mensaje:', messageId);
            const ticket = await this.handleNewEmail(messageId);
            logger.info('9. Ticket creado:', {
              ticketId: ticket.id,
              messageId: messageId
            });
            
            await this.markMessageAsProcessed(messageId);
            logger.info('10. Mensaje marcado como procesado');
          } catch (error) {
            logger.error('Error procesando mensaje:', {
              messageId,
              error: error.message,
              stack: error.stack
            });
          }
        }
      }

      logger.info('=== FIN PROCESAMIENTO EMAIL ===');
    } catch (error) {
      logger.error('Error general procesando emails:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async isMessageProcessed(messageId) {
    try {
      const models = await appState.getModels();
      // Buscar un ticket con este messageId
      const ticket = await models.Ticket.findOne({
        where: {
          gmailMessageId: messageId
        }
      });
      return !!ticket; // Retorna true si existe un ticket
    } catch (error) {
      logger.error('Error checking processed message:', error);
      return false; // En caso de error, procesamos el mensaje por seguridad
    }
  }

  async markMessageAsProcessed(messageId) {
    // No necesitamos hacer nada aquí porque el ticket ya se creó
    // en handleNewEmail con el messageId
    logger.info('Message marked as processed:', messageId);
  }

  async getLastHistoryId() {
    try {
      const models = await appState.getModels();
      const setting = await models.Setting.findOne({
        where: { key: 'lastGmailHistoryId' }
      });
      return setting ? parseInt(setting.value) : null;
    } catch (error) {
      logger.error('Error getting last history ID:', error);
      return null;
    }
  }

  async updateLastHistoryId(historyId) {
    try {
      // Asegurarse de que la aplicación está inicializada
      if (!appState.initialized) {
        logger.info('Initializing application before updating historyId');
        await appState.initialize();
      }

      const models = await appState.getModels();
      await models.Setting.upsert({
        key: 'lastGmailHistoryId',
        value: historyId.toString()
      });
      logger.info('Updated last history ID:', historyId);
    } catch (error) {
      logger.error('Error updating last history ID:', error);
      throw error; // Propagar el error para mejor manejo
    }
  }
}

module.exports = new GmailService();