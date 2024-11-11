module.exports = (sequelize, DataTypes) => {
  const Customer = sequelize.define('Customer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    avatar: {
      type: DataTypes.STRING
    },
    totalPurchases: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    lifetimeValue: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    }
  }, {
    timestamps: true
  });

  Customer.associate = (models) => {
    Customer.hasMany(models.Ticket, {
      foreignKey: 'customerId',
      as: 'tickets'
    });
    Customer.hasMany(models.Purchase, {
      foreignKey: 'customerId',
      as: 'purchases'
    });
  };

  return Customer;
};