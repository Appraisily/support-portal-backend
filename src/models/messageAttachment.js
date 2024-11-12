const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MessageAttachment extends Model {
    static associate(models) {
      // No additional associations needed for join table
    }
  }

  MessageAttachment.init({
    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'messages',
        key: 'id'
      },
      primaryKey: true
    },
    attachmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'attachments',
        key: 'id'
      },
      primaryKey: true
    }
  }, {
    sequelize,
    modelName: 'MessageAttachment',
    tableName: 'message_attachments',
    timestamps: true
  });

  return MessageAttachment;
}