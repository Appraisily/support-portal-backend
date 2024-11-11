const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Ticket extends Model {
    static associate(models) {
      Ticket.belongsTo(models.Customer, {
        foreignKey: 'customerId',
        as: 'customer'
      });

      Ticket.hasMany(models.Message, {
        foreignKey: 'ticketId',
        as: 'messages'
      });

      Ticket.belongsTo(models.User, {
        foreignKey: 'assignedToId',
        as: 'assignedTo'
      });
    }
  }

  Ticket.init({
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
      allowNull: false
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
      references: {
        model: 'users',
        key: 'id'
      }
    },
    gmailThreadId: {
      type: DataTypes.STRING,
      unique: true
    },
    gmailMessageId: {
      type: DataTypes.STRING,
      unique: true
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'Ticket',
    tableName: 'tickets',
    timestamps: true,
    indexes: [
      {
        fields: ['status']
      },
      {
        fields: ['gmailThreadId']
      },
      {
        fields: ['gmailMessageId']
      }
    ]
  });

  return Ticket;
};