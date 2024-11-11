module.exports = (sequelize, DataTypes) => {
  const Attachment = sequelize.define('Attachment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    timestamps: true
  });

  Attachment.associate = (models) => {
    Attachment.belongsTo(models.Ticket, {
      foreignKey: 'ticketId',
      as: 'ticket'
    });
    Attachment.belongsTo(models.Message, {
      foreignKey: 'messageId',
      as: 'message'
    });
  };

  return Attachment;
};