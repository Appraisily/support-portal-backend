const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');
const ApiError = require('../utils/apiError');

class OpenAIService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initPromise = null;
    this.initializationError = null;
  }

  async ensureInitialized() {
    if (this.initialized && this.client) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    try {
      this.initPromise = this._initialize();
      await this.initPromise;
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('OpenAI initialization failed:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      this.initPromise = null;
    }
  }

  async _initialize() {
    try {
      logger.info('Initializing OpenAI service...');
      
      // Get API key from Secret Manager
      const apiKey = await secretManager.getSecret('OPENAI_API_KEY');
      
      if (!apiKey) {
        throw new ApiError(503, 'OpenAI API key not configured');
      }

      // Initialize OpenAI client
      this.client = new OpenAI({
        apiKey: apiKey
      });

      // Test the connection
      await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'system', content: 'Test connection' }],
        max_tokens: 5
      });

      logger.info('OpenAI service initialized successfully');
      return true;
    } catch (error) {
      this.client = null;
      this.initialized = false;
      
      if (error instanceof OpenAI.APIError) {
        throw new ApiError(503, `OpenAI API error: ${error.message}`);
      }
      throw error;
    }
  }

  async generateTicketReply(ticket, messages, customerInfo = null) {
    try {
      await this.ensureInitialized();

      if (!this.client) {
        throw new ApiError(503, 'OpenAI client not initialized');
      }

      logger.info('Starting OpenAI reply generation', {
        ticketId: ticket.id,
        messageCount: messages.length,
        hasCustomerInfo: !!customerInfo
      });

      const formattedMessages = this._formatMessagesForOpenAI(ticket, messages, customerInfo);

      logger.debug('Sending request to OpenAI', {
        messageCount: formattedMessages.length,
        model: 'gpt-4',
        firstMessagePreview: formattedMessages[0].content.substring(0, 100)
      });

      const startTime = Date.now();
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.5
      });

      const processingTime = Date.now() - startTime;

      if (!completion.choices || completion.choices.length === 0) {
        throw new ApiError(500, 'No response received from OpenAI');
      }

      const reply = completion.choices[0].message.content;

      logger.info('OpenAI reply generated successfully', {
        ticketId: ticket.id,
        replyLength: reply.length,
        processingTime,
        tokenUsage: completion.usage,
        previewText: reply.substring(0, 100)
      });

      return {
        success: true,
        reply
      };

    } catch (error) {
      logger.error('Error generating reply with OpenAI', {
        ticketId: ticket.id,
        error: error.message,
        stack: error.stack,
        isOpenAIError: error instanceof OpenAI.APIError
      });
      throw error;
    }
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
- Has pending appraisals: ${customerInfo.summary.hasPendingAppraisals ? 'Yes' : 'No'}
- Total spent: $${customerInfo.summary.totalSpent}
- Last purchase: ${customerInfo.summary.lastPurchaseDate || 'Never'}` : ''}

Ticket information:
- Subject: ${ticket.subject}
- Category: ${ticket.category}
- Priority: ${ticket.priority}
- Status: ${ticket.status}`
    };

    // Filter and validate messages
    const validMessages = messages
      .filter(msg => {
        const content = msg.content?.trim();
        if (!content || content.length < 3) {
          logger.debug('Skipping invalid message:', {
            content: content?.substring(0, 20),
            reason: 'Too short or empty'
          });
          return false;
        }
        if (['test', 'ok', 'ss', 'sa', 'aa'].includes(content.toLowerCase())) {
          logger.debug('Skipping test message:', { content });
          return false;
        }
        return true;
      })
      .map(msg => ({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.content.trim()
      }));

    if (validMessages.length === 0) {
      throw new ApiError(400, 'No valid messages found for AI processing');
    }

    logger.debug('Formatted messages for OpenAI:', {
      messageCount: validMessages.length,
      firstMessagePreview: validMessages[0]?.content.substring(0, 50),
      lastMessagePreview: validMessages[validMessages.length - 1]?.content.substring(0, 50)
    });

    return [systemPrompt, ...validMessages];
  }
}

module.exports = new OpenAIService();