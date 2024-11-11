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