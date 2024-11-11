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

  async generateTicketReply(ticketId, messages) {
    await this.ensureInitialized();

    try {
      logger.info('Generating reply with OpenAI', {
        ticketId,
        messageCount: messages.length
      });

      // Format conversation for OpenAI
      const formattedMessages = [
        {
          role: 'system',
          content: `You are a helpful customer support agent for Appraisily. 
          Your task is to generate a professional and empathetic response to the customer's latest message.
          Keep responses concise but thorough, and maintain a friendly, professional tone.
          Sign off as "Appraisily Support Team".`
        },
        ...messages.map(msg => ({
          role: msg.direction === 'inbound' ? 'user' : 'assistant',
          content: msg.content
        }))
      ];

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: formattedMessages,
        temperature: 0.7,
        max_tokens: 500
      });

      const generatedReply = completion.choices[0].message.content;

      logger.info('Reply generated successfully', {
        ticketId,
        replyLength: generatedReply.length
      });

      return {
        success: true,
        reply: generatedReply
      };

    } catch (error) {
      logger.error('Error generating reply with OpenAI', {
        ticketId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = new OpenAIService();