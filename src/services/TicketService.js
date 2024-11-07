const logger = require('../utils/logger');
const { getModels } = require('../config/database');
const ApiError = require('../utils/apiError');

class TicketService {
  constructor() {
    this.initialized = false;
    this.models = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      this.models = await getModels();
      
      if (!this.models.Ticket || !this.models.User || !this.models.Message) {
        throw new Error('Required models not available');
      }
      
      this.initialized = true;
      logger.info('TicketService initialized successfully');
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
      
      const { 
        status, 
        priority, 
        sort = 'createdAt', 
        order = 'DESC' 
      } = filters;

      const page = Math.max(1, parseInt(pagination.page) || 1);
      const limit = Math.max(1, Math.min(50, parseInt(pagination.limit) || 10));

      const query = {};
      if (status) query.status = status;
      if (priority) query.priority = priority;

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
        offset: (page - 1) * limit
      });

      return {
        tickets: tickets.rows,
        total: tickets.count,
        page: parseInt(page),
        totalPages: Math.ceil(tickets.count / limit)
      };

    } catch (error) {
      logger.error('Error listing tickets', {
        error: error.message,
        stack: error.stack,
        filters
      });
      throw error;
    }
  }
}

module.exports = new TicketService();