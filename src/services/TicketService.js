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
        logger.info('Inicializando TicketService...');
        // Esperar a que los modelos estén disponibles
        await getModels();
        this.initialized = true;
        logger.info('TicketService inicializado correctamente');
      } catch (error) {
        logger.error('Error inicializando TicketService:', error);
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

      const query = {};
      if (status) query.status = status;
      if (priority) query.priority = priority;

      logger.info('Listing tickets:', {
        filters: JSON.stringify(filters),
        pagination: JSON.stringify(pagination),
        query: JSON.stringify(query)
      });

      const models = await getModels();
      
      // Verificar que tenemos todos los modelos necesarios
      if (!models.Customer || !models.Message) {
        logger.error('Missing required models:', {
          hasCustomer: !!models.Customer,
          hasMessage: !!models.Message,
          availableModels: Object.keys(models)
        });
        throw new Error('Required models not available');
      }

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
        offset: (page - 1) * limit
      });

      logger.info('Query results:', {
        totalTickets: tickets.count,
        returnedTickets: tickets.rows.length,
        ticketIds: tickets.rows.map(t => t.id),
        customersFound: tickets.rows.filter(t => t.customer).length,
        messagesFound: tickets.rows.reduce((acc, t) => acc + (t.messages?.length || 0), 0)
      });

      return {
        tickets: tickets.rows,
        total: tickets.count,
        page: parseInt(page),
        totalPages: Math.ceil(tickets.count / limit)
      };
    } catch (error) {
      logger.error('Error listing tickets:', {
        error: error.message,
        stack: error.stack,
        filters: JSON.stringify(filters),
        pagination: JSON.stringify(pagination)
      });
      throw error;
    }
  }

  async getTicketById(id) {
    await this.initialize();
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
      throw new ApiError(404, 'Ticket not found');
    }

    return ticket;
  }

  async createTicket(ticketData) {
    await this.initialize();
    try {
      const models = await getModels();
      const ticket = await models.Ticket.create(ticketData);
      logger.info(`New ticket created with ID: ${ticket.id}`);
      return ticket;
    } catch (error) {
      logger.error('Error creating ticket:', error);
      throw error;
    }
  }

  async updateTicket(id, updates) {
    await this.initialize();
    const models = await getModels();
    const ticket = await models.Ticket.findByPk(id);

    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    await ticket.update(updates);
    logger.info(`Ticket ${id} updated`);
    
    return ticket;
  }

  async addMessage(ticketId, messageData) {
    await this.initialize();
    const models = await getModels();
    const ticket = await this.getTicketById(ticketId);
    const message = await models.Message.create({
      ...messageData,
      ticketId: ticket.id
    });
    
    return message;
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