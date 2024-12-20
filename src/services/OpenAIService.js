const OpenAI = require('openai');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const secretManager = require('../utils/secretManager');

class OpenAIService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initPromise = null;
    this.timeout = 60000; // 60 seconds
    this.maxRetries = 3;
  }

  async ensureInitialized() {
    if (this.initialized) return true;
    if (this.initPromise) return this.initPromise;

    try {
      logger.info('Starting OpenAI initialization');
      this.initPromise = this._initialize();
      await this.initPromise;
      this.initialized = true;
      return true;
    } catch (error) {
      this.initPromise = null;
      logger.error('OpenAI initialization failed:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async _initialize() {
    const apiKey = await secretManager.getSecret('OPENAI_API_KEY');
    if (!apiKey) {
      logger.error('OpenAI API key not found in Secret Manager');
      throw new Error('OpenAI API key not configured');
    }

    logger.info('Retrieved OpenAI API key from Secret Manager');

    this.client = new OpenAI({
      apiKey: apiKey,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    });

    // Test the API key with a simple completion
    try {
      await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'system', content: 'Test message' }],
        max_tokens: 5
      });
      logger.info('OpenAI API key validated successfully');
    } catch (error) {
      logger.error('OpenAI API key validation failed:', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Invalid OpenAI API key');
    }

    logger.info('OpenAI service initialized successfully');
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

    // Sort messages by creation date
    const sortedMessages = [...messages].sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );

    // Filter and format messages with more lenient validation
    const validMessages = sortedMessages
      .filter(msg => {
        const content = msg.content?.trim();
        
        // Skip completely empty messages
        if (!content) {
          logger.debug('Skipping empty message:', { messageId: msg.id });
          return false;
        }

        // Include all non-empty messages in development/test environments
        if (process.env.NODE_ENV !== 'production') {
          return true;
        }

        // In production, apply stricter validation
        if (content.length < 3) {
          logger.debug('Skipping very short message:', {
            messageId: msg.id,
            content: content
          });
          return false;
        }

        // Skip messages that are just signatures
        const commonSignatures = [
          'saludos cordiales',
          'best regards',
          'appraisily support team',
          'soporte técnico'
        ];
        
        const lowerContent = content.toLowerCase();
        if (commonSignatures.some(sig => lowerContent.includes(sig)) && content.length < 200) {
          logger.debug('Skipping signature message:', {
            messageId: msg.id,
            preview: content.substring(0, 50)
          });
          return false;
        }

        return true;
      })
      .map(msg => ({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.content.trim()
      }));

    // Log validation results
    logger.info('Message validation results:', {
      totalMessages: messages.length,
      validMessages: validMessages.length,
      invalidMessages: messages.length - validMessages.length,
      messageDirections: messages.map(m => m.direction)
    });

    // Check if we have any valid messages
    if (validMessages.length === 0) {
      logger.warn('No valid messages found for AI processing', {
        totalMessages: messages.length,
        messageContents: messages.map(m => ({
          id: m.id,
          direction: m.direction,
          content: m.content?.substring(0, 50)
        }))
      });
      throw new ApiError(400, 'No valid messages found for AI processing. Please ensure there is at least one message with meaningful content.');
    }

    // In development/test, don't require customer messages
    if (process.env.NODE_ENV === 'production') {
      const hasCustomerMessage = validMessages.some(m => m.role === 'user');
      if (!hasCustomerMessage) {
        throw new ApiError(400, 'No customer messages found. Please ensure there is at least one message from the customer to generate a reply.');
      }
    }

    // Keep only the last 5 relevant messages for context
    const relevantMessages = validMessages.slice(-5);

    logger.info('Prepared messages for OpenAI:', {
      ticketId: ticket.id,
      totalMessages: messages.length,
      validMessages: validMessages.length,
      relevantMessages: relevantMessages.length,
      messageRoles: relevantMessages.map(m => m.role)
    });

    return [systemPrompt, ...relevantMessages];
  }

  async generateTicketReply(ticket, messages, customerInfo = null) {
    try {
      await this.ensureInitialized();

      logger.info('Starting OpenAI reply generation', { 
        ticketId: ticket.id,
        messageCount: messages.length,
        hasCustomerInfo: !!customerInfo
      });

      const formattedMessages = this._formatMessagesForOpenAI(ticket, messages, customerInfo);

      logger.info('Making OpenAI API call', {
        ticketId: ticket.id,
        messageCount: formattedMessages.length,
        model: 'gpt-4'
      });

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.5
      });

      if (!completion.choices?.[0]?.message?.content) {
        logger.error('Empty response from OpenAI', {
          ticketId: ticket.id,
          completion: completion
        });
        throw new ApiError(500, 'No response received from OpenAI');
      }

      const reply = completion.choices[0].message.content;

      logger.info('OpenAI reply generated successfully', {
        ticketId: ticket.id,
        replyLength: reply.length,
        tokensUsed: completion.usage?.total_tokens,
        model: completion.model,
        replyPreview: reply.substring(0, 100)
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
        isOpenAIError: error.constructor.name === 'OpenAIError',
        errorCode: error.code,
        errorStatus: error.status,
        errorType: error.type
      });

      // Handle specific OpenAI errors
      if (error.constructor.name === 'OpenAIError') {
        throw new ApiError(503, `OpenAI API error: ${error.message}`);
      }

      // Handle validation errors
      if (error instanceof ApiError) {
        throw error;
      }

      // Handle other errors
      throw new ApiError(500, 'Failed to generate AI reply. Please try again later.');
    }
  }
}

module.exports = new OpenAIService();