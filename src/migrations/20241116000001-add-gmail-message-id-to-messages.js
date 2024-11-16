const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('messages', 'gmailMessageId', {
      type: DataTypes.STRING,
      allowNull: true
    });

    // Add index for better performance
    await queryInterface.addIndex('messages', ['gmailMessageId']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('messages', 'gmailMessageId');
  }
};