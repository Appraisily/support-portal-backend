require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const logger = require('./utils/logger');
const secretManager = require('./utils/secretManager');
const { initializeDatabase } = require('./config/database');

/*
IMPORTANTE: ¡ORDEN DE INICIALIZACIÓN CRÍTICO!

El orden correcto de inicialización debe ser:

1. Secret Manager
   - Necesario para obtener todas las credenciales
   - Otros servicios dependen de estos secretos
   - Sin esto, nada más puede funcionar correctamente

2. Base de datos (Sequelize)
   - Requiere secretos de DB_* del Secret Manager
   - Necesario antes de que cualquier ruta que use modelos esté activa

3. Servicios externos (Gmail, etc)
   - Requieren credenciales del Secret Manager
   - Dependen de la base de datos para almacenar estado

4. Express y middlewares
   - Algunos middlewares pueden requerir DB o servicios
   - La autenticación necesita secretos JWT

5. Rutas
   - Dependen de todos los servicios anteriores
   - No pueden funcionar sin DB y autenticación

Si este orden no se respeta, obtendremos errores como:
- "url must be string" (DB intentando inicializar sin secretos)
- "jwt secret not found" (auth middleware sin Secret Manager)
- "models is not defined" (rutas intentando usar DB no inicializada)
*/

async function startServer() {
  const startTime = Date.now();
  
  try {
    // 1. Secret Manager primero
    await secretManager.ensureInitialized();
    logger.info('Secrets loaded successfully');

    // 2. Base de datos después
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // 3. Express y middlewares
    const app = express();
    app.set('trust proxy', true);
    app.use(cors());
    app.use(express.json());
    
    // 4. Rutas al final
    app.use('/api', routes);
    
    // Error handler
    app.use((err, req, res, next) => {
      logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path
      });
      
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    });

    // 5. Iniciar servidor
    const port = process.env.PORT || 8080;
    app.listen(port, () => {
      logger.info(`Server started successfully`, {
        port,
        startupTimeMs: Date.now() - startTime
      });
    });

  } catch (error) {
    logger.error('Server initialization failed', {
      error: error.message,
      stack: error.stack,
      startupTimeMs: Date.now() - startTime
    });
    process.exit(1);
  }
}

// Manejar errores no capturados
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

startServer();
