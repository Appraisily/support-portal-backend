require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');
const { initializeModels } = require('./models');
const routes = require('./routes');

async function startServer() {
  try {
    // 1. Inicializar modelos
    logger.info('Initializing database models...');
    await initializeModels();
    
    // 2. Configurar Express
    const app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    
    // 3. Configurar rutas
    app.use('/api', routes);
    
    // 4. Iniciar servidor
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
