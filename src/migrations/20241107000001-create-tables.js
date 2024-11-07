const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create customers table
    await queryInterface.createTable('customers', {
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
        unique: true
      },
      avatar: {
        type: DataTypes.STRING
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    // Create users table
    await queryInterface.createTable('users', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
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
        type: DataTypes.STRING
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    // Create tickets table
    await queryInterface.createTable('tickets', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      subject: {
        type: DataTypes.STRING,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('open', 'in_progress', 'closed'),
        defaultValue: 'open'
      },
      priority: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
        defaultValue: 'medium'
      },
      category: {
        type: DataTypes.STRING,
        allowNull: false
      },
      customerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id'
        },
        onDelete: 'RESTRICT'
      },
      assignedToId: {
        type: DataTypes.UUID,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      gmailThreadId: {
        type: DataTypes.STRING,
        unique: true
      },
      gmailMessageId: {
        type: DataTypes.STRING,
        unique: true
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    // Create messages table
    await queryInterface.createTable('messages', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      ticketId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'tickets',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      direction: {
        type: DataTypes.ENUM('inbound', 'outbound'),
        allowNull: false
      },
      customerId: {
        type: DataTypes.UUID,
        references: {
          model: 'customers',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      userId: {
        type: DataTypes.UUID,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('messages');
    await queryInterface.dropTable('tickets');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('customers');
  }
};