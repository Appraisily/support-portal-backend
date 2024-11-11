const Ticket = require('../models/ticket');
const logger = require('../utils/logger');

exports.getTicketAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [
      totalTickets,
      resolvedTickets,
      ticketsByStatus,
      ticketsByPriority,
      responseTimeData
    ] = await Promise.all([
      Ticket.countDocuments(query),
      Ticket.countDocuments({ ...query, status: 'solved' }),
      Ticket.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Ticket.aggregate([
        { $match: query },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      Ticket.aggregate([
        { $match: query },
        { $project: {
          responseTime: {
            $subtract: [
              { $arrayElemAt: ['$messages.createdAt', 1] },
              '$createdAt'
            ]
          }
        }},
        { $group: {
          _id: null,
          averageResponseTime: { $avg: '$responseTime' }
        }}
      ])
    ]);

    const statusCounts = ticketsByStatus.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, { open: 0, pending: 0, solved: 0 });

    const priorityCounts = ticketsByPriority.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, { low: 0, medium: 0, high: 0, urgent: 0 });

    res.json({
      totalTickets,
      resolvedTickets,
      averageResponseTime: responseTimeData[0]?.averageResponseTime || 0,
      ticketsByStatus: statusCounts,
      ticketsByPriority: priorityCounts
    });
  } catch (error) {
    next(error);
  }
};