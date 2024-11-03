module.exports = (sequelize, DataTypes) => {
  const PredefinedReply = sequelize.define('PredefinedReply', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    category: {
      type: DataTypes.ENUM('general', 'technical', 'billing', 'feature', 'bug'),
      allowNull: false
    }
  }, {
    timestamps: true
  });

  return PredefinedReply;
};