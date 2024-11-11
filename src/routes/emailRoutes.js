const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { validateAuth } = require('../middleware/auth');
const { validateEmailGeneration } = require('../validators/emailValidator');

router.post('/generate-reply', validateAuth, validateEmailGeneration, emailController.generateReply);

module.exports = router;