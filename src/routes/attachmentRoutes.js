const express = require('express');
const router = express.Router();
const attachmentController = require('../controllers/attachmentController');
const multer = require('../middleware/multer');

router.post('/', multer.single('file'), attachmentController.uploadAttachment);
router.delete('/:id', attachmentController.deleteAttachment);

module.exports = router;