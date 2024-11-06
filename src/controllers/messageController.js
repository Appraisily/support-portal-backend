const Message = require('../models/message');
const Ticket = require('../models/ticket');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.listMessages = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    logger.info('Listing messages', {
      ticketId,
      pagination: { page, limit }
    });

    const messages = await Message.find({ ticketId })
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Message.countDocuments({ ticketId });

    logger.info('Messages retrieved', {
      ticketId,
      messagesCount: messages.length,
      totalMessages: total
    });

    res.json({
      messages,
      pagination: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error listing messages', {
      ticketId: req.params.ticketId,
      error: error.message
    });
    next(error);
  }
};

exports.addMessage = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { content, internal } = req.body;

    logger.info('Adding message to ticket', {
      ticketId,
      internal,
      userId: req.user?.id
    });

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      logger.warn('Ticket not found for message', { ticketId });
      throw new ApiError(404, 'Ticket not found');
    }

    const message = await Message.create({
      ticketId,
      content,
      internal,
      author: req.user.id
    });

    logger.info('Message added successfully', {
      messageId: message.id,
      ticketId,
      author: req.user.id
    });

    res.status(201).json({ message });
  } catch (error) {
    logger.error('Error adding message', {
      ticketId: req.params.ticketId,
      error: error.message
    });
    next(error);
  }
};

exports.updateMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    logger.info('Updating message', {
      messageId,
      userId: req.user?.id
    });

    const message = await Message.findByIdAndUpdate(
      messageId,
      { content },
      { new: true }
    );

    if (!message) {
      logger.warn('Message not found', { messageId });
      throw new ApiError(404, 'Message not found');
    }

    logger.info('Message updated successfully', {
      messageId,
      ticketId: message.ticketId
    });

    res.json({ message });
  } catch (error) {
    logger.error('Error updating message', {
      messageId: req.params.messageId,
      error: error.message
    });
    next(error);
  }
};