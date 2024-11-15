const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');
const ApiError = require('../utils/apiError');

class OpenAIService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initPromise = null;
    this.apiKey = null;
    this.baseURL = 'https://api.openai.com/v1'; // Default OpenAI API URL
  }

  async ensureInitialized() {
    if (this.initialized && this.client && this.apiKey) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    try {
      logger.info('Starting OpenAI initialization');
      this.initPromise = this._initialize();
      await this.initPromise;
      return true;
    } catch (error) {
      logger.error('OpenAI initialization failed:', {
        error: error.message,
        stack: error.stack,
        baseURL: this.baseURL
      });
      throw error;
    } finally {
      this.initPromise = null;
    }
  }

  async _initialize() {
    try {
      this.apiKey = await secretManager.getSecret('OPENAI_API_KEY');
      
      if (!this.apiKey) {
        throw new ApiError(503, 'OpenAI API key not configured');
      }

      logger.info('Retrieved OpenAI API key from Secret Manager');

      // Initialize OpenAI client with appropriate configuration
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        maxRetries: 3,
        timeout: 60000, // 60 second timeout
        defaultHeaders: {
          'User-Agent': 'Appraisily/1.0',
        },
        defaultQuery: {
          'api-version': '2023-05-15'
        }
      });

      this.initialized = true;
      logger.info('OpenAI service initialized successfully', {
        baseURL: this.baseURL,
        timeout: 60000,
        maxRetries: 3
      });
      return true;
    } catch (error) {
      this.client = null;
      this.initialized = false;
      this.apiKey = null;
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
        hasCustomerInfo: !!customerInfo,
        baseURL: this.baseURL
      });

      const formattedMessages = this._formatMessagesForOpenAI(ticket, messages, customerInfo);

      // Log the exact prompt being sent
      logger.info('Sending prompt to OpenAI:', {
        ticketId: ticket.id,
        messageCount: formattedMessages.length,
        systemPrompt: formattedMessages[0].content,
        messages: formattedMessages.slice(1).map(m => ({
          role: m.role,
          contentLength: m.content.length,
          preview: m.content.substring(0, 100)
        })),
        endpoint: `${this.baseURL}/chat/completions`
      });

      // Make API call with explicit parameters
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.5,
        user: ticket.id // For OpenAI tracking
      });

      if (!completion.choices || completion.choices.length === 0) {
        throw new ApiError(500, 'No response received from OpenAI');
      }

      const reply = completion.choices[0].message.content;

      logger.info('OpenAI reply generated successfully', {
        ticketId: ticket.id,
        replyLength: reply.length,
        tokenUsage: completion.usage,
        previewReply: reply.substring(0, 100),
        responseTime: Date.now() - completion.created * 1000
      });

      return {
        success: true,
        reply
      };

    } catch (error) {
      // Check if it's an OpenAI API error
      const isOpenAIError = error.constructor.name === 'APIError';
      
      logger.error('Error generating reply with OpenAI', {
        ticketId: ticket.id,
        error: error.message,
        stack: error.stack,
        isTimeout: error.message.includes('timed out'),
        isRateLimitError: error.message.includes('rate limit'),
        isAuthError: error.message.includes('authentication'),
        isOpenAIError,
        status: error.status,
        type: error.type,
        code: error.code,
        param: error.param,
        baseURL: this.baseURL
      });

      // Convert OpenAI errors to appropriate API errors
      if (error.message.includes('timed out')) {
        throw new ApiError(503, 'OpenAI request timed out. Please try again.');
      } else if (error.message.includes('rate limit')) {
        throw new ApiError(429, 'OpenAI rate limit exceeded. Please try again later.');
      } else if (error.message.includes('authentication')) {
        throw new ApiError(503, 'OpenAI authentication failed. Please check API key.');
      } else if (isOpenAIError) {
        throw new ApiError(503, `OpenAI API error: ${error.message}`);
      }

      throw new ApiError(503, `Error connecting to OpenAI: ${error.message}`);
    }
  }

  _formatMessagesForOpenAI(ticket, messages, customerInfo) {
    // Create system prompt
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
- Category: ${ticket.category || 'General'}
- Priority: ${ticket.priority}
- Status: ${ticket.status}`
    };

    // Filter and format messages
    const validMessages = messages
      .filter(msg => {
        const content = msg.content?.trim();
        if (!content || content.length < 3) {
          logger.debug('Skipping invalid message:', {
            messageId: msg.id,
            content: content,
            reason: !content ? 'empty' : 'too short'
          });
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

    // Sort messages by creation date if available
    if (validMessages[0].createdAt) {
      validMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    logger.debug('Formatted messages for OpenAI:', {
      messageCount: validMessages.length,
      roles: validMessages.map(m => m.role),
      lengths: validMessages.map(m => m.content.length),
      totalTokenEstimate: validMessages.reduce((acc, m) => acc + m.content.length / 4, 0)
    });

    return [systemPrompt, ...validMessages];
  }
}

module.exports = new OpenAIService();