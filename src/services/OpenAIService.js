const { OpenAI } = require('openai');
const logger = require('../utils/logger');

class OpenAIService {
  constructor() {
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.OPENAI_API_KEY) {
        logger.error('OpenAI API key not found in environment');
        this.mockMode = true;
        return;
      }

      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      logger.info('OpenAI service initialized successfully');
    } else {
      logger.info('Running in development mode - using mock OpenAI');
      this.mockMode = true;
    }
  }

  async generateReply(ticket, context) {
    try {
      if (this.mockMode) {
        return this.generateMockReply(ticket);
      }

      const messages = [
        {
          role: 'system',
          content: `You are a helpful customer support agent. Use a professional and friendly tone. 
                   Consider the customer's history and context when responding.`
        },
        {
          role: 'user',
          content: this.buildPrompt(ticket, context)
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 500
      });

      const reply = response.choices[0].message.content;
      logger.info('Generated AI reply for ticket:', ticket.id);
      return reply;

    } catch (error) {
      logger.error('Error generating AI reply:', error);
      return this.generateMockReply(ticket);
    }
  }

  buildPrompt(ticket, context) {
    const {
      subject,
      messages,
      customer,
      category,
      priority
    } = ticket;

    const lastMessage = messages[messages.length - 1];

    return `
      Generate a professional customer support response.

      Ticket Details:
      - Subject: ${subject}
      - Category: ${category}
      - Priority: ${priority}
      - Customer Name: ${customer.name}
      
      Customer History:
      - Total Purchases: ${context.totalPurchases || 0}
      - Customer Since: ${context.customerSince || 'N/A'}
      - Recent Issues: ${context.recentIssues ? 'Yes' : 'No'}

      Latest Customer Message:
      "${lastMessage.content}"

      Previous Interaction Context:
      ${messages.slice(-3, -1).map(m => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n')}

      Generate a helpful and empathetic response addressing the customer's concerns.
    `;
  }

  generateMockReply(ticket) {
    const templates = [
      `Dear ${ticket.customer.name},\n\nThank you for reaching out about "${ticket.subject}". I understand your concern and I'm here to help. We'll look into this right away and get back to you with a solution.\n\nBest regards,\nSupport Team`,
      `Hi ${ticket.customer.name},\n\nI appreciate you bringing this to our attention. I've reviewed your ticket regarding "${ticket.subject}" and I'm working on resolving this for you. Let me know if you need any additional information.\n\nBest regards,\nSupport Team`,
      `Hello ${ticket.customer.name},\n\nThank you for your patience. I've reviewed your request about "${ticket.subject}" and I'm happy to assist you. We'll process this as quickly as possible.\n\nBest regards,\nSupport Team`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }
}

module.exports = new OpenAIService();