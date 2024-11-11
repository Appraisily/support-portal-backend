const Message = require('../models/message');
const Ticket = require('../models/ticket');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.listMessages = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const messages = await Message.find({ ticketId })
      .populate('author', 'name email')
      .populate('attachments')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Message.countDocuments({ ticketId });

    res.json({
      messages,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
};

exports.addMessage = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { content, internal } = req.body;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    const message = new Message({
      ticketId,
      content,
      internal,
      author: req.user.id
    });

    await message.save();
    await Ticket.findByIdAndUpdate(ticketId, {
      $push: { messages: message._id }
    });

    logger.info(`New message added to ticket ${ticketId}`);
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};

exports.updateMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    const message = await Message.findByIdAndUpdate(
      messageId,
      { content },
      { new: true }
    );

    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    logger.info(`Message ${messageId} updated`);
    res.json({ message });
  } catch (error) {
    next(error);
  }
};