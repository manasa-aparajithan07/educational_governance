'use strict';

const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const config = require('../../config/env');
const { User, Department, sequelize } = require('../../database/models');
const TokenService = require('../../services/tokenService');
const AuditService = require('../../services/auditService');
const {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  AppError,
} = require('../../utils/errors');
const { ROLES, ACCOUNT_STATUS } = require('../../utils/constants');

class UsersService {
  /**
   * List users with pagination, role, status, department filters, and search
   */
  static async listUsers({
    page = 1,
    limit = 10,
    role = null,
    department = null,
    accountStatus = null,
    search = null,
  }) {
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const where = {};

    if (role) {
      where.role = role;
    }
    if (department) {
      where.department = department;
    }
    if (accountStatus) {
      where.accountStatus = accountStatus;
    }
    if (search) {
      const searchPattern = `%${search.trim()}%`;
      where[Op.or] = [
        { fullName: { [Op.like]: searchPattern } },
        { email: { [Op.like]: searchPattern } },
        { studentId: { [Op.like]: searchPattern } },
        { facultyId: { [Op.like]: searchPattern } },
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [['createdAt', 'DESC']],
      include: [{ model: Department, as: 'departmentRef', attributes: ['id', 'name', 'code'] }],
    });

    return {
      items: rows,
      totalItems: count,
      page: pageNum,
      limit: limitNum,
    };
  }

  /**
   * Create user by administrator
   */
  static async createUser({
    fullName,
    email,
    password,
    role = ROLES.STUDENT,
    studentId = null,
    facultyId = null,
    department = null,
    departmentId = null,
    accountStatus = ACCOUNT_STATUS.ACTIVE,
    performedBy = null,
    ipAddress = null,
    userAgent = null,
  }) {
    const normalizedEmail = email.toLowerCase().trim();

    const existingEmail = await User.findOne({ where: { email: normalizedEmail } });
    if (existingEmail) {
      throw new ConflictError('An account with this email address already exists.', 'EMAIL_EXISTS');
    }

    if (studentId) {
      const existingStudent = await User.findOne({ where: { studentId: studentId.trim() } });
      if (existingStudent) {
        throw new ConflictError('An account with this student ID already exists.', 'STUDENT_ID_EXISTS');
      }
    }

    if (facultyId) {
      const existingFaculty = await User.findOne({ where: { facultyId: facultyId.trim() } });
      if (existingFaculty) {
        throw new ConflictError('An account with this faculty ID already exists.', 'FACULTY_ID_EXISTS');
      }
    }

    let verifiedDeptId = null;
    let verifiedDeptName = department ? department.trim() : null;
    if (departmentId) {
      const dept = await Department.findByPk(departmentId);
      if (dept) {
        verifiedDeptId = dept.id;
        verifiedDeptName = dept.name;
      }
    }

    const passwordHash = await bcrypt.hash(password, config.jwt.bcryptSaltRounds);

    const newUser = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
      studentId: studentId ? studentId.trim() : null,
      facultyId: facultyId ? facultyId.trim() : null,
      department: verifiedDeptName,
      departmentId: verifiedDeptId,
      accountStatus,
    });

    await AuditService.logEvent({
      entityType: 'User',
      entityId: newUser.id,
      eventType: 'USER_CREATED_BY_ADMIN',
      performedBy,
      performedByRole: ROLES.ADMIN,
      description: `Admin created user: ${newUser.email} with role: ${newUser.role}`,
      recordData: { id: newUser.id, email: newUser.email, role: newUser.role },
      ipAddress,
      userAgent,
    });

    return newUser;
  }

  /**
   * Get user by ID (accessible by Admin or user viewing own record)
   */
  static async getUserById(id, requestingUser) {
    if (requestingUser.role !== ROLES.ADMIN && requestingUser.id !== id) {
      throw new ForbiddenError('You are not authorized to view this user account', 'FORBIDDEN');
    }

    const user = await User.findByPk(id, {
      include: [{ model: Department, as: 'departmentRef', attributes: ['id', 'name', 'code'] }],
    });

    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    return user;
  }

  /**
   * Update user by administrator
   */
  static async updateUser(
    id,
    {
      fullName,
      role,
      department,
      departmentId,
      studentId,
      facultyId,
      accountStatus,
      performedBy = null,
      ipAddress = null,
      userAgent = null,
    }
  ) {
    const user = await User.findByPk(id);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    const previousRole = user.role;
    const previousStatus = user.accountStatus;

    if (fullName !== undefined) user.fullName = fullName.trim();
    if (role !== undefined) user.role = role;
    if (department !== undefined) user.department = department.trim();
    if (departmentId !== undefined) user.departmentId = departmentId;
    if (studentId !== undefined) user.studentId = studentId ? studentId.trim() : null;
    if (facultyId !== undefined) user.facultyId = facultyId ? facultyId.trim() : null;

    let statusChangedToInactive = false;
    if (accountStatus !== undefined && accountStatus !== user.accountStatus) {
      if (accountStatus !== ACCOUNT_STATUS.ACTIVE) {
        statusChangedToInactive = true;
      }
      user.accountStatus = accountStatus;
    }

    // Wrap user update and token revocation in transaction
    await sequelize.transaction(async (t) => {
      await user.save({ transaction: t });

      // If account was suspended or inactivated, terminate active sessions atomically
      if (statusChangedToInactive) {
        await TokenService.revokeAllUserTokens(user.id, { transaction: t });
      }
    });

    // Record audit events
    if (role !== undefined && role !== previousRole) {
      await AuditService.logEvent({
        entityType: 'User',
        entityId: user.id,
        eventType: 'ROLE_CHANGED',
        performedBy,
        performedByRole: ROLES.ADMIN,
        description: `Admin changed user ${user.email} role from ${previousRole} to ${user.role}`,
        ipAddress,
        userAgent,
      });
    }

    if (accountStatus !== undefined && accountStatus !== previousStatus) {
      const statusEvent = accountStatus === ACCOUNT_STATUS.ACTIVE ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED';
      await AuditService.logEvent({
        entityType: 'User',
        entityId: user.id,
        eventType: statusEvent,
        performedBy,
        performedByRole: ROLES.ADMIN,
        description: `Admin changed user ${user.email} status to ${accountStatus}`,
        ipAddress,
        userAgent,
      });
    }

    await AuditService.logEvent({
      entityType: 'User',
      entityId: user.id,
      eventType: 'USER_UPDATED_BY_ADMIN',
      performedBy,
      performedByRole: ROLES.ADMIN,
      description: `Admin updated user details for: ${user.email}`,
      ipAddress,
      userAgent,
    });

    return user;
  }

  /**
   * Soft delete user by administrator
   */
  static async deleteUser(id, { performedBy, ipAddress = null, userAgent = null }) {
    if (id === performedBy) {
      throw new AppError('Administrators cannot delete their own account', 400, 'SELF_DELETION_PROHIBITED');
    }

    const user = await User.findByPk(id);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    // Revoke all tokens and soft-delete user atomically in transaction
    await sequelize.transaction(async (t) => {
      await TokenService.revokeAllUserTokens(user.id, { transaction: t });
      await user.destroy({ transaction: t });
    });

    await AuditService.logEvent({
      entityType: 'User',
      entityId: user.id,
      eventType: 'USER_DELETED_BY_ADMIN',
      performedBy,
      performedByRole: ROLES.ADMIN,
      description: `Admin soft-deleted user account: ${user.email}`,
      ipAddress,
      userAgent,
    });

    return { message: 'User account soft-deleted successfully' };
  }
}

module.exports = UsersService;
