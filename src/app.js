const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const app = express();

// Configurar trust proxy para Cloud Run
app.set('trust proxy', true);

// Configurar rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 peticiones por ventana
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded:', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      error: 'Too many requests, please try again later.'
    });
  }
});

// Aplicar el rate limiter a todas las rutas
app.use(limiter);

// Resto de la configuración...
app.use(cors());
app.use(express.json());

// ... resto del código ... 