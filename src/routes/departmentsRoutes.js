'use strict';

const express = require('express');
const router = express.Router();
const { Department } = require('../database/models');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { ROLES } = require('../utils/constants');
const { sendSuccess } = require('../utils/apiResponse');
const { ConflictError, ValidationError } = require('../utils/errors');

/**
 * GET /api/v1/departments
 * List all departments
 */
router.get('/', async (req, res, next) => {
  try {
    const departments = await Department.findAll({
      order: [['name', 'ASC']],
    });
    return sendSuccess(res, {
      message: 'Departments retrieved successfully',
      data: { departments },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/departments
 * Create a new department (Admin only)
 */
router.post('/', authMiddleware, roleMiddleware(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) {
      throw new ValidationError('Department name and code are required', [
        { field: 'name', message: 'Name is required' },
        { field: 'code', message: 'Code is required' },
      ]);
    }

    const existing = await Department.findOne({
      where: { code: code.toUpperCase().trim() },
    });
    if (existing) {
      throw new ConflictError(`Department with code '${code}' already exists`);
    }

    const department = await Department.create({
      name: name.trim(),
      code: code.toUpperCase().trim(),
    });

    return sendSuccess(res, {
      message: 'Department created successfully',
      data: { department },
      statusCode: 201,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
