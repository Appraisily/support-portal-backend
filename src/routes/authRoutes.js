const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateAuth } = require('../middleware/auth');

// Validación básica para login
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }
  next();
};

// Rutas de autenticación
router.post('/login', validateLogin, authController.login);
router.post('/logout', validateAuth, authController.logout);

module.exports = router;