module.exports = (sequelize, DataTypes) => {
  const Attachment = sequelize.define('Attachment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    gmailAttachmentId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false
    }
  });

  Attachment.associate = function(models) {
    Attachment.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });
    Attachment.belongsToMany(models.Message, {
      through: 'MessageAttachment',
      as: 'messages'
    });
  };

  return Attachment;
};