const express = require('express');
const router = express.Router({ mergeParams: true });
const messageController = require('../controllers/messageController');
const { validateMessage } = require('../validators/messageValidator');

router.get('/', messageController.listMessages);
router.post('/', validateMessage, messageController.addMessage);
router.patch('/:messageId', validateMessage, messageController.updateMessage);

module.exports = router;