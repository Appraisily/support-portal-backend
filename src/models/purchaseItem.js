// src/models/purchaseItem.js
module.exports = (sequelize, DataTypes) => {
  const PurchaseItem = sequelize.define('PurchaseItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    }
  }, {
    timestamps: true
  });

  PurchaseItem.associate = (models) => {
    PurchaseItem.belongsTo(models.Purchase, {
      foreignKey: 'purchaseId',
      as: 'purchase'
    });
  };

  return PurchaseItem;
};
