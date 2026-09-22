'use strict';

const express = require('express');
const router = express.Router();
const AuthController = require('./authController');
const authMiddleware = require('../../middleware/authMiddleware');
const validationMiddleware = require('../../middleware/validationMiddleware');
const { authRateLimiter } = require('../../middleware/rateLimitMiddleware');
const {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateRefreshToken,
  validateUpdateProfile,
} = require('./authValidators');

/**
 * Public Authentication Routes
 */
router.post('/register', authRateLimiter, validationMiddleware(validateRegister), AuthController.register);
router.post('/login', authRateLimiter, validationMiddleware(validateLogin), AuthController.login);
router.post('/refresh', authRateLimiter, validationMiddleware(validateRefreshToken), AuthController.refreshToken);
router.post('/logout', (req, res, next) => {
  // Try to authenticate if header provided, but allow unauthenticated logout if refresh token provided
  if (req.headers.authorization) {
    return authMiddleware(req, res, (err) => {
      // If access token is expired or invalid but refresh token is provided in body, allow logout
      if (err && req.body && req.body.refreshToken) {
        return next();
      }
      if (err) return next(err);
      next();
    });
  }
  next();
}, AuthController.logout);

/**
 * Protected Authentication Routes
 */
router.get('/me', authMiddleware, AuthController.getMe);
router.put('/me', authMiddleware, validationMiddleware(validateUpdateProfile), AuthController.updateMe);
router.post('/change-password', authMiddleware, authRateLimiter, validationMiddleware(validateChangePassword), AuthController.changePassword);

module.exports = router;
