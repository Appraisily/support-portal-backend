const Attachment = require('../models/attachment');
const StorageService = require('../services/StorageService');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    const { ticketId, messageId } = req.body;
    const fileData = await StorageService.uploadFile(req.file, ticketId);

    const attachment = new Attachment({
      ...fileData,
      ticketId,
      messageId
    });

    await attachment.save();
    logger.info(`File uploaded for ticket ${ticketId}`);

    res.status(201).json({ attachment });
  } catch (error) {
    next(error);
  }
};

exports.deleteAttachment = async (req, res, next) => {
  try {
    const attachment = await Attachment.findById(req.params.id);
    
    if (!attachment) {
      throw new ApiError(404, 'Attachment not found');
    }

    await StorageService.deleteFile(attachment.name);
    await attachment.remove();

    logger.info(`Attachment ${req.params.id} deleted`);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};