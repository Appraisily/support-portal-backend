module.exports = (sequelize, DataTypes) => {
  const MessageAttachment = sequelize.define('MessageAttachment', {
    messageId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    attachmentId: {
      type: DataTypes.UUID,
      allowNull: false
    }
  });

  return MessageAttachment;
}; 