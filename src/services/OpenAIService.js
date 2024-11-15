const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');
const ApiError = require('../utils/apiError');

class OpenAIService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initPromise = null;
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
      this.initPromise = null;
      logger.error('OpenAI service initialization failed', {
        error: error.message,
        stack: error.stack,
        type: error.constructor.name
      });
      throw error;
    }
  }

  async _initialize() {
    const apiKey = await secretManager.getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ApiError(503, 'OpenAI API key not configured');
    }

    this.client = new OpenAI({
      apiKey: apiKey
    });

    logger.info('OpenAI service initialized successfully');
    return true;
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
            id: msg.id,
            content: content?.substring(0, 20),
            reason: 'Too short or empty'
          });
          return false;
        }
        if (['test', 'ok', 'ss', 'sa', 'aa'].includes(content.toLowerCase())) {
          logger.debug('Skipping test message:', {
            id: msg.id,
            content: content
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

    logger.debug('Formatted messages for OpenAI:', {
      messageCount: validMessages.length,
      hasSystemPrompt: true,
      firstMessage: validMessages[0]?.content.substring(0, 50),
      lastMessage: validMessages[validMessages.length - 1]?.content.substring(0, 50),
      totalTokenEstimate: validMessages.reduce((acc, msg) => acc + msg.content.length, 0) / 4
    });

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

      if (!this.client) {
        throw new ApiError(503, 'OpenAI client not initialized');
      }

      const formattedMessages = this._formatMessagesForOpenAI(ticket, messages, customerInfo);

      logger.debug('Sending request to OpenAI', {
        model: 'gpt-4',
        messageCount: formattedMessages.length,
        systemPromptLength: formattedMessages[0].content.length,
        totalTokenEstimate: formattedMessages.reduce((acc, msg) => acc + msg.content.length, 0) / 4
      });

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.5
      });

      if (!completion.choices || completion.choices.length === 0) {
        throw new ApiError(500, 'No response received from OpenAI');
      }

      const reply = completion.choices[0].message.content;

      logger.info('OpenAI generated reply successfully', {
        ticketId: ticket.id,
        replyLength: reply.length,
        firstLine: reply.split('\n')[0],
        model: completion.model,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens
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
        type: error.constructor.name,
        isOpenAIError: error instanceof OpenAI.APIError,
        statusCode: error.status || error.statusCode
      });

      // Handle specific OpenAI errors
      if (error instanceof OpenAI.APIError) {
        throw new ApiError(
          error.status || 500,
          `OpenAI API error: ${error.message}`
        );
      }

      throw error;
    }
  }
}

module.exports = new OpenAIService();