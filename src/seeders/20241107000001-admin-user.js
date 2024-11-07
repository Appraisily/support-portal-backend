const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await queryInterface.bulkInsert('users', [{
      id: '00000000-0000-0000-0000-000000000000',
      email: 'admin@appraisily.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', {
      email: 'admin@appraisily.com'
    });
  }
};