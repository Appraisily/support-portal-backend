const logger = require('../utils/logger');
const { initializeDatabase } = require('../config/database');
const ApiError = require('../utils/apiError');
const { Op } = require('sequelize');
const SheetsService = require('./SheetsService');

class TicketService {
  constructor() {
    this.sequelize = null;
    this.models = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.sequelize = await initializeDatabase();
      this.models = this.sequelize.models;
      
      if (!this.models.Ticket || !this.models.Customer || !this.models.Message) {
        throw new Error('Required models not found');
      }

      this.initialized = true;
      logger.info('TicketService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize TicketService:', {
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

  async getTicketById(id) {
    try {
      await this.ensureInitialized();
      
      const ticket = await this.models.Ticket.findByPk(id, {
        include: [
          {
            model: this.models.Customer,
            as: 'customer'
          },
          {
            model: this.models.Message,
            as: 'messages',
            order: [['createdAt', 'ASC']]
          },
          {
            model: this.models.User,
            as: 'assignedTo',
            attributes: ['id', 'name', 'email']
          }
        ]
      });

      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      // Get customer info from sheets if customer exists
      if (ticket.customer && ticket.customer.email) {
        try {
          const customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
          ticket.setDataValue('customerInfo', customerInfo);
        } catch (error) {
          logger.error('Error getting customer info from sheets:', {
            error: error.message,
            ticketId: id,
            customerEmail: ticket.customer.email
          });
          // Don't fail the whole request if sheets info fails
          ticket.setDataValue('customerInfo', {
            error: 'Could not retrieve customer information'
          });
        }
      }

      // Map status for frontend
      if (ticket.status === 'open') {
        ticket.status = 'pending';
      }

      return ticket;
    } catch (error) {
      logger.error('Error retrieving ticket:', {
        error: error.message,
        ticketId: id
      });
      throw error;
    }
  }

  // ... rest of the existing methods ...
}

module.exports = new TicketService();