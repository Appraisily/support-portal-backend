const Attachment = require('../models/attachment');
const StorageService = require('../services/StorageService');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      logger.warn('Upload attempted without file');
      throw new ApiError(400, 'No file uploaded');
    }

    const { ticketId, messageId } = req.body;
    
    logger.info('Uploading attachment', {
      ticketId,
      messageId,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });

    const fileData = await StorageService.uploadFile(req.file, ticketId);
    const attachment = new Attachment({
      ...fileData,
      ticketId,
      messageId
    });

    await attachment.save();
    
    logger.info('Attachment uploaded successfully', {
      attachmentId: attachment.id,
      ticketId,
      messageId
    });

    res.status(201).json({ attachment });
  } catch (error) {
    logger.error('Error uploading attachment', {
      error: error.message,
      ticketId: req.body.ticketId,
      fileName: req.file?.originalname
    });
    next(error);
  }
};

exports.deleteAttachment = async (req, res, next) => {
  try {
    logger.info('Deleting attachment', {
      attachmentId: req.params.id
    });

    const attachment = await Attachment.findById(req.params.id);
    
    if (!attachment) {
      logger.warn('Attachment not found', { attachmentId: req.params.id });
      throw new ApiError(404, 'Attachment not found');
    }

    await StorageService.deleteFile(attachment.name);
    await attachment.remove();

    logger.info('Attachment deleted successfully', {
      attachmentId: req.params.id,
      ticketId: attachment.ticketId
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting attachment', {
      error: error.message,
      attachmentId: req.params.id
    });
    next(error);
  }
};