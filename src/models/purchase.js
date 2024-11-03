module.exports = (sequelize, DataTypes) => {
  const Purchase = sequelize.define('Purchase', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    status: {
      type: DataTypes.ENUM('completed', 'pending', 'refunded', 'cancelled'),
      defaultValue: 'pending'
    }
  }, {
    timestamps: true
  });

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
  });

  Purchase.associate = (models) => {
    Purchase.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });
    Purchase.hasMany(PurchaseItem, {
      foreignKey: 'purchaseId',
      as: 'items'
    });
  };

  return { Purchase, PurchaseItem };
};