const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const ticketRoutes = require('./ticketRoutes');
const messageRoutes = require('./messageRoutes');
const attachmentRoutes = require('./attachmentRoutes');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const gmailRoutes = require('./gmailRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const customerRoutes = require('./customerRoutes');
const predefinedReplyRoutes = require('./predefinedReplyRoutes');
const analysisRoutes = require('./analysisRoutes');

router.use('/auth', authRoutes);
router.use('/tickets', authenticate, ticketRoutes);
router.use('/messages', authenticate, messageRoutes);
router.use('/attachments', authenticate, attachmentRoutes);
router.use('/users', authenticate, userRoutes);
router.use('/gmail', authenticate, gmailRoutes);
router.use('/analytics', authenticate, analyticsRoutes);
router.use('/customers', authenticate, customerRoutes);
router.use('/predefined-replies', authenticate, predefinedReplyRoutes);
router.use('/analysis', authenticate, analysisRoutes);

module.exports = router;
