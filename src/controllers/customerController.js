const Customer = require('../models/customer');
const Purchase = require('../models/purchase');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    
    if (!customer) {
      throw new ApiError(404, 'Customer not found');
    }

    res.json({
      id: customer._id,
      name: customer.name,
      email: customer.email,
      avatar: customer.avatar,
      joinedAt: customer.joinedAt.toISOString(),
      totalPurchases: customer.totalPurchases,
      lifetimeValue: customer.lifetimeValue
    });
  } catch (error) {
    next(error);
  }
};

exports.getCustomerPurchases = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const purchases = await Purchase.find({ customerId })
      .sort({ date: -1 });

    res.json({
      purchases: purchases.map(purchase => ({
        id: purchase._id,
        date: purchase.date.toISOString(),
        amount: purchase.amount,
        status: purchase.status,
        items: purchase.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        }))
      }))
    });
  } catch (error) {
    next(error);
  }
};