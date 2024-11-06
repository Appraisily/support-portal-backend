const AnalysisService = require('../services/AnalysisService');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.analyzeCustomer = async (req, res, next) => {
  try {
    const { customerId, message, purchaseHistory } = req.body;

    logger.info('Starting customer analysis', {
      customerId,
      hasMessage: !!message,
      hasPurchaseHistory: !!purchaseHistory
    });

    if (!customerId || !message || !purchaseHistory) {
      logger.warn('Missing required fields for analysis', {
        customerId: !!customerId,
        message: !!message,
        purchaseHistory: !!purchaseHistory
      });
      throw new ApiError(400, 'Missing required fields');
    }

    const result = await AnalysisService.analyzeCustomer(
      customerId,
      message,
      purchaseHistory
    );

    logger.info('Analysis completed successfully', {
      customerId,
      analysisId: result.id
    });

    res.json(result);
  } catch (error) {
    logger.error('Error during customer analysis', {
      customerId: req.body?.customerId,
      error: error.message
    });
    next(error);
  }
};