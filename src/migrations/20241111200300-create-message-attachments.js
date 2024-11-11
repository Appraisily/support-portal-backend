const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Check if tables already exist
      const tables = await queryInterface.showAllTables();
      
      // Create attachments table if it doesn't exist
      if (!tables.includes('attachments')) {
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
      }

      // Create message_attachments table if it doesn't exist
      if (!tables.includes('message_attachments')) {
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
      }

      // Add indexes if they don't exist
      const indexes = await queryInterface.showIndex('attachments');
      const indexNames = indexes.map(idx => idx.name);

      if (!indexNames.includes('attachments_customer_id')) {
        await queryInterface.addIndex('attachments', ['customerId'], {
          name: 'attachments_customer_id',
          transaction
        });
      }

      const messageIndexes = await queryInterface.showIndex('message_attachments');
      const messageIndexNames = messageIndexes.map(idx => idx.name);

      if (!messageIndexNames.includes('message_attachments_message_id')) {
        await queryInterface.addIndex('message_attachments', ['messageId'], {
          name: 'message_attachments_message_id',
          transaction
        });
      }

      if (!messageIndexNames.includes('message_attachments_attachment_id')) {
        await queryInterface.addIndex('message_attachments', ['attachmentId'], {
          name: 'message_attachments_attachment_id',
          transaction
        });
      }

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