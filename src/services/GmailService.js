const { google } = require('googleapis');
const logger = require('../utils/logger');
const appState = require('../utils/singleton');
const { Op } = require('sequelize');
const secretManager = require('../utils/secretManager');
const { getModels } = require('../config/database');

class GmailService {
  constructor() {
    this.userEmail = 'info@appraisily.com';
    this.gmail = null;
    this.initialized = false;
    this.initPromise = null;
    this.models = null;
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
      if (!emailData?.from || !emailData?.subject) {
        throw new Error('Invalid email data: missing required fields');
      }

      const models = await getModels();
      
      // Mejorar la extracción del email
      const emailMatch = emailData.from.match(/<([^>]+)>/) || [null, emailData.from.trim()];
      const senderEmail = emailMatch[1].toLowerCase();
      const senderName = emailData.from.split('<')[0].trim().replace(/["\r\n]/g, '');

      if (!senderEmail.includes('@')) {
        throw new Error('Invalid sender email format');
      }

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
        emailData: {
          from: emailData?.from,
          subject: emailData?.subject,
          threadId: emailData?.threadId
        }
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
    if (this.initialized && this.models?.Setting) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Obtener modelos
        const models = await getModels();
        
        if (!models?.Setting) {
          throw new Error('Setting model not available after initialization');
        }

        this.models = models;
        
        // Configurar Gmail
        await this.setupGmail();
        
        // Obtener último historyId
        this.lastHistoryId = await this.models.Setting.getHistoryId();
        
        this.initialized = true;
        logger.info('Gmail service initialized successfully', {
          hasModels: !!this.models,
          hasGmail: !!this.gmail,
          lastHistoryId: this.lastHistoryId
        });
        
        return true;
      } catch (error) {
        logger.error('Failed to initialize Gmail service', {
          error: error.message,
          stack: error.stack,
          hasModels: !!this.models,
          hasGmail: !!this.gmail
        });
        this.initialized = false;
        this.models = null;
        throw error;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async processNewEmails(notification) {
    const startTime = Date.now();
    try {
      await this.ensureInitialized();

      logger.info('Processing new emails', {
        notification,
        hasModels: !!this.models,
        hasSettingModel: !!this.models?.Setting
      });

      if (!notification?.historyId || !notification?.emailAddress) {
        logger.warn('Invalid notification data', { notification });
        return { processed: 0, tickets: 0, error: 'Invalid notification data' };
      }

      const currentHistoryId = parseInt(notification.historyId);
      const lastHistoryId = await this.getLastHistoryId();

      if (lastHistoryId && currentHistoryId <= lastHistoryId) {
        logger.info('Skipping already processed history ID', {
          current: currentHistoryId,
          last: lastHistoryId
        });
        return { processed: 0, tickets: 0, skipped: true };
      }

      // Añadir timeout para la llamada a Gmail API
      const historyResponse = await Promise.race([
        this.gmail.users.history.list({
          userId: 'me',
          startHistoryId: notification.historyId,
          historyTypes: ['messageAdded'],
          maxResults: 100
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Gmail API timeout')), 30000)
        )
      ]);

      logger.info('Gmail history retrieved', {
        status: historyResponse.status,
        historyCount: historyResponse.data.history?.length || 0,
        currentHistoryId: notification.historyId,
        newHistoryId: historyResponse.data.historyId,
        responseTime: Date.now() - startTime
      });

      if (!historyResponse.data.history?.length) {
        logger.info('No new messages found', {
          currentHistoryId: notification.historyId,
          newHistoryId: historyResponse.data.historyId,
          processingTime: Date.now() - startTime
        });
        
        // Actualizar el último historyId aunque no haya mensajes nuevos
        await this.updateLastHistoryId(historyResponse.data.historyId);
        
        return { processed: 0, tickets: 0, updated: true };
      }

      const processedCount = await this._processHistoryItems(historyResponse.data.history);
      
      // Actualizar el último historyId después de procesar
      await this.updateLastHistoryId(historyResponse.data.historyId);
      
      const result = {
        processed: processedCount,
        tickets: processedCount,
        historyId: historyResponse.data.historyId,
        processingTime: Date.now() - startTime
      };

      logger.info('Email processing completed', result);
      return result;

    } catch (error) {
      logger.error('Error processing new emails', {
        error: error.message,
        stack: error.stack,
        processingTime: Date.now() - startTime,
        notification,
        hasModels: !!this.models,
        hasSettingModel: !!this.models?.Setting
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
      await this.ensureInitialized();
      
      if (!this.models?.Setting) {
        throw new Error('Setting model not available');
      }

      return await this.models.Setting.getHistoryId();
    } catch (error) {
      logger.error('Error getting last history ID:', {
        error: error.message,
        stack: error.stack,
        hasModels: !!this.models,
        hasSettingModel: !!this.models?.Setting
      });
      throw error;
    }
  }

  async updateLastHistoryId(historyId) {
    try {
      await this.ensureInitialized();
      
      if (!this.models?.Setting) {
        throw new Error('Setting model not available');
      }

      await this.models.Setting.updateHistoryId(historyId);
      
      logger.info('Updated last history ID:', {
        historyId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error updating last history ID:', {
        error: error.message,
        stack: error.stack,
        historyId,
        hasModels: !!this.models,
        hasSettingModel: !!this.models?.Setting
      });
      throw error;
    }
  }

  async processEmail(messageId) {
    try {
      logger.info('Processing email', { messageId });
      
      const emailData = await this.fetchEmailData(messageId);
      logger.info('Email data fetched', {
        subject: emailData.subject,
        from: emailData.from,
        threadId: emailData.threadId,
        hasAttachments: emailData.attachments?.length > 0
      });

      const ticket = await this.handleNewEmail(emailData);
      
      logger.info('Email processed successfully', {
        messageId,
        ticketId: ticket.id,
        status: ticket.status
      });

      return ticket;
    } catch (error) {
      logger.error('Error processing email', {
        messageId,
        error: error.message,
        stack: error.stack
      });
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
      logger.info('Processing history items', {
        itemCount: historyItems.length
      });

      let processedCount = 0;
      for (const item of historyItems) {
        if (item.messagesAdded) {
          for (const message of item.messagesAdded) {
            if (!(await this.isMessageProcessed(message.message.id))) {
              await this.processEmail(message.message.id);
              await this.markMessageAsProcessed(message.message.id);
              processedCount++;
            }
          }
        }
      }

      logger.info('History items processed', {
        totalItems: historyItems.length,
        processedCount
      });

      return processedCount
    } catch (error) {
      logger.error('Error processing history items', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

// Crear y exportar una única instancia
const instance = new GmailService();
module.exports = instance;