'use strict';

const bcrypt = require('bcryptjs');
const config = require('../../config/env');
const { User, Department, sequelize } = require('../../database/models');
const TokenService = require('../../services/tokenService');
const AuditService = require('../../services/auditService');
const {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../utils/errors');
const { ROLES, ACCOUNT_STATUS } = require('../../utils/constants');

class AuthService {
  /**
   * Registers a new student account
   */
  static async register({
    fullName,
    email,
    password,
    role = ROLES.STUDENT,
    studentId = null,
    department = null,
    departmentId = null,
    ipAddress = null,
    userAgent = null,
  }) {
    if (role && role !== ROLES.STUDENT) {
      throw new ForbiddenError(
        'Public registration is only permitted for STUDENT accounts. Administrative and faculty accounts must be created by an administrator.',
        'REGISTRATION_ROLE_NOT_PERMITTED'
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check duplicate email
    const existingEmail = await User.findOne({
      where: { email: normalizedEmail },
    });
    if (existingEmail) {
      throw new ConflictError('An account with this email address already exists.', 'EMAIL_EXISTS');
    }

    // Check duplicate studentId if provided
    if (studentId) {
      const existingStudent = await User.findOne({
        where: { studentId: studentId.trim() },
      });
      if (existingStudent) {
        throw new ConflictError('An account with this student ID already exists.', 'STUDENT_ID_EXISTS');
      }
    }

    // Verify departmentId if provided
    let verifiedDepartmentId = null;
    let verifiedDepartmentName = department ? department.trim() : null;
    if (departmentId) {
      const dept = await Department.findByPk(departmentId);
      if (dept) {
        verifiedDepartmentId = dept.id;
        verifiedDepartmentName = dept.name;
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, config.jwt.bcryptSaltRounds);

    // Create user and initial tokens atomically in a database transaction
    const { user, tokens } = await sequelize.transaction(async (t) => {
      const newUser = await User.create(
        {
          fullName: fullName.trim(),
          email: normalizedEmail,
          passwordHash,
          role: ROLES.STUDENT,
          studentId: studentId ? studentId.trim() : null,
          facultyId: null,
          department: verifiedDepartmentName,
          departmentId: verifiedDepartmentId,
          accountStatus: ACCOUNT_STATUS.ACTIVE,
        },
        { transaction: t }
      );

      const newTokens = await TokenService.generateTokens(newUser, { transaction: t });

      return { user: newUser, tokens: newTokens };
    });

    // Audit log
    await AuditService.logEvent({
      entityType: 'User',
      entityId: user.id,
      eventType: 'USER_REGISTER',
      performedBy: user.id,
      performedByRole: user.role,
      description: `New student registration: ${user.email} (${user.studentId || 'No ID'})`,
      recordData: { id: user.id, email: user.email, role: user.role },
      ipAddress,
      userAgent,
    });

    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  /**
   * Authenticates user and issues access & refresh tokens
   */
  static async login({ email, password, ipAddress = null, userAgent = null }) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      where: { email: normalizedEmail },
      include: [{ model: Department, as: 'departmentRef', attributes: ['id', 'name', 'code'] }],
    });

    if (!user) {
      // Do not reveal whether email exists
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Verify password hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await AuditService.logEvent({
        entityType: 'User',
        entityId: user.id,
        eventType: 'LOGIN_FAILED',
        performedBy: user.id,
        performedByRole: user.role,
        description: `Failed login attempt for email: ${normalizedEmail}`,
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Check account status
    if (user.accountStatus !== ACCOUNT_STATUS.ACTIVE) {
      await AuditService.logEvent({
        entityType: 'User',
        entityId: user.id,
        eventType: 'LOGIN_BLOCKED',
        performedBy: user.id,
        performedByRole: user.role,
        description: `Blocked login attempt for inactive account: ${normalizedEmail} (Status: ${user.accountStatus})`,
        ipAddress,
        userAgent,
      });
      throw new ForbiddenError(
        'Your account is currently inactive or suspended. Please contact the administrator.',
        'ACCOUNT_INACTIVE'
      );
    }

    // Issue token pair
    const tokens = await TokenService.generateTokens(user);

    // Audit log
    await AuditService.logEvent({
      entityType: 'User',
      entityId: user.id,
      eventType: 'USER_LOGIN',
      performedBy: user.id,
      performedByRole: user.role,
      description: `User authenticated successfully: ${user.email} (${user.role})`,
      ipAddress,
      userAgent,
    });

    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }

  /**
   * Logs out user by revoking refresh token
   */
  static async logout({ userId = null, refreshToken = null, ipAddress = null, userAgent = null }) {
    if (!userId && !refreshToken) {
      throw new ValidationError('A valid session authorization or refresh token is required to log out');
    }

    let targetUserId = userId;

    if (refreshToken) {
      await TokenService.revokeRefreshToken(refreshToken);
      if (!targetUserId) {
        try {
          const decoded = TokenService.verifyRefreshTokenSignature(refreshToken);
          targetUserId = decoded.sub;
        } catch (_) {
          // If signature is expired or malformed, continue
        }
      }
    } else if (targetUserId) {
      // If no specific refresh token provided, revoke all active sessions for this user
      await TokenService.revokeAllUserTokens(targetUserId);
    }

    if (targetUserId) {
      await AuditService.logEvent({
        entityType: 'User',
        entityId: targetUserId,
        eventType: 'USER_LOGOUT',
        performedBy: targetUserId,
        description: 'User logged out and session refresh token revoked',
        ipAddress,
        userAgent,
      });
    }

    return { message: 'Logged out successfully' };
  }

  /**
   * Rotates refresh token and issues fresh token pair
   */
  static async refresh({ refreshToken, ipAddress = null, userAgent = null }) {
    const result = await TokenService.rotateRefreshToken(refreshToken);

    await AuditService.logEvent({
      entityType: 'User',
      entityId: result.user.id,
      eventType: 'TOKEN_REFRESH',
      performedBy: result.user.id,
      performedByRole: result.user.role,
      description: 'Session access token refreshed',
      ipAddress,
      userAgent,
    });

    return {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    };
  }

  /**
   * Retrieves profile for currently authenticated user
   */
  static async getMe(userId) {
    const user = await User.findByPk(userId, {
      include: [{ model: Department, as: 'departmentRef', attributes: ['id', 'name', 'code'] }],
    });

    if (!user) {
      throw new NotFoundError('User profile not found', 'USER_NOT_FOUND');
    }

    return user;
  }

  /**
   * Updates profile fields for currently authenticated user
   */
  static async updateMe({ userId, fullName, department, ipAddress = null, userAgent = null }) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    if (fullName !== undefined) {
      user.fullName = fullName.trim();
    }

    if (department !== undefined) {
      user.department = department.trim();
    }

    await user.save();

    await AuditService.logEvent({
      entityType: 'User',
      entityId: user.id,
      eventType: 'USER_PROFILE_UPDATED',
      performedBy: user.id,
      performedByRole: user.role,
      description: `User updated personal profile details`,
      ipAddress,
      userAgent,
    });

    return user;
  }

  /**
   * Changes authenticated user password and invalidates active refresh tokens
   */
  static async changePassword({
    userId,
    currentPassword,
    newPassword,
    ipAddress = null,
    userAgent = null,
  }) {
    if (currentPassword === newPassword) {
      throw new ValidationError('New password must be different from current password', [
        { field: 'newPassword', message: 'New password cannot be the same as current password' },
      ]);
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      await AuditService.logEvent({
        entityType: 'User',
        entityId: user.id,
        eventType: 'PASSWORD_CHANGE_FAILED',
        performedBy: user.id,
        performedByRole: user.role,
        description: 'Failed password change attempt: invalid current password',
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedError('Current password does not match records', 'INVALID_CURRENT_PASSWORD');
    }

    const newHash = await bcrypt.hash(newPassword, config.jwt.bcryptSaltRounds);

    await sequelize.transaction(async (t) => {
      user.passwordHash = newHash;
      await user.save({ transaction: t });

      // Invalidate all active refresh tokens for this user atomically
      await TokenService.revokeAllUserTokens(userId, { transaction: t });
    });

    await AuditService.logEvent({
      entityType: 'User',
      entityId: user.id,
      eventType: 'PASSWORD_CHANGE',
      performedBy: user.id,
      performedByRole: user.role,
      description: 'User changed account password. All active sessions invalidated.',
      ipAddress,
      userAgent,
    });

    return {
      message: 'Password changed successfully. All other active sessions have been invalidated.',
    };
  }
}

module.exports = AuthService;
