const { google } = require('googleapis');
const logger = require('../utils/logger');
const appState = require('../utils/singleton');
const { Op } = require('sequelize');
const secretManager = require('../utils/secretManager');

class GmailService {
  constructor() {
    this.userEmail = 'info@appraisily.com';
    this.gmail = null;
    this.initialized = false;
    this.initPromise = null;
    this.lastHistoryId = null;
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
      await this.ensureInitialized();

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

      // Guardar el historyId en memoria
      if (response.data.historyId) {
        this.lastHistoryId = response.data.historyId;
        process.env.LAST_HISTORY_ID = response.data.historyId;
        logger.info('Saved initial history ID:', response.data.historyId);
      }

      logger.info('Gmail watch setup successful:', response.data);
      return response.data;

    } catch (error) {
      logger.error('Failed to setup Gmail watch:', error);
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
      const models = await getModels();
      
      // Extraer datos del remitente
      const emailMatch = emailData.from.match(/<(.+?)>/) || [null, emailData.from];
      const senderEmail = emailMatch[1].toLowerCase();
      const senderName = emailData.from.split('<')[0].trim().replace(/"/g, '');
      
      // Buscar o crear customer
      const [customer] = await models.Customer.findOrCreate({
        where: { email: senderEmail },
        defaults: {
          name: senderName,
          email: senderEmail
        }
      });

      // Buscar ticket existente por threadId
      const existingTicket = await models.Ticket.findOne({
        where: { gmailThreadId: emailData.threadId }
      });

      if (existingTicket) {
        logger.info('Adding message to existing ticket:', {
          ticketId: existingTicket.id,
          threadId: emailData.threadId
        });

        // Añadir mensaje al ticket existente
        const message = await models.Message.create({
          ticketId: existingTicket.id,
          customerId: customer.id,
          content: emailData.content,
          type: 'email',
          direction: 'inbound',
          metadata: {
            gmailMessageId: emailData.messageId,
            gmailThreadId: emailData.threadId
          }
        });

        // Actualizar lastMessageAt del ticket
        await existingTicket.update({
          lastMessageAt: new Date()
        });

        return existingTicket;

      } else {
        logger.info('Creating new ticket from email');
        
        // Crear nuevo ticket
        const ticket = await models.Ticket.create({
          subject: emailData.subject,
          category: 'email',
          customerId: customer.id,
          status: 'open',
          priority: 'medium',
          gmailThreadId: emailData.threadId,
          gmailMessageId: emailData.messageId,
          lastMessageAt: new Date()
        });

        // Crear el primer mensaje
        await models.Message.create({
          ticketId: ticket.id,
          customerId: customer.id,
          content: emailData.content,
          type: 'email',
          direction: 'inbound',
          metadata: {
            gmailMessageId: emailData.messageId,
            gmailThreadId: emailData.threadId
          }
        });

        logger.info('New ticket created:', {
          ticketId: ticket.id,
          threadId: emailData.threadId
        });

        return ticket;
      }

    } catch (error) {
      logger.error('Error handling new email:', {
        error: error.message,
        stack: error.stack,
        emailData: JSON.stringify(emailData)
      });
      throw error;
    }
  }

  // Nueva función para obtener foto de perfil
  async getGmailProfilePhoto(email) {
    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me',
        email: email
      });
      
      return response.data.photoUrl || null;
    } catch (error) {
      logger.warn(`Could not fetch profile photo for ${email}:`, error);
      return null;
    }
  }

  async ensureInitialized() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // 1. Cargar secretos si es necesario
        if (process.env.NODE_ENV === 'production' && !secretManager.initialized) {
          logger.info('Loading secrets in Gmail service...');
          await secretManager.loadSecrets();
        }

        // 2. Inicializar Gmail
        await this.setupGmail();

        this.initialized = true;
        logger.info('Gmail service fully initialized');
      } catch (error) {
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  async processNewEmails(notification) {
    try {
      logger.info('Starting to process new emails:', {
        notification: JSON.stringify(notification),
        historyId: notification.historyId,
        emailAddress: notification.emailAddress
      });
      
      // Asegurar inicialización antes de procesar
      await this.ensureInitialized();
      
      const response = await this.gmail.users.history.list({
        userId: this.userEmail,
        startHistoryId: notification.historyId,
        historyTypes: ['messageAdded']
      });

      logger.info('History list response:', {
        hasHistory: !!response.data.history,
        historyId: notification.historyId,
        historySize: response.data.history?.length || 0,
        response: JSON.stringify(response.data)
      });

      if (!response.data.history) {
        logger.info(`No new messages since ${notification.historyId}`, {
          historyId: notification.historyId,
          emailAddress: notification.emailAddress
        });
        return { processed: 0, tickets: 0 };
      }

      const processedCount = await this._processHistoryItems(response.data.history);
      logger.info(`Processed ${processedCount} new messages`, {
        processedCount,
        historyId: notification.historyId,
        historySize: response.data.history.length
      });
      
      await this.markNotificationAsProcessed(notification.historyId);

      return {
        processed: processedCount,
        tickets: processedCount,
        historyId: notification.historyId
      };

    } catch (error) {
      logger.error('Failed to process emails:', {
        error: error.message,
        stack: error.stack,
        notification: JSON.stringify(notification),
        type: error.constructor.name
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

  async processEmail(messageId) {
    try {
      logger.info(`Processing email ${messageId}`);
      // ... código existente ...
      
      // Añadir más logs
      logger.info('Email processed successfully:', {
        subject: emailData.subject,
        from: emailData.from,
        threadId: emailData.threadId,
        hasAttachments: emailData.attachments?.length > 0
      });

    } catch (error) {
      logger.error('Error processing email:', error);
      throw error;
    }
  }

  async isNotificationProcessed(historyId) {
    // Si es el historyId inicial, ignorarlo
    if (historyId === this.lastHistoryId) {
      logger.info('Ignoring initial history ID notification');
      return true;
    }
    
    // Si es un historyId anterior al último conocido, ignorarlo
    if (this.lastHistoryId && parseInt(historyId) <= parseInt(this.lastHistoryId)) {
      logger.info('Ignoring old history ID notification');
      return true;
    }

    return false;
  }

  async markNotificationAsProcessed(historyId) {
    try {
      const models = await appState.getModels();
      await models.Setting.create({
        key: 'processed_notification',
        value: historyId.toString(),
        createdAt: new Date()
      });
      
      // Limpiar notificaciones antiguas (más de 1 día)
      await models.Setting.destroy({
        where: {
          key: 'processed_notification',
          createdAt: {
            [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      });

      logger.debug(`Marked notification ${historyId} as processed`);
    } catch (error) {
      logger.error('Error marking notification as processed:', error);
      throw error;
    }
  }

  async _processHistoryItems(historyItems) {
    try {
      let processedCount = 0;
      
      for (const history of historyItems) {
        for (const message of history.messages || []) {
          // Verificar si ya procesamos este mensaje
          if (await this.isMessageProcessed(message.id)) {
            logger.info(`Message ${message.id} already processed, skipping`);
            continue;
          }

          // Obtener detalles completos del mensaje
          const messageDetails = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });

          // Extraer datos del email
          const emailData = {
            messageId: message.id,
            threadId: message.threadId,
            ...this.extractEmailData(messageDetails.data)
          };

          logger.info('Processing new email:', {
            messageId: emailData.messageId,
            subject: emailData.subject,
            from: emailData.from
          });

          // Crear o actualizar ticket
          await this.handleNewEmail(emailData);
          
          // Marcar como procesado
          await this.markMessageAsProcessed(message.id);
          
          processedCount++;
        }
      }

      logger.info(`Processed ${processedCount} messages from history items`);
      return processedCount;

    } catch (error) {
      logger.error('Error processing history items:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = new GmailService();