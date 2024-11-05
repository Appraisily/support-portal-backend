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

      logger.info('Getting models...');
      const models = await getModels();

      logger.info('Executing findAndCountAll with query:', { query, page, limit });

      if (!models.Ticket) {
        logger.error('Ticket model not found');
        throw new Error('Ticket model not found');
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
            as: 'messages'
          }
        ],
        order: [[sort, order]],
        limit: parseInt(limit),
        offset: (page - 1) * limit
      });

      logger.info('Query executed successfully:', { 
        count: tickets.count,
        rowCount: tickets.rows.length 
      });

      return {
        tickets: tickets.rows,
        total: tickets.count,
        page: parseInt(page),
        totalPages: Math.ceil(tickets.count / limit)
      };
    } catch (error) {
      logger.error('Error listing tickets:', error);
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
}

module.exports = new TicketService();