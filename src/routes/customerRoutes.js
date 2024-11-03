const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');

router.get('/:customerId', authenticate, customerController.getCustomer);
router.get('/:customerId/purchases', authenticate, customerController.getCustomerPurchases);

module.exports = router;