const AnalysisService = require('../services/AnalysisService');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.analyzeCustomer = async (req, res, next) => {
  try {
    const { customerId, message, purchaseHistory } = req.body;

    if (!customerId || !message || !purchaseHistory) {
      throw new ApiError(400, 'Missing required fields');
    }

    const result = await AnalysisService.analyzeCustomer(
      customerId,
      message,
      purchaseHistory
    );

    logger.info(`Analysis completed for customer ${customerId}`);
    res.json(result);
  } catch (error) {
    next(error);
  }
};