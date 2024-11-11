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
        model: 'Messages',
        key: 'id'
      },
      primaryKey: true
    },
    attachmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Attachments',
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