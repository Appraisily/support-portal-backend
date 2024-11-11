const OpenAI = require('openai');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

class OpenAIService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    try {
      this.initPromise = this._initialize();
      await this.initPromise;
      this.initialized = true;
    } catch (error) {
      this.initPromise = null;
      logger.error('OpenAI service initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async _initialize() {
    const apiKey = await secretManager.getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    this.client = new OpenAI({
      apiKey: apiKey
    });

    logger.info('OpenAI service initialized successfully');
  }

  async generateEmailReply(customerMessage, context) {
    await this.ensureInitialized();

    try {
      const prompt = this._constructPrompt(customerMessage, context);
      
      const completion = await this.client.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a helpful customer support representative. Write professional, friendly, and solution-focused email replies."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const reply = completion.choices[0].message.content;
      
      logger.info('Email reply generated successfully', {
        messageLength: customerMessage.length,
        replyLength: reply.length
      });

      return reply;
    } catch (error) {
      logger.error('Error generating email reply', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async generateTicketReply(latestMessage, conversationHistory, context) {
    await this.ensureInitialized();

    try {
      const messages = [
        {
          role: "system",
          content: this._constructSystemPrompt(context)
        },
        ...this._formatConversationHistory(conversationHistory),
        {
          role: "user",
          content: "Generate a professional reply to the latest customer message that addresses their concerns and maintains context of the conversation."
        }
      ];

      const completion = await this.client.chat.completions.create({
        model: "gpt-4",
        messages,
        temperature: 0.7,
        max_tokens: 500
      });

      const reply = completion.choices[0].message.content;

      logger.info('Ticket reply generated successfully', {
        ticketSubject: context.ticketSubject,
        messageLength: latestMessage.length,
        replyLength: reply.length
      });

      return reply;
    } catch (error) {
      logger.error('Error generating ticket reply', {
        error: error.message,
        stack: error.stack,
        ticketSubject: context.ticketSubject
      });
      throw error;
    }
  }

  _constructSystemPrompt(context) {
    return `You are a professional customer support agent for Appraisily. 
    
Current ticket context:
- Subject: ${context.ticketSubject}
- Priority: ${context.priority}
- Category: ${context.category}
- Customer Status: ${context.customerStatus}
- Previous Interactions: ${context.previousInteractions}

Guidelines:
1. Be professional and empathetic
2. Address the specific issue in the ticket
3. Maintain context of previous messages
4. Provide clear next steps
5. Use a friendly but professional tone
6. Be concise but thorough
7. Sign off appropriately as "Appraisily Support"`;
  }

  _formatConversationHistory(history) {
    return history.map(msg => ({
      role: msg.role === 'customer' ? 'user' : 'assistant',
      content: msg.content
    }));
  }

  _constructPrompt(customerMessage, context) {
    const contextInfo = [
      `Customer Status: ${context.customerStatus || 'Regular'}`,
      `Previous Interactions: ${context.previousInteractions || 'None'}`,
      `Recent Purchases: ${context.recentPurchases ? 'Yes' : 'No'}`,
      `Priority Level: ${context.priority || 'Normal'}`
    ].join('\n');

    return `
Customer Message:
${customerMessage}

Context:
${contextInfo}

Generate a professional and empathetic email reply that:
1. Acknowledges the customer's concern
2. Provides clear and helpful information
3. Maintains a friendly and professional tone
4. Includes next steps or resolution
5. Ends with an appropriate closing
`;
  }
}

module.exports = new OpenAIService();