const express = require('express');
const router = express.Router();
const predefinedReplyController = require('../controllers/predefinedReplyController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, predefinedReplyController.listReplies);
router.post('/', authenticate, predefinedReplyController.createReply);
router.put('/:id', authenticate, predefinedReplyController.updateReply);
router.delete('/:id', authenticate, predefinedReplyController.deleteReply);

module.exports = router;