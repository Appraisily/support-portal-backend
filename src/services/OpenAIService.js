const OpenAI = require('openai');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const secretManager = require('../utils/secretManager');

class OpenAIService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initPromise = null;
    this.baseURL = 'https://api.openai.com/v1';
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
      baseURL: this.baseURL,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    });

    logger.info('OpenAI service initialized successfully', {
      baseURL: this.baseURL,
      timeout: this.timeout,
      maxRetries: this.maxRetries
    });
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
        
        // Skip empty or very short messages
        if (!content || content.length < 3) {
          logger.debug('Skipping invalid message:', {
            messageId: msg.id,
            content: content,
            reason: !content ? 'empty' : 'too short'
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
        if (commonSignatures.some(sig => lowerContent.includes(sig))) {
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
        content: [{ 
          type: 'text', 
          text: msg.content.trim() 
        }]
      }));

    // Ensure we have at least one customer message
    const hasCustomerMessage = validMessages.some(m => m.role === 'user');
    if (!hasCustomerMessage) {
      logger.warn('No valid customer messages found', {
        ticketId: ticket.id,
        totalMessages: messages.length,
        validMessages: validMessages.length
      });
      throw new ApiError(400, 'No valid customer messages found for AI processing');
    }

    // Keep only the last 5 relevant messages for context
    const relevantMessages = validMessages.slice(-5);

    logger.info('Sending prompt to OpenAI:', {
      ticketId: ticket.id,
      messageCount: relevantMessages.length,
      systemPrompt: systemPrompt.content,
      messages: relevantMessages.map(m => ({
        role: m.role,
        contentLength: m.content[0].text.length,
        preview: m.content[0].text.substring(0, 50)
      })),
      endpoint: `${this.baseURL}/chat/completions`
    });

    return [systemPrompt, ...relevantMessages];
  }

  async generateTicketReply(ticket, messages, customerInfo = null) {
    try {
      await this.ensureInitialized();

      logger.info('Starting OpenAI reply generation', {
        ticketId: ticket.id,
        messageCount: messages.length,
        hasCustomerInfo: !!customerInfo,
        baseURL: this.baseURL
      });

      const formattedMessages = this._formatMessagesForOpenAI(ticket, messages, customerInfo);

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.5,
        timeout: this.timeout
      });

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
        isOpenAIError: true
      });

      throw new ApiError(503, `OpenAI API error: ${error.message}`);
    }
  }
}

module.exports = new OpenAIService();