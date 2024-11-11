const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Message extends Model {
    static associate(models) {
      Message.belongsTo(models.Ticket, {
        foreignKey: 'ticketId',
        as: 'ticket'
      });

      Message.belongsTo(models.Customer, {
        foreignKey: 'customerId',
        as: 'customer'
      });

      Message.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'author',
        allowNull: true
      });

      Message.belongsToMany(models.Attachment, {
        through: 'MessageAttachments',
        foreignKey: 'messageId',
        otherKey: 'attachmentId',
        as: 'attachments'
      });
    }
  }

  Message.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    ticketId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Tickets',
        key: 'id'
      }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    direction: {
      type: DataTypes.ENUM('inbound', 'outbound'),
      allowNull: false
    },
    customerId: {
      type: DataTypes.UUID,
      references: {
        model: 'Customers',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      references: {
        model: 'Users',
        key: 'id'
      },
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Message',
    tableName: 'messages',
    timestamps: true
  });

  return Message;
}