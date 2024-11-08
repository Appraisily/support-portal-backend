module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('admin', 'agent'),
      defaultValue: 'agent'
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    timestamps: true
  });

  User.associate = function(models) {
    User.hasMany(models.Ticket, {
      foreignKey: 'assignedToId',
      as: 'assignedTickets'
    });
    
    User.hasMany(models.Message, {
      foreignKey: 'userId',
      as: 'messages'
    });
  };

  return User;
};