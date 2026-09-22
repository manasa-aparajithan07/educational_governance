'use strict';

const express = require('express');
const router = express.Router();
const UsersController = require('./usersController');
const authMiddleware = require('../../middleware/authMiddleware');
const roleMiddleware = require('../../middleware/roleMiddleware');
const validationMiddleware = require('../../middleware/validationMiddleware');
const { ROLES } = require('../../utils/constants');
const { validateCreateUser, validateUpdateUser } = require('./usersValidators');

// All user management routes require authentication
router.use(authMiddleware);

// Admin-only user listing and creation
router.get('/', roleMiddleware(ROLES.ADMIN), UsersController.list);
router.post('/', roleMiddleware(ROLES.ADMIN), validationMiddleware(validateCreateUser), UsersController.create);

// Individual user retrieval (Admin or self)
router.get('/:id', UsersController.getById);

// Admin-only update and deletion
router.put('/:id', roleMiddleware(ROLES.ADMIN), validationMiddleware(validateUpdateUser), UsersController.update);
router.delete('/:id', roleMiddleware(ROLES.ADMIN), UsersController.delete);

module.exports = router;
