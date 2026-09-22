'use strict';

const request = require('supertest');
const app = require('../src/app');
const { sequelize, User, Department, AuditLog, RefreshToken } = require('../src/database/models');
const { ROLES, ACCOUNT_STATUS } = require('../src/utils/constants');

describe('Phase 2: User Management & Role-Based Access Control (RBAC)', () => {
  let adminToken;
  let facultyToken;
  let studentToken;
  let adminUserId;
  let facultyUserId;
  let studentUserId;
  let createdFacultyId;

  beforeAll(async () => {
    await sequelize.sync();
    const seed = require('../src/database/seed');
    await seed();

    // 1. Log in Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@vit.ac.in', password: 'Admin@12345' });
    adminToken = adminRes.body.data.accessToken;
    adminUserId = adminRes.body.data.user.id;

    // 2. Log in Faculty
    const facultyRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty@vit.ac.in', password: 'Faculty@12345' });
    facultyToken = facultyRes.body.data.accessToken;
    facultyUserId = facultyRes.body.data.user.id;

    // 3. Log in Student
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student@vit.ac.in', password: 'Student@12345' });
    studentToken = studentRes.body.data.accessToken;
    studentUserId = studentRes.body.data.user.id;
  });

  afterAll(async () => {
    try {
      if (createdFacultyId) {
        await RefreshToken.destroy({ where: { userId: createdFacultyId } });
        await AuditLog.destroy({ where: { performedBy: createdFacultyId } });
        await User.destroy({ where: { id: createdFacultyId }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  describe('1. Role-Based Access Control (RBAC) Enforcement', () => {
    it('should reject STUDENT attempting to list all users (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject FACULTY attempting to list all users (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject STUDENT attempting to create a user (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          fullName: 'Malicious Student',
          email: 'malicious@vit.ac.in',
          password: 'Password@12345',
          role: ROLES.ADMIN,
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject STUDENT attempting to view another user profile (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${facultyUserId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should allow user to view their own profile by ID (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${studentUserId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(studentUserId);
    });

    it('should reject unauthenticated request to users list (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/users');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-admin updating another user (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/v1/users/${facultyUserId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ fullName: 'Tampered Name' });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-admin deleting a user (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/users/${facultyUserId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should record UNAUTHORIZED_ACCESS_ATTEMPT audit log event on forbidden access', async () => {
      const audit = await AuditLog.findOne({
        where: { eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT', performedBy: facultyUserId },
      });
      expect(audit).not.toBeNull();
      expect(audit.description).toContain('Unauthorized access attempt');
    });
  });

  describe('2. Administrator User Management', () => {
    it('should allow ADMIN to retrieve paginated user list with filters', async () => {
      const res = await request(app)
        .get('/api/v1/users?page=1&limit=5&role=FACULTY')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('pagination');
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(5);
      expect(res.body.data.items.every((u) => u.role === ROLES.FACULTY)).toBe(true);
    });

    it('should allow ADMIN to create a new Faculty member', async () => {
      const newEmail = `faculty_${Date.now()}@vit.ac.in`;
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Dr. K. Ananthakrishnan',
          email: newEmail,
          password: 'Faculty@12345',
          role: ROLES.FACULTY,
          facultyId: `FAC-${Date.now()}`,
          department: 'CSE',
          accountStatus: ACCOUNT_STATUS.ACTIVE,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe(ROLES.FACULTY);
      expect(res.body.data.user.email).toBe(newEmail);
      expect(res.body.data.user.passwordHash).toBeUndefined();

      createdFacultyId = res.body.data.user.id;

      // Verify audit log
      const audit = await AuditLog.findOne({
        where: { entityId: createdFacultyId, eventType: 'USER_CREATED_BY_ADMIN' },
      });
      expect(audit).not.toBeNull();
    });

    it('should reject creating user with duplicate email (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Duplicate User',
          email: 'admin@vit.ac.in',
          password: 'Password@12345',
          role: ROLES.FACULTY,
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should reject creating user with invalid role (422 Validation Error)', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Invalid Role User',
          email: `invalid_role_${Date.now()}@vit.ac.in`,
          password: 'Password@12345',
          role: 'SUPER_ADMIN',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d) => d.field === 'role')).toBe(true);
    });

    it('should allow ADMIN to update user attributes', async () => {
      const res = await request(app)
        .put(`/api/v1/users/${createdFacultyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Dr. K. Ananthakrishnan (Senior Faculty)',
          department: 'Computer Science and Engineering',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.fullName).toContain('Senior Faculty');
    });

    it('should allow ADMIN to update user role and record ROLE_CHANGED audit event', async () => {
      const res = await request(app)
        .put(`/api/v1/users/${createdFacultyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: ROLES.STUDENT,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe(ROLES.STUDENT);

      const roleAudit = await AuditLog.findOne({
        where: { entityId: createdFacultyId, eventType: 'ROLE_CHANGED' },
      });
      expect(roleAudit).not.toBeNull();
    });

    it('should allow ADMIN to suspend user and automatically revoke all their active tokens', async () => {
      const TokenService = require('../src/services/tokenService');
      const facultyUser = await User.findByPk(createdFacultyId);
      const tokens = await TokenService.generateTokens(facultyUser);

      const res = await request(app)
        .put(`/api/v1/users/${createdFacultyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          accountStatus: ACCOUNT_STATUS.SUSPENDED,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.accountStatus).toBe(ACCOUNT_STATUS.SUSPENDED);

      // Verify token refresh is now rejected because tokens were revoked upon suspension
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });

      expect(refreshRes.statusCode).toBe(401);
      expect(refreshRes.body.error.code).toBe('TOKEN_REUSE_DETECTED');
    });

    it('should prevent ADMIN from deleting their own account (400 Bad Request)', async () => {
      const res = await request(app)
        .delete(`/api/v1/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SELF_DELETION_PROHIBITED');
    });

    it('should allow ADMIN to soft-delete a user account', async () => {
      const res = await request(app)
        .delete(`/api/v1/users/${createdFacultyId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify soft deletion (user is paranoid, deletedAt is set)
      const userAfterDelete = await User.findByPk(createdFacultyId);
      expect(userAfterDelete).toBeNull(); // findByPk excludes soft-deleted records by default

      const userWithDeleted = await User.findByPk(createdFacultyId, { paranoid: false });
      expect(userWithDeleted).not.toBeNull();
      expect(userWithDeleted.deletedAt).not.toBeNull();
    });

    it('should verify audit log entries for user update and user deletion', async () => {
      const updateAudit = await AuditLog.findOne({
        where: { entityId: createdFacultyId, eventType: 'USER_UPDATED_BY_ADMIN' },
      });
      expect(updateAudit).not.toBeNull();

      const deleteAudit = await AuditLog.findOne({
        where: { entityId: createdFacultyId, eventType: 'USER_DELETED_BY_ADMIN' },
      });
      expect(deleteAudit).not.toBeNull();
    });
  });

  describe('3. Academic Department Access & Controls', () => {
    it('should allow authenticated users to list departments', async () => {
      const res = await request(app)
        .get('/api/v1/departments')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('departments');
      expect(Array.isArray(res.body.data.departments)).toBe(true);
    });

    it('should prevent STUDENT from creating a department (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ name: 'Mechanical Engineering', code: 'MECH' });

      expect(res.statusCode).toBe(403);
    });

    it('should allow ADMIN to create a new department', async () => {
      const code = `DPT${Date.now().toString().slice(-4)}`;
      const res = await request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Department ${code}`, code });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.department.code).toBe(code);

      // Clean up department
      await Department.destroy({ where: { code } });
    });
  });
});
