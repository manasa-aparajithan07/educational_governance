'use strict';

const authRoutes = require('./authRoutes');
const AuthController = require('./authController');
const AuthService = require('./authService');
const authValidators = require('./authValidators');

module.exports = {
  routes: authRoutes,
  controller: AuthController,
  service: AuthService,
  validators: authValidators,
};
