const { getModels } = require('../config/database');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

class TicketService {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
  }

  async initialize() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        logger.info('Initializing TicketService', {
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        });

        const models = await getModels();
        logger.info('Models loaded for TicketService', {
          availableModels: Object.keys(models),
          hasRequiredModels: {
            Ticket: !!models.Ticket,
            Customer: !!models.Customer,
            Message: !!models.Message
          }
        });

        this.initialized = true;
        logger.info('TicketService initialized successfully');
      } catch (error) {
        logger.error('TicketService initialization failed', {
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    })();

    return this.initPromise;
  }

  async listTickets(filters = {}, pagination = {}) {
    await this.initialize();
    try {
      const { 
        status, 
        priority, 
        page = 1, 
        limit = 10, 
        sort = 'createdAt', 
        order = 'DESC' 
      } = { ...filters, ...pagination };

      logger.info('Raw listTickets request:', {
        filters: JSON.stringify(filters),
        pagination: JSON.stringify(pagination),
        parsedParams: {
          status,
          priority,
          page,
          limit,
          sort,
          order
        }
      });

      const query = {};
      if (status) query.status = status;
      if (priority) query.priority = priority;

      const models = await getModels();
      
      // Log del estado de los modelos
      logger.info('Database models status:', {
        availableModels: Object.keys(models),
        modelDetails: {
          Ticket: {
            exists: !!models.Ticket,
            attributes: Object.keys(models.Ticket.rawAttributes || {})
          },
          Customer: {
            exists: !!models.Customer,
            attributes: Object.keys(models.Customer.rawAttributes || {})
          },
          Message: {
            exists: !!models.Message,
            attributes: Object.keys(models.Message.rawAttributes || {})
          }
        }
      });

      // Log del estado de la base de datos
      const dbStats = await Promise.all([
        models.Ticket.count(),
        models.Customer.count(),
        models.Message.count()
      ]);

      logger.info('Database current state:', {
        counts: {
          tickets: dbStats[0],
          customers: dbStats[1],
          messages: dbStats[2]
        },
        query: JSON.stringify(query),
        sequelizeQuery: {
          where: query,
          limit: parseInt(limit),
          offset: (page - 1) * limit,
          order: [[sort, order]]
        }
      });

      const tickets = await models.Ticket.findAndCountAll({
        where: query,
        include: [
          {
            model: models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          },
          {
            model: models.Message,
            as: 'messages',
            limit: 1,
            order: [['createdAt', 'DESC']]
          }
        ],
        order: [[sort, order]],
        limit: parseInt(limit),
        offset: (page - 1) * limit,
        logging: (sql) => logger.debug('Executing SQL:', { query: sql })
      });

      logger.info('Query execution results:', {
        totalCount: tickets.count,
        returnedCount: tickets.rows.length,
        tickets: tickets.rows.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          hasCustomer: !!ticket.customer,
          customerEmail: ticket.customer?.email,
          messageCount: ticket.messages?.length || 0
        })),
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(tickets.count / limit)
        }
      });

      return {
        tickets: tickets.rows.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          customer: ticket.customer ? {
            id: ticket.customer.id,
            name: ticket.customer.name,
            email: ticket.customer.email
          } : null,
          lastMessage: ticket.messages?.[0] ? {
            content: ticket.messages[0].content,
            createdAt: ticket.messages[0].createdAt
          } : null,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt
        })),
        total: tickets.count,
        page: parseInt(page),
        totalPages: Math.ceil(tickets.count / limit)
      };

    } catch (error) {
      logger.error('Error in listTickets:', {
        error: error.message,
        stack: error.stack,
        filters: JSON.stringify(filters),
        pagination: JSON.stringify(pagination),
        sequelizeError: error.original?.message,
        sqlState: error.original?.sqlState,
        dbState: {
          initialized: this.initialized,
          hasModels: !!(await getModels()),
          modelNames: Object.keys(await getModels())
        }
      });
      throw error;
    }
  }

  async getTicketById(id) {
    await this.initialize();
    try {
      logger.info('Getting ticket by ID', { ticketId: id });
      
      const models = await getModels();
      const ticket = await models.Ticket.findByPk(id, {
        include: [
          {
            model: models.Message,
            as: 'messages'
          },
          {
            model: models.Attachment,
            as: 'attachments'
          }
        ]
      });

      if (!ticket) {
        logger.warn('Ticket not found', { ticketId: id });
        throw new ApiError(404, 'Ticket not found');
      }

      logger.info('Ticket retrieved successfully', {
        ticketId: id,
        status: ticket.status,
        messageCount: ticket.messages?.length || 0,
        attachmentCount: ticket.attachments?.length || 0
      });

      return ticket;
    } catch (error) {
      logger.error('Error getting ticket by ID', {
        ticketId: id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async createTicket(ticketData) {
    await this.initialize();
    try {
      logger.info('Creating new ticket', {
        subject: ticketData.subject,
        category: ticketData.category,
        priority: ticketData.priority,
        customerId: ticketData.customerId
      });

      const models = await getModels();
      const ticket = await models.Ticket.create(ticketData);

      logger.info('Ticket created successfully', {
        ticketId: ticket.id,
        status: ticket.status,
        priority: ticket.priority,
        customerId: ticket.customerId
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating ticket', {
        error: error.message,
        stack: error.stack,
        ticketData: JSON.stringify(ticketData)
      });
      throw error;
    }
  }

  async updateTicket(id, updates) {
    await this.initialize();
    try {
      logger.info('Updating ticket', {
        ticketId: id,
        updates: JSON.stringify(updates)
      });

      const models = await getModels();
      const ticket = await models.Ticket.findByPk(id);

      if (!ticket) {
        logger.warn('Ticket not found for update', { ticketId: id });
        throw new ApiError(404, 'Ticket not found');
      }

      const oldStatus = ticket.status;
      await ticket.update(updates);

      logger.info('Ticket updated successfully', {
        ticketId: id,
        oldStatus,
        newStatus: ticket.status,
        updatedFields: Object.keys(updates)
      });
      
      return ticket;
    } catch (error) {
      logger.error('Error updating ticket', {
        ticketId: id,
        error: error.message,
        stack: error.stack,
        updates: JSON.stringify(updates)
      });
      throw error;
    }
  }

  async addMessage(ticketId, messageData) {
    await this.initialize();
    try {
      logger.info('Adding message to ticket', {
        ticketId,
        hasContent: !!messageData.content,
        hasAttachments: !!messageData.attachments
      });

      const models = await getModels();
      const ticket = await this.getTicketById(ticketId);
      const message = await models.Message.create({
        ...messageData,
        ticketId: ticket.id
      });

      logger.info('Message added successfully', {
        ticketId,
        messageId: message.id,
        type: message.type
      });
      
      return message;
    } catch (error) {
      logger.error('Error adding message to ticket', {
        ticketId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async createTicketFromEmail(emailData) {
    try {
      logger.info('Creating ticket from email:', {
        subject: emailData.subject,
        from: emailData.from,
        hasContent: !!emailData.content,
        threadId: emailData.threadId
      });

      const models = await getModels();
      
      // Buscar o crear el customer basado en el email
      const [customer] = await models.Customer.findOrCreate({
        where: { email: emailData.from },
        defaults: {
          name: emailData.from.split('@')[0], // Nombre temporal
          email: emailData.from
        }
      });

      // Crear el ticket
      const ticket = await models.Ticket.create({
        subject: emailData.subject,
        category: 'email', // Categoría por defecto para emails
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
        content: emailData.content,
        type: 'email',
        direction: 'inbound',
        metadata: {
          gmailMessageId: emailData.messageId,
          gmailThreadId: emailData.threadId
        }
      });

      logger.info('Ticket created successfully:', {
        ticketId: ticket.id,
        customerId: customer.id,
        threadId: emailData.threadId
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating ticket from email:', {
        error: error.message,
        stack: error.stack,
        emailData: JSON.stringify(emailData)
      });
      throw error;
    }
  }
}

module.exports = new TicketService();