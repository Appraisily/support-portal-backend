const { models } = require('../config/database');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.getCustomer = async (req, res, next) => {
  try {
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
    
    // Por ahora, devolvemos un array vacío ya que no tenemos el modelo Purchase
    res.json({
      purchases: []
    });
    
    // TODO: Implementar cuando tengamos el modelo Purchase
    /*
    const purchases = await models.Purchase.findAll({
      where: { customerId },
      order: [['date', 'DESC']]
    });

    res.json({
      purchases: purchases.map(purchase => ({
        id: purchase.id,
        date: purchase.date.toISOString(),
        amount: purchase.amount,
        status: purchase.status,
        items: purchase.items
      }))
    });
    */
  } catch (error) {
    logger.error('Error getting customer purchases:', error);
    next(error);
  }
};