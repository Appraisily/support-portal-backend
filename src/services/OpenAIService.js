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
      throw new Error('OpenAI API key not configured');
    }

    logger.info('Retrieved OpenAI API key from Secret Manager');

    this.client = new OpenAI({
      apiKey: apiKey,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    });

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

    // Filter and format messages
    const validMessages = sortedMessages
      .filter(msg => {
        const content = msg.content?.trim();
        
        // Skip empty messages
        if (!content) {
          logger.debug('Skipping empty message:', { messageId: msg.id });
          return false;
        }

        // Skip very short messages unless they're part of a conversation
        if (content.length < 5 && sortedMessages.length === 1) {
          logger.debug('Skipping short standalone message:', {
            messageId: msg.id,
            content: content
          });
          return false;
        }

        // Skip messages that are just signatures or greetings
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

    // Check if we have any valid messages
    if (validMessages.length === 0) {
      logger.warn('No valid messages found for AI processing', {
        totalMessages: messages.length
      });
      throw new ApiError(400, 'No valid messages found for AI processing. Please ensure there is at least one customer message with meaningful content.');
    }

    // Check if we have at least one customer message
    const hasCustomerMessage = validMessages.some(m => m.role === 'user');
    if (!hasCustomerMessage) {
      throw new ApiError(400, 'No customer messages found. Please ensure there is at least one message from the customer to generate a reply.');
    }

    // Keep only the last 5 relevant messages for context
    const relevantMessages = validMessages.slice(-5);

    logger.info('Prepared messages for OpenAI:', {
      ticketId: ticket.id,
      totalMessages: messages.length,
      validMessages: validMessages.length,
      relevantMessages: relevantMessages.length,
      hasCustomerMessage
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

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.5
      });

      if (!completion.choices?.[0]?.message?.content) {
        throw new ApiError(500, 'No response received from OpenAI');
      }

      const reply = completion.choices[0].message.content;

      logger.info('OpenAI reply generated successfully', {
        ticketId: ticket.id,
        replyLength: reply.length,
        tokensUsed: completion.usage?.total_tokens,
        model: completion.model
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
        isOpenAIError: error.constructor.name === 'OpenAIError'
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