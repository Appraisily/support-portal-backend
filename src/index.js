require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const logger = require('./utils/logger');
const secretManager = require('./utils/secretManager');

const app = express();

// Seguridad middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Health check endpoint for Cloud Run
app.get('/_health', (req, res) => {
  res.status(200).send('OK');
});

// Añadir registros de depuración para `connectDB`
console.log('Tipo de connectDB:', typeof connectDB);
console.log('connectDB:', connectDB);

// Load secrets and start server
async function startServer() {
  try {
    // Cargar secretos desde Secret Manager en producción
    if (process.env.NODE_ENV === 'production') {
      await secretManager.loadSecrets();
    }

    // Conectar a la base de datos
    await connectDB();

    // Rutas
    app.use('/api', routes);

    // Manejo de errores
    app.use(errorHandler);

    // Iniciar servidor
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
