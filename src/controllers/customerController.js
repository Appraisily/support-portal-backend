const { getModels } = require('../models');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.getCustomer = async (req, res, next) => {
  try {
    logger.info('Getting customer details', {
      customerId: req.params.customerId
    });

    const models = await getModels();
    const customer = await models.Customer.findByPk(req.params.customerId);
    
    if (!customer) {
      logger.warn('Customer not found', {
        customerId: req.params.customerId
      });
      throw new ApiError(404, 'Customer not found');
    }

    logger.info('Customer retrieved successfully', {
      customerId: customer.id,
      email: customer.email
    });

    res.json({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      avatar: customer.avatar,
      joinedAt: customer.createdAt.toISOString(),
      totalPurchases: customer.totalPurchases,
      lifetimeValue: customer.lifetimeValue
    });
  } catch (error) {
    logger.error('Error getting customer', {
      error: error.message,
      customerId: req.params.customerId
    });
    next(error);
  }
};

exports.getCustomerPurchases = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    
    logger.info('Getting customer purchases', {
      customerId
    });

    const models = await getModels();
    
    logger.info('Customer purchases retrieved', {
      customerId,
      purchasesCount: 0  // Por ahora siempre es 0
    });

    res.json({
      purchases: []
    });
  } catch (error) {
    logger.error('Error getting customer purchases', {
      error: error.message,
      customerId: req.params.customerId
    });
    next(error);
  }
};