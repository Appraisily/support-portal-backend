const { getModels } = require('../models');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.getCustomer = async (req, res, next) => {
  try {
    const models = await getModels();
    const customer = await models.Customer.findByPk(req.params.customerId);
    
    if (!customer) {
      throw new ApiError(404, 'Customer not found');
    }

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
    logger.error('Error getting customer:', error);
    next(error);
  }
};

exports.getCustomerPurchases = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const models = await getModels();
    
    // Por ahora, devolvemos un array vacío
    res.json({
      purchases: []
    });
  } catch (error) {
    logger.error('Error getting customer purchases:', error);
    next(error);
  }
};