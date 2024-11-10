const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

let sequelize = null;
const models = {};

const initialize = async (sequelizeInstance) => {
  if (!sequelizeInstance) {
    throw new Error('Sequelize instance required for models initialization');
  }

  sequelize = sequelizeInstance;

  // Import all model files
  fs.readdirSync(__dirname)
    .filter(file => 
      file.indexOf('.') !== 0 && 
      file !== 'index.js' && 
      file.slice(-3) === '.js'
    )
    .forEach(file => {
      const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
      models[model.name] = model;
    });

  // Set up associations
  Object.keys(models).forEach(modelName => {
    if (models[modelName].associate) {
      models[modelName].associate(models);
    }
  });

  logger.info('Models initialized successfully');
  return models;
};

module.exports = {
  initialize,
  getModels: () => {
    if (!sequelize) {
      throw new Error('Models not initialized. Call initialize() first.');
    }
    return models;
  },
  getSequelize: () => sequelize
};