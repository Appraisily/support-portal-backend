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
    await this.ensureInitialized();

    try {
      // Get ticket with all related data
      const ticket = await this.models.Ticket.findByPk(id, {
        include: [
          {
            model: this.models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.models.Message,
            as: 'messages',
            attributes: ['id', 'content', 'direction', 'createdAt'],
            include: [
              {
                model: this.models.Attachment,
                as: 'attachments',
                attributes: ['id', 'filename', 'url'],
                through: { attributes: [] }
              }
            ],
            order: [['createdAt', 'ASC']]
          }
        ]
      });

      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      // Get customer info from sheets if customer exists
      let customerInfo = null;
      if (ticket.customer?.email) {
        try {
          customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
        } catch (error) {
          logger.warn('Failed to get customer info:', {
            error: error.message,
            email: ticket.customer.email
          });
          customerInfo = {
            sales: [],
            pendingAppraisals: [],
            completedAppraisals: [],
            summary: {
              totalPurchases: 0,
              totalSpent: 0,
              hasPendingAppraisals: false,
              hasCompletedAppraisals: false,
              totalAppraisals: 0,
              isExistingCustomer: false,
              lastPurchaseDate: null,
              stripeCustomerId: null
            }
          };
        }
      }

      // Format messages ensuring all required fields are present
      const messages = ticket.messages.map(msg => {
        // Log raw message for debugging
        logger.debug('Processing message:', {
          id: msg.id,
          hasContent: !!msg.content,
          contentType: typeof msg.content,
          contentLength: msg.content?.length
        });

        return {
          id: msg.id,
          content: msg.content || '',
          direction: msg.direction,
          createdAt: msg.createdAt.toISOString(),
          ...(msg.attachments?.length > 0 && {
            attachments: msg.attachments.map(att => ({
              id: att.id,
              name: att.filename,
              url: att.url
            }))
          })
        };
      });

      // Log processed messages for debugging
      logger.info('Retrieved ticket with messages:', {
        ticketId: id,
        messageCount: messages.length,
        hasCustomer: !!ticket.customer,
        hasCustomerInfo: !!customerInfo,
        messages: messages.map(m => ({
          id: m.id,
          direction: m.direction,
          contentLength: m.content.length,
          content: m.content.substring(0, 50), // Log first 50 chars for debugging
          hasAttachments: m.attachments?.length > 0
        }))
      });

      // Return response in the exact format expected by frontend
      return {
        success: true,
        data: {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category || 'general',
          customer: ticket.customer ? {
            id: ticket.customer.id,
            name: ticket.customer.name,
            email: ticket.customer.email
          } : null,
          messages: messages,
          customerInfo: customerInfo,
          createdAt: ticket.createdAt.toISOString(),
          updatedAt: ticket.updatedAt.toISOString(),
          lastMessageAt: ticket.lastMessageAt?.toISOString(),
          gmailThreadId: ticket.gmailThreadId
        }
      };
    } catch (error) {
      logger.error('Error getting ticket:', {
        error: error.message,
        stack: error.stack,
        ticketId: id
      });
      throw error;
    }
  }

  async addReply(ticketId, { content, direction, attachments = [] }) {
    await this.ensureInitialized();

    try {
      logger.info('Adding reply to ticket', {
        ticketId,
        direction,
        contentLength: content?.length,
        hasAttachments: attachments.length > 0
      });

      // Create message
      const message = await this.models.Message.create({
        ticketId,
        content: content || '',
        direction: direction || 'outbound'
      });

      // Add attachments if any
      if (attachments.length > 0) {
        await message.setAttachments(attachments);
      }

      // Update ticket's lastMessageAt
      await this.models.Ticket.update(
        { lastMessageAt: new Date() },
        { where: { id: ticketId } }
      );

      return message;
    } catch (error) {
      logger.error('Error adding reply:', {
        error: error.message,
        stack: error.stack,
        ticketId,
        direction
      });
      throw new Error(`Failed to add reply: ${error.message}`);
    }
  }
}

// Export a singleton instance
const ticketService = new TicketService();
module.exports = ticketService;