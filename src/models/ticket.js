module.exports = (sequelize, DataTypes) => {
  const Ticket = sequelize.define('Ticket', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('open', 'solved', 'pending'),
      defaultValue: 'open'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium'
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false
    },
    gmailThreadId: {
      type: DataTypes.STRING
    }
  }, {
    timestamps: true
  });

  Ticket.associate = (models) => {
    Ticket.belongsTo(models.User, {
      foreignKey: 'assignedToId',
      as: 'assignedTo'
    });
    Ticket.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });
    Ticket.hasMany(models.Message, {
      foreignKey: 'ticketId',
      as: 'messages'
    });
    Ticket.hasMany(models.Attachment, {
      foreignKey: 'ticketId',
      as: 'attachments'
    });
  };

  return Ticket;
};