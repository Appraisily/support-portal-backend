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
      type: DataTypes.ENUM('open', 'in_progress', 'closed'),
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
    customerId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    assignedToId: {
      type: DataTypes.UUID,
      allowNull: true
    },
    gmailThreadId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    gmailMessageId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: true,
    indexes: [
      {
        fields: ['gmailThreadId']
      },
      {
        fields: ['gmailMessageId']
      }
    ]
  });

  Ticket.associate = function(models) {
    // Asegurarse de que los modelos existen antes de crear las asociaciones
    if (!models.Customer || !models.User || !models.Message) {
      throw new Error('Required models not loaded for Ticket associations');
    }

    // Asociaciones
    Ticket.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });

    Ticket.belongsTo(models.User, {
      foreignKey: 'assignedToId',
      as: 'assignedTo'
    });

    Ticket.hasMany(models.Message, {
      foreignKey: 'ticketId',
      as: 'messages'
    });
  };

  return Ticket;
};