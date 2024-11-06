const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const gmailRoutes = require('./routes/gmailRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const appState = require('./utils/singleton');

const app = express();

// Configuraciones básicas
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Middleware para asegurar que la aplicación está inicializada
app.use(async (req, res, next) => {
  try {
    if (!appState.initialized) {
      await appState.initialize();
    }
    next();
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Rutas
app.use('/api', routes);
app.use('/api/gmail', gmailRoutes);

// Manejador de errores
app.use(errorHandler);

module.exports = app;