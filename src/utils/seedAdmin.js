const { models } = require('../config/database');
const logger = require('./logger');

async function seedAdminUser() {
  try {
    // Verificar si el admin ya existe
    const existingAdmin = await models.User.findOne({
      where: { email: 'admin@appraisily.com' }
    });

    if (existingAdmin) {
      logger.info('Admin user already exists');
      return;
    }

    // Crear admin si no existe
    const adminUser = await models.User.create({
      name: 'Admin User',
      email: 'admin@appraisily.com',
      password: 'admin123', // Se hasheará automáticamente
      role: 'admin',
      preferences: {
        notifications: true,
        theme: 'light'
      }
    });

    logger.info('Admin user created successfully:', {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role
    });

  } catch (error) {
    logger.error('Error creating admin user:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = { seedAdminUser }; 