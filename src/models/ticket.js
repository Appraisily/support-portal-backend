module.exports = (sequelize, DataTypes) => {
  const Ticket = sequelize.define('Ticket', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [3, 255]
      }
    },
    status: {
      type: DataTypes.ENUM('open', 'in_progress', 'closed'),
      defaultValue: 'open',
      validate: {
        isIn: [['open', 'in_progress', 'closed']]
      }
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium',
      validate: {
        isIn: [['low', 'medium', 'high', 'urgent']]
      }
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'customers',
        key: 'id'
      }
    },
    assignedToId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    gmailThreadId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    gmailMessageId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
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
        fields: ['gmailThreadId'],
        unique: true
      },
      {
        fields: ['gmailMessageId'],
        unique: true
      },
      {
        fields: ['customerId']
      },
      {
        fields: ['assignedToId']
      },
      {
        fields: ['status']
      }
    ]
  });

  Ticket.associate = function(models) {
    if (!models.Customer || !models.User || !models.Message) {
      throw new Error('Required models not loaded for Ticket associations');
    }

    Ticket.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer',
      onDelete: 'RESTRICT'
    });

    Ticket.belongsTo(models.User, {
      foreignKey: 'assignedToId',
      as: 'assignedTo',
      onDelete: 'SET NULL'
    });

    Ticket.hasMany(models.Message, {
      foreignKey: 'ticketId',
      as: 'messages'
    });
  };

  return Ticket;
};