'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const config = require('../src/config/env');
const { sequelize, User, RefreshToken, AuditLog } = require('../src/database/models');
const { ROLES, ACCOUNT_STATUS } = require('../src/utils/constants');

describe('Phase 2: Authentication & Session Management', () => {
  let studentEmail;
  let studentPassword;
  let studentAccessToken;
  let studentRefreshToken;
  let inactiveUser;
  let suspendedUser;

  beforeAll(async () => {
    await sequelize.sync();

    // Clean up any test users from prior aborted runs
    const testEmails = ['inactive_test@vit.ac.in', 'suspended_test@vit.ac.in'];
    const existing = await User.findAll({ where: { email: testEmails }, paranoid: false });
    const existingIds = existing.map((u) => u.id);
    if (existingIds.length > 0) {
      await RefreshToken.destroy({ where: { userId: existingIds } });
      await AuditLog.destroy({ where: { performedBy: existingIds } });
      await User.destroy({ where: { id: existingIds }, force: true });
    }

    // Create an inactive user for account status testing
    const inactiveHash = await bcrypt.hash('Inactive@12345', config.jwt.bcryptSaltRounds);
    inactiveUser = await User.create({
      fullName: 'Inactive Student',
      email: 'inactive_test@vit.ac.in',
      passwordHash: inactiveHash,
      role: ROLES.STUDENT,
      studentId: 'INACTIVE-001',
      accountStatus: ACCOUNT_STATUS.INACTIVE,
    });

    // Create a suspended user for suspended status testing
    const suspendedHash = await bcrypt.hash('Suspended@12345', config.jwt.bcryptSaltRounds);
    suspendedUser = await User.create({
      fullName: 'Suspended Student',
      email: 'suspended_test@vit.ac.in',
      passwordHash: suspendedHash,
      role: ROLES.STUDENT,
      studentId: 'SUSPENDED-001',
      accountStatus: ACCOUNT_STATUS.SUSPENDED,
    });
  });

  afterAll(async () => {
    try {
      const users = await User.findAll({
        where: { email: ['inactive_test@vit.ac.in', 'suspended_test@vit.ac.in', studentEmail] },
        paranoid: false,
      });
      const userIds = users.map((u) => u.id);
      if (userIds.length > 0) {
        await RefreshToken.destroy({ where: { userId: userIds } });
        await AuditLog.destroy({ where: { performedBy: userIds } });
        await User.destroy({ where: { id: userIds }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  describe('1. User Registration (POST /api/v1/auth/register)', () => {
    studentEmail = `student_${Date.now()}@vit.ac.in`;
    studentPassword = 'Password@12345';

    it('should register a new student successfully with hashed password and dual tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Test Registered Student',
          email: studentEmail,
          password: studentPassword,
          studentId: `REG-${Date.now()}`,
          department: 'Computer Science and Engineering',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('registration completed');

      // Verify tokens
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data).toHaveProperty('expiresIn');

      studentAccessToken = res.body.data.accessToken;
      studentRefreshToken = res.body.data.refreshToken;

      // Verify returned user object does NOT expose passwordHash
      const { user } = res.body.data;
      expect(user).toBeDefined();
      expect(user.passwordHash).toBeUndefined();
      expect(user.role).toBe(ROLES.STUDENT);
      expect(user.accountStatus).toBe(ACCOUNT_STATUS.ACTIVE);

      // Verify password hashing in database
      const dbUser = await User.findOne({ where: { email: studentEmail } });
      expect(dbUser).not.toBeNull();
      expect(dbUser.passwordHash).not.toBe(studentPassword);
      expect(dbUser.passwordHash.startsWith('$2')).toBe(true);
      const isMatch = await bcrypt.compare(studentPassword, dbUser.passwordHash);
      expect(isMatch).toBe(true);

      // Verify audit log entry
      const auditEntry = await AuditLog.findOne({
        where: { entityId: dbUser.id, eventType: 'USER_REGISTER' },
      });
      expect(auditEntry).not.toBeNull();
    });

    it('should reject duplicate email registration with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Duplicate Student',
          email: studentEmail,
          password: 'Password@12345',
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should reject registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Invalid Email User',
          email: 'not-an-email',
          password: 'Password@12345',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'email')).toBe(true);
    });

    it('should reject registration with weak password (missing special char or uppercase)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Weak Password User',
          email: 'weakpass@vit.ac.in',
          password: 'simplepassword1',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d) => d.field === 'password')).toBe(true);
    });

    it('should reject duplicate studentId registration with 409 Conflict', async () => {
      const dbUser = await User.findOne({ where: { email: studentEmail } });
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Duplicate Student ID User',
          email: `new_student_${Date.now()}@vit.ac.in`,
          password: 'Password@12345',
          studentId: dbUser.studentId,
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('STUDENT_ID_EXISTS');
    });

    it('should reject public attempt to register ADMIN role (422 Validation Error)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Malicious Admin Wannabe',
          email: `wannabe_admin_${Date.now()}@vit.ac.in`,
          password: 'Password@12345',
          role: ROLES.ADMIN,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'role')).toBe(true);
    });

    it('should reject registration with invalid role value (422 Validation Error)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Invalid Role User',
          email: `invalid_role_${Date.now()}@vit.ac.in`,
          password: 'Password@12345',
          role: 'SUPERUSER',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'role')).toBe(true);
    });

    it('should reject registration with invalid studentId format (422 Validation Error)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Invalid Student ID User',
          email: `invalid_sid_${Date.now()}@vit.ac.in`,
          password: 'Password@12345',
          studentId: '',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'studentId')).toBe(true);
    });
  });

  describe('2. User Login (POST /api/v1/auth/login)', () => {
    it('should successfully authenticate with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: studentEmail,
          password: studentPassword,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('successful');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');

      // Update tokens for subsequent tests
      studentAccessToken = res.body.data.accessToken;
      studentRefreshToken = res.body.data.refreshToken;
    });

    it('should reject login with wrong password (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: studentEmail,
          password: 'WrongPassword@999',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with non-existent email (401 Unauthorized without leaking existence)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent_account@vit.ac.in',
          password: 'Password@12345',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for inactive accounts (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'inactive_test@vit.ac.in',
          password: 'Inactive@12345',
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('should reject login for suspended accounts (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'suspended_test@vit.ac.in',
          password: 'Suspended@12345',
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('should record audit log events for successful and failed logins', async () => {
      const user = await User.findOne({ where: { email: studentEmail } });
      const successAudit = await AuditLog.findOne({
        where: { entityId: user.id, eventType: 'USER_LOGIN' },
      });
      expect(successAudit).not.toBeNull();

      const failAudit = await AuditLog.findOne({
        where: { entityId: user.id, eventType: 'LOGIN_FAILED' },
      });
      expect(failAudit).not.toBeNull();
    });

    it('should reject login with missing credentials (422 Validation Error)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({});

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'email')).toBe(true);
      expect(res.body.error.details.some((d) => d.field === 'password')).toBe(true);
    });

    it('should reject login with malformed email format (422 Validation Error)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email-at-all',
          password: 'Password@12345',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'email')).toBe(true);
    });
  });

  describe('3. Token Verification & Middleware Guards', () => {
    it('should reject protected route when Authorization header is missing (401)', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject protected route when token is malformed (401)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer this.is.malformed');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject protected route when token has expired (401)', async () => {
      // Create an immediately expired token
      const expiredToken = jwt.sign(
        { sub: 'test-id', role: 'STUDENT' },
        config.jwt.accessSecret,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should allow access to profile with valid access token (GET /api/v1/auth/me)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${studentAccessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(studentEmail);
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('should update authenticated user profile (PUT /api/v1/auth/me)', async () => {
      const res = await request(app)
        .put('/api/v1/auth/me')
        .set('Authorization', `Bearer ${studentAccessToken}`)
        .send({
          fullName: 'Updated Name Student',
          department: 'Information Technology',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.fullName).toBe('Updated Name Student');
      expect(res.body.data.user.department).toBe('Information Technology');
    });

    it('should reject protected route when token has invalid signature (401 INVALID_TOKEN)', async () => {
      const forgedToken = jwt.sign(
        { sub: inactiveUser.id, role: 'STUDENT' },
        'different_tampered_secret_key_that_does_not_match',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject protected route when user associated with token does not exist (401 USER_NOT_FOUND)', async () => {
      const ghostToken = jwt.sign(
        { sub: '00000000-0000-0000-0000-000000000000', role: 'STUDENT' },
        config.jwt.accessSecret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ghostToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should reject protected route when authenticated user is inactive (403 ACCOUNT_INACTIVE)', async () => {
      const inactiveToken = jwt.sign(
        { sub: inactiveUser.id, role: 'STUDENT' },
        config.jwt.accessSecret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${inactiveToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('should reject profile update attempting to modify role (422 Validation Error)', async () => {
      const res = await request(app)
        .put('/api/v1/auth/me')
        .set('Authorization', `Bearer ${studentAccessToken}`)
        .send({ role: ROLES.ADMIN });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'role')).toBe(true);
    });

    it('should reject profile update with invalid fullName (422 Validation Error)', async () => {
      const res = await request(app)
        .put('/api/v1/auth/me')
        .set('Authorization', `Bearer ${studentAccessToken}`)
        .send({ fullName: 'A' });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'fullName')).toBe(true);
    });
  });

  describe('4. Token Rotation & Revocation Strategy', () => {
    it('should rotate tokens and return fresh access and refresh tokens (POST /api/v1/auth/refresh)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: studentRefreshToken });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');

      const newAccessToken = res.body.data.accessToken;
      const newRefreshToken = res.body.data.refreshToken;

      // Verify the new access token is valid
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${newAccessToken}`);
      expect(meRes.statusCode).toBe(200);

      // Attempting to reuse the old refresh token must fail
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: studentRefreshToken });

      expect(reuseRes.statusCode).toBe(401);
      expect(reuseRes.body.success).toBe(false);

      // Update studentRefreshToken to new valid token
      studentRefreshToken = newRefreshToken;
      studentAccessToken = newAccessToken;
    });

    it('should log out and revoke the refresh token (POST /api/v1/auth/logout)', async () => {
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${studentAccessToken}`)
        .send({ refreshToken: studentRefreshToken });

      expect(logoutRes.statusCode).toBe(200);
      expect(logoutRes.body.success).toBe(true);
      expect(logoutRes.body.message).toContain('Logged out');

      // Subsequent refresh with logged out token should fail
      const refreshAfterLogout = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: studentRefreshToken });

      expect(refreshAfterLogout.statusCode).toBe(401);
    });

    it('should reject refresh token rotation when token is unrecognized or invalid (401)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid.jwt.token' });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject refresh token rotation when refresh token has expired (401 TOKEN_EXPIRED)', async () => {
      const expiredRefreshToken = jwt.sign(
        { sub: inactiveUser.id, jti: 'expired-refresh-jti', type: 'refresh' },
        config.jwt.refreshSecret,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: expiredRefreshToken });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject refresh token rotation when account is suspended (403 Forbidden)', async () => {
      const TokenService = require('../src/services/tokenService');
      const suspendedTokens = await TokenService.generateTokens(suspendedUser);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: suspendedTokens.refreshToken });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('should allow logout even if access token is expired when refresh token is provided', async () => {
      const expiredToken = jwt.sign(
        { sub: inactiveUser.id, role: 'STUDENT' },
        config.jwt.accessSecret,
        { expiresIn: '-1s' }
      );
      const TokenService = require('../src/services/tokenService');
      const tokens = await TokenService.generateTokens(inactiveUser);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ refreshToken: tokens.refreshToken });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Logged out');
    });

    it('should reject logout when neither authorization header nor refresh token is provided (422)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({});

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should record audit log events for TOKEN_REFRESH and USER_LOGOUT', async () => {
      const user = await User.findOne({ where: { email: studentEmail } });
      const refreshAudit = await AuditLog.findOne({
        where: { entityId: user.id, eventType: 'TOKEN_REFRESH' },
      });
      expect(refreshAudit).not.toBeNull();

      const logoutAudit = await AuditLog.findOne({
        where: { entityId: user.id, eventType: 'USER_LOGOUT' },
      });
      expect(logoutAudit).not.toBeNull();
    });
  });

  describe('5. Password Change & Session Invalidation', () => {
    it('should change password and invalidate all previous sessions', async () => {
      // First, log in again to get fresh session
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: studentEmail,
          password: studentPassword,
        });
      const activeToken = loginRes.body.data.accessToken;
      const activeRefreshToken = loginRes.body.data.refreshToken;

      const newPassword = 'NewSecretPassword@2026';

      // Change password
      const changeRes = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${activeToken}`)
        .send({
          currentPassword: studentPassword,
          newPassword,
        });

      expect(changeRes.statusCode).toBe(200);
      expect(changeRes.body.success).toBe(true);

      // Refresh token issued before password change should now be revoked
      const refreshAttempt = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: activeRefreshToken });

      expect(refreshAttempt.statusCode).toBe(401);

      // Login with old password should fail
      const oldLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: studentEmail,
          password: studentPassword,
        });
      expect(oldLogin.statusCode).toBe(401);

      // Login with new password must succeed
      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: studentEmail,
          password: newPassword,
        });
      expect(newLogin.statusCode).toBe(200);
    });

    it('should reject password change with incorrect current password (401 Unauthorized)', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: studentEmail,
          password: 'NewSecretPassword@2026',
        });
      const activeToken = loginRes.body.data.accessToken;

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${activeToken}`)
        .send({
          currentPassword: 'WrongCurrentPassword@999',
          newPassword: 'AnotherPassword@2026',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

      // Verify audit log for failed password change
      const failAudit = await AuditLog.findOne({
        where: { eventType: 'PASSWORD_CHANGE_FAILED' },
      });
      expect(failAudit).not.toBeNull();
    });

    it('should reject password change with weak new password (422 Unprocessable Entity)', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: studentEmail,
          password: 'NewSecretPassword@2026',
        });
      const activeToken = loginRes.body.data.accessToken;

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${activeToken}`)
        .send({
          currentPassword: 'NewSecretPassword@2026',
          newPassword: 'weak',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d) => d.field === 'newPassword')).toBe(true);
    });

    it('should reject password change when new password is identical to current password (422 Unprocessable Entity)', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: studentEmail,
          password: 'NewSecretPassword@2026',
        });
      const activeToken = loginRes.body.data.accessToken;

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${activeToken}`)
        .send({
          currentPassword: 'NewSecretPassword@2026',
          newPassword: 'NewSecretPassword@2026',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details.some((d) => d.field === 'newPassword')).toBe(true);
    });

    it('should record PASSWORD_CHANGE audit log event', async () => {
      const user = await User.findOne({ where: { email: studentEmail } });
      const audit = await AuditLog.findOne({
        where: { entityId: user.id, eventType: 'PASSWORD_CHANGE' },
      });
      expect(audit).not.toBeNull();
    });

    it('should verify audit log entries never expose plaintext passwords, secrets, or raw refresh tokens', async () => {
      const logs = await AuditLog.findAll({ limit: 50 });
      expect(logs.length).toBeGreaterThan(0);

      for (const log of logs) {
        const desc = log.description || '';
        // Description must never leak password or refresh token strings
        expect(desc).not.toContain('Password@12345');
        expect(desc).not.toContain('NewSecretPassword@2026');
        expect(desc).not.toContain('dev_access_secret_key');
        expect(desc).not.toContain('dev_refresh_secret_key');
      }
    });
  });
});
