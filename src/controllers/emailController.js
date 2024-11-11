const OpenAIService = require('../services/OpenAIService');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

exports.generateReply = async (req, res, next) => {
  try {
    const { message, context } = req.body;

    logger.info('Generating email reply', {
      messageLength: message.length,
      hasContext: !!context
    });

    if (!message) {
      throw new ApiError(400, 'Message is required');
    }

    const reply = await OpenAIService.generateEmailReply(message, context || {});

    res.json({
      success: true,
      reply
    });
  } catch (error) {
    logger.error('Error in email reply generation', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};