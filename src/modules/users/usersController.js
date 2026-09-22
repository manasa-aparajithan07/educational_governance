'use strict';

const UsersService = require('./usersService');
const { sendSuccess, sendPaginated } = require('../../utils/apiResponse');

class UsersController {
  /**
   * GET /api/v1/users
   */
  static async list(req, res, next) {
    try {
      const { page, limit, role, department, accountStatus, search } = req.query;
      const result = await UsersService.listUsers({
        page,
        limit,
        role,
        department,
        accountStatus,
        search,
      });

      return sendPaginated(res, {
        message: 'Users retrieved successfully',
        items: result.items,
        page: result.page,
        limit: result.limit,
        totalItems: result.totalItems,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/users
   */
  static async create(req, res, next) {
    try {
      const {
        fullName,
        email,
        password,
        role,
        studentId,
        facultyId,
        department,
        departmentId,
        accountStatus,
      } = req.body;

      const newUser = await UsersService.createUser({
        fullName,
        email,
        password,
        role,
        studentId,
        facultyId,
        department,
        departmentId,
        accountStatus,
        performedBy: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, {
        message: 'User created successfully',
        data: { user: newUser },
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/users/:id
   */
  static async getById(req, res, next) {
    try {
      const user = await UsersService.getUserById(req.params.id, req.user);
      return sendSuccess(res, {
        message: 'User retrieved successfully',
        data: { user },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/users/:id
   */
  static async update(req, res, next) {
    try {
      const updatedUser = await UsersService.updateUser(req.params.id, {
        ...req.body,
        performedBy: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, {
        message: 'User updated successfully',
        data: { user: updatedUser },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/users/:id
   */
  static async delete(req, res, next) {
    try {
      const result = await UsersService.deleteUser(req.params.id, {
        performedBy: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, {
        message: result.message,
        data: {},
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UsersController;
