module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('message_attachments', {
      messageId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'messages',
          key: 'id'
        },
        primaryKey: true
      },
      attachmentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'attachments',
          key: 'id'
        },
        primaryKey: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('message_attachments', ['messageId']);
    await queryInterface.addIndex('message_attachments', ['attachmentId']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('message_attachments');
  }
};