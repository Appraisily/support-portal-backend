module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    direction: {
      type: DataTypes.ENUM('inbound', 'outbound'),
      allowNull: false
    },
    internal: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    timestamps: true
  });

  Message.associate = (models) => {
    Message.belongsTo(models.Ticket, {
      foreignKey: 'ticketId',
      as: 'ticket'
    });
    Message.belongsTo(models.User, {
      foreignKey: 'authorId',
      as: 'author'
    });
    Message.hasMany(models.Attachment, {
      foreignKey: 'messageId',
      as: 'attachments'
    });
  };

  return Message;
};