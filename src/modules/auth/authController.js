'use strict';

const AuthService = require('./authService');
const { sendSuccess } = require('../../utils/apiResponse');

class AuthController {
  /**
   * POST /api/v1/auth/register
   */
  static async register(req, res, next) {
    try {
      const { fullName, email, password, studentId, department, departmentId } = req.body;
      const result = await AuthService.register({
        fullName,
        email,
        password,
        studentId,
        department,
        departmentId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, {
        message: 'Student registration completed successfully',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
        },
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/login
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login({
        email,
        password,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, {
        message: 'Authentication successful',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
        },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/me
   */
  static async getMe(req, res, next) {
    try {
      const user = await AuthService.getMe(req.user.id);
      return sendSuccess(res, {
        message: 'Profile retrieved successfully',
        data: { user },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/auth/me
   */
  static async updateMe(req, res, next) {
    try {
      const { fullName, department } = req.body;
      const updatedUser = await AuthService.updateMe({
        userId: req.user.id,
        fullName,
        department,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, {
        message: 'Profile updated successfully',
        data: { user: updatedUser },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   */
  static async logout(req, res, next) {
    try {
      const refreshToken = req.body ? req.body.refreshToken : null;
      const userId = req.user ? req.user.id : null;

      await AuthService.logout({
        userId,
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, {
        message: 'Logged out successfully',
        data: {},
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   */
  static async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await AuthService.refresh({
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(res, {
        message: 'Tokens refreshed successfully',
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn,
        },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/change-password
   */
  static async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      const result = await AuthService.changePassword({
        userId: req.user.id,
        currentPassword,
        newPassword,
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

module.exports = AuthController;
