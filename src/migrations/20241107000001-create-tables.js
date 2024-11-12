const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
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
      }, { transaction });

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
      }, { transaction });

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
      }, { transaction });

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
      }, { transaction });

      // Create attachments table
      await queryInterface.createTable('attachments', {
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
        url: {
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
          onDelete: 'CASCADE'
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      // Create message_attachments join table
      await queryInterface.createTable('message_attachments', {
        messageId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'messages',
            key: 'id'
          },
          onDelete: 'CASCADE',
          primaryKey: true
        },
        attachmentId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'attachments',
            key: 'id'
          },
          onDelete: 'CASCADE',
          primaryKey: true
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      // Add indexes for better performance
      await queryInterface.addIndex('tickets', ['status'], { transaction });
      await queryInterface.addIndex('tickets', ['customerId'], { transaction });
      await queryInterface.addIndex('tickets', ['assignedToId'], { transaction });
      await queryInterface.addIndex('messages', ['ticketId'], { transaction });
      await queryInterface.addIndex('messages', ['customerId'], { transaction });
      await queryInterface.addIndex('messages', ['userId'], { transaction });
      await queryInterface.addIndex('attachments', ['customerId'], { transaction });
      await queryInterface.addIndex('message_attachments', ['messageId'], { transaction });
      await queryInterface.addIndex('message_attachments', ['attachmentId'], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.dropTable('message_attachments', { transaction });
      await queryInterface.dropTable('attachments', { transaction });
      await queryInterface.dropTable('messages', { transaction });
      await queryInterface.dropTable('tickets', { transaction });
      await queryInterface.dropTable('users', { transaction });
      await queryInterface.dropTable('customers', { transaction });
      
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};