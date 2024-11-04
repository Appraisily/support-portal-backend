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

// Añadir registros de depuración para verificar variables de entorno
console.log('Variables de entorno antes de cargar secretos:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID
});

// Load secrets and start server
async function startServer() {
  try {
    // Cargar secretos desde Secret Manager en producción
    if (process.env.NODE_ENV === 'production') {
      await secretManager.loadSecrets();
      console.log('Variables de entorno después de cargar secretos:', {
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        CLOUD_SQL_CONNECTION_NAME: process.env.CLOUD_SQL_CONNECTION_NAME,
        GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
        GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
        GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
        STORAGE_BUCKET: process.env.STORAGE_BUCKET,
        SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
        SENDGRID_EMAIL: process.env.SENDGRID_EMAIL,
        STRIPE_SECRET_KEY_LIVE: process.env.STRIPE_SECRET_KEY_LIVE,
        STRIPE_WEBHOOK_SECRET_LIVE: process.env.STRIPE_WEBHOOK_SECRET_LIVE,
        JWT_SECRET: process.env.JWT_SECRET
      });
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
