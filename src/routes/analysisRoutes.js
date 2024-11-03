const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');
const { validateAnalysisRequest } = require('../validators/analysisValidator');
const { authenticate } = require('../middleware/auth');

router.post('/analyze-customer', authenticate, validateAnalysisRequest, analysisController.analyzeCustomer);

module.exports = router;