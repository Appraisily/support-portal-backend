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

  _formatMessagesForOpenAI(ticket, messages, customerInfo) {
    const systemPrompt = {
      role: 'system',
      content: `You are a helpful customer support agent for Appraisily, a real estate appraisal software company.
Your task is to generate a professional and empathetic response based on the conversation history.

Key guidelines:
- Be professional yet friendly
- Show empathy and understanding
- Be concise but thorough
- Address all points raised by the customer
- Maintain consistency with previous responses
- Sign off as "Appraisily Support Team"

${customerInfo ? `Customer context:
- Total purchases: ${customerInfo.summary.totalPurchases}
- Customer status: ${customerInfo.summary.isExistingCustomer ? 'Existing' : 'New'} customer
- Has pending appraisals: ${customerInfo.summary.hasPendingAppraisals ? 'Yes' : 'No'}` : ''}

Ticket information:
- Subject: ${ticket.subject}
- Category: ${ticket.category}
- Priority: ${ticket.priority}`
    };

    const validMessages = messages
      .filter(msg => {
        const content = msg.content?.trim();
        if (!content || content.length < 3) return false;
        if (['test', 'ok', 'ss', 'sa', 'aa'].includes(content.toLowerCase())) return false;
        return true;
      })
      .map(msg => ({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.content.trim()
      }));

    return [systemPrompt, ...validMessages];
  }

  async generateTicketReply(ticket, messages, customerInfo = null) {
    await this.ensureInitialized();

    try {
      logger.info('Starting OpenAI reply generation', {
        ticketId: ticket.id,
        messageCount: messages.length,
        hasCustomerInfo: !!customerInfo
      });

      const formattedMessages = this._formatMessagesForOpenAI(ticket, messages, customerInfo);

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.5
      });

      const reply = completion.choices[0].message.content;

      logger.info('OpenAI generated reply successfully', {
        ticketId: ticket.id,
        replyLength: reply.length
      });

      return {
        success: true,
        reply
      };

    } catch (error) {
      logger.error('Error generating reply with OpenAI', {
        ticketId: ticket.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = new OpenAIService();