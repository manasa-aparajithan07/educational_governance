'use strict';

const usersRoutes = require('./usersRoutes');
const UsersController = require('./usersController');
const UsersService = require('./usersService');
const usersValidators = require('./usersValidators');

module.exports = {
  routes: usersRoutes,
  controller: UsersController,
  service: UsersService,
  validators: usersValidators,
};
