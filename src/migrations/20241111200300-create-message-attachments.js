const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // First create the attachments table
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

      // Then create the message_attachments join table
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

      // Add indexes for better query performance
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
      // Drop tables in reverse order
      await queryInterface.dropTable('message_attachments', { transaction });
      await queryInterface.dropTable('attachments', { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};