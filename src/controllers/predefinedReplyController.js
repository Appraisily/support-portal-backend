const PredefinedReply = require('../models/predefinedReply');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.listReplies = async (req, res, next) => {
  try {
    const { category } = req.query;
    const query = category ? { category } : {};

    const predefinedReplies = await PredefinedReply.find(query)
      .sort({ title: 1 });

    res.json({
      replies: predefinedReplies.map(reply => ({
        id: reply._id,
        title: reply.title,
        content: reply.content,
        category: reply.category
      }))
    });
  } catch (error) {
    next(error);
  }
};

exports.createReply = async (req, res, next) => {
  try {
    const reply = new PredefinedReply(req.body);
    await reply.save();

    logger.info(`New predefined reply created: ${reply.title}`);
    res.status(201).json({
      reply: {
        id: reply._id,
        title: reply.title,
        content: reply.content,
        category: reply.category
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateReply = async (req, res, next) => {
  try {
    const reply = await PredefinedReply.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!reply) {
      throw new ApiError(404, 'Predefined reply not found');
    }

    logger.info(`Predefined reply updated: ${reply.title}`);
    res.json({
      reply: {
        id: reply._id,
        title: reply.title,
        content: reply.content,
        category: reply.category
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteReply = async (req, res, next) => {
  try {
    const reply = await PredefinedReply.findByIdAndDelete(req.params.id);

    if (!reply) {
      throw new ApiError(404, 'Predefined reply not found');
    }

    logger.info(`Predefined reply deleted: ${reply.title}`);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};