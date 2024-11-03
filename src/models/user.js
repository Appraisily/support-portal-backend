module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
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
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('admin', 'agent', 'user'),
      defaultValue: 'user'
    },
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        notifications: true,
        theme: 'light'
      }
    }
  }, {
    timestamps: true,
    hooks: {
      beforeSave: async (user) => {
        if (user.changed('password')) {
          const bcrypt = require('bcryptjs');
          user.password = await bcrypt.hash(user.password, 12);
        }
      }
    }
  });

  User.prototype.comparePassword = async function(candidatePassword) {
    const bcrypt = require('bcryptjs');
    return await bcrypt.compare(candidatePassword, this.password);
  };

  User.associate = (models) => {
    User.hasMany(models.Ticket, {
      foreignKey: 'assignedToId',
      as: 'assignedTickets'
    });
  };

  return User;
};