const logger = require('../utils/logger');
const { getModels } = require('../config/database');
const ApiError = require('../utils/ApiError');

class TicketService {
  constructor() {
    if (TicketService.instance) {
      return TicketService.instance;
    }
    TicketService.instance = this;
    this.initialized = false;
    this.models = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      this.models = await getModels();
      this.initialized = true;
      logger.info('TicketService initialized');
    } catch (error) {
      logger.error('Failed to initialize TicketService', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async listTickets(filters = {}, pagination = {}) {
    try {
      await this.ensureInitialized();
      
      // Normalizar parámetros
      const { 
        status, 
        priority, 
        sort = 'createdAt', 
        order = 'DESC' 
      } = filters;

      const page = Math.max(1, parseInt(pagination.page) || 1);
      const limit = Math.max(1, Math.min(50, parseInt(pagination.limit) || 10));

      logger.info('Processing listTickets request:', {
        normalizedParams: {
          filters: { status, priority },
          pagination: { page, limit },
          sorting: { sort, order }
        }
      });

      // Construir query
      const query = {};
      if (status) query.status = status;
      if (priority) query.priority = priority;

      // Obtener estadísticas
      const [ticketCount, customerCount, messageCount] = await Promise.all([
        this.models.Ticket.count(),
        this.models.Customer.count(),
        this.models.Message.count()
      ]);

      // Ejecutar consulta principal
      const tickets = await this.models.Ticket.findAndCountAll({
        where: query,
        include: [
          {
            model: this.models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.models.Message,
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
      if (error instanceof ApiError) {
        throw error;
      }
      
      logger.error('Error in listTickets:', {
        error: error.message,
        stack: error.stack,
        filters: JSON.stringify(filters),
        pagination: JSON.stringify(pagination),
        sequelizeError: error.original?.message,
        sqlState: error.original?.sqlState
      });
      throw new ApiError(500, 'Error listing tickets');
    }
  }

  async getTicketById(id) {
    await this.ensureInitialized();
    try {
      logger.info('Getting ticket by ID', { ticketId: id });
      
      const ticket = await this.models.Ticket.findByPk(id, {
        include: [
          {
            model: this.models.Message,
            as: 'messages'
          },
          {
            model: this.models.Attachment,
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
    await this.ensureInitialized();
    try {
      logger.info('Creating new ticket', {
        subject: ticketData.subject,
        category: ticketData.category,
        priority: ticketData.priority,
        customerId: ticketData.customerId
      });

      const ticket = await this.models.Ticket.create(ticketData);

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
    await this.ensureInitialized();
    try {
      logger.info('Updating ticket', {
        ticketId: id,
        updates: JSON.stringify(updates)
      });

      const ticket = await this.models.Ticket.findByPk(id);

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
    await this.ensureInitialized();
    try {
      logger.info('Adding message to ticket', {
        ticketId,
        hasContent: !!messageData.content,
        hasAttachments: !!messageData.attachments
      });

      const ticket = await this.getTicketById(ticketId);
      const message = await this.models.Message.create({
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
      if (!emailData?.subject || !emailData?.from) {
        logger.error('Invalid email data for ticket creation', {
          hasSubject: !!emailData?.subject,
          hasFrom: !!emailData?.from,
          emailData: JSON.stringify(emailData)
        });
        throw new ApiError(400, 'Invalid email data');
      }

      logger.info('Creating ticket from email:', {
        subject: emailData.subject,
        from: emailData.from,
        hasContent: !!emailData.content,
        threadId: emailData.threadId
      });

      // Verificar si ya existe un ticket para este thread
      if (emailData.threadId) {
        const existingTicket = await this.models.Ticket.findOne({
          where: { gmailThreadId: emailData.threadId }
        });

        if (existingTicket) {
          logger.info('Found existing ticket for thread', {
            threadId: emailData.threadId,
            ticketId: existingTicket.id
          });
          // Aquí podrías actualizar el ticket existente si es necesario
          return existingTicket;
        }
      }

      // Buscar o crear el customer basado en el email
      const [customer] = await this.models.Customer.findOrCreate({
        where: { email: emailData.from },
        defaults: {
          name: emailData.from.split('@')[0], // Nombre temporal
          email: emailData.from
        }
      });

      // Crear el ticket
      const ticket = await this.models.Ticket.create({
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
      await this.models.Message.create({
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

// Exportar una única instancia
module.exports = new TicketService();