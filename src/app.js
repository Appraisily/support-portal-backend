const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const gmailRoutes = require('./routes/gmailRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// Configuraciones básicas
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api', routes);
app.use('/api/gmail', gmailRoutes);

// Manejador de errores
app.use(errorHandler);

// Inicializar Gmail Service
const GmailService = require('./services/GmailService');
if (process.env.NODE_ENV === 'production') {
  GmailService.setupGmail()
    .then(() => GmailService.setupGmailWatch())
    .then(() => {
      logger.info('Gmail watch setup completed');
    })
    .catch(error => {
      logger.error('Failed to setup Gmail watch:', error);
    });
}

module.exports = app;