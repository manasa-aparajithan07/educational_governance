'use strict';

const request = require('supertest');
const app = require('../src/app');
const {
  sequelize,
  User,
  Department,
  Subject,
  Exam,
  AuditLog,
} = require('../src/database/models');
const { ROLES, EXAM_STATUS } = require('../src/utils/constants');

jest.setTimeout(30000);

describe('Phase 3B: Examination Lifecycle & State Management', () => {
  let adminToken;
  let facultyToken;
  let studentToken;
  let adminUser;
  let facultyUser;
  let testDepartment;
  let testSubject;
  const createdExamIds = [];

  beforeAll(async () => {
    const migrate = require('../src/database/migrate');
    await migrate();
    const seed = require('../src/database/seed');
    await seed();

    // 1. Authenticate Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@vit.ac.in', password: 'Admin@12345' });
    adminToken = adminRes.body.data.accessToken;
    adminUser = adminRes.body.data.user;

    // 2. Authenticate Faculty
    const facultyRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty@vit.ac.in', password: 'Faculty@12345' });
    facultyToken = facultyRes.body.data.accessToken;
    facultyUser = facultyRes.body.data.user;

    // 3. Authenticate Student
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student@vit.ac.in', password: 'Student@12345' });
    studentToken = studentRes.body.data.accessToken;

    // 4. Fetch seeded academic entities
    testDepartment = await Department.findOne({ where: { code: 'CSE' } });
    testSubject = await Subject.findOne({ where: { code: 'BACSE350' } });
  }, 30000);

  afterAll(async () => {
    try {
      if (createdExamIds.length > 0) {
        await Exam.destroy({ where: { id: createdExamIds }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  /**
   * Helper function to create an examination with a specified status
   */
  async function createExamWithStatus(targetStatus = EXAM_STATUS.DRAFT) {
    const examCode = `LC-EXAM-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const exam = await Exam.create({
      title: `Lifecycle Test Exam ${targetStatus}`,
      examCode,
      subjectId: testSubject.id,
      departmentId: testDepartment.id,
      examDate: '2026-11-15',
      startTime: '10:00:00',
      endTime: '13:00:00',
      duration: 180,
      maximumMarks: 100,
      status: targetStatus,
      createdBy: facultyUser.id,
    });
    createdExamIds.push(exam.id);
    return exam;
  }

  describe('1. Valid State Transitions', () => {
    it('1. DRAFT -> SCHEDULED succeeds (200 OK)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.SCHEDULED);
      expect(res.body.data.lifecycle.previousStatus).toBe(EXAM_STATUS.DRAFT);
      expect(res.body.data.lifecycle.currentStatus).toBe(EXAM_STATUS.SCHEDULED);
      expect(res.body.data.lifecycle.transitionedAt).toBeDefined();
    });

    it('2. DRAFT -> CANCELLED succeeds (200 OK)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.CANCELLED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.CANCELLED);
      expect(res.body.data.lifecycle.previousStatus).toBe(EXAM_STATUS.DRAFT);
      expect(res.body.data.lifecycle.currentStatus).toBe(EXAM_STATUS.CANCELLED);
    });

    it('3. SCHEDULED -> ONGOING succeeds (200 OK)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.SCHEDULED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.ONGOING });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.ONGOING);
      expect(res.body.data.lifecycle.previousStatus).toBe(EXAM_STATUS.SCHEDULED);
      expect(res.body.data.lifecycle.currentStatus).toBe(EXAM_STATUS.ONGOING);
    });

    it('4. SCHEDULED -> CANCELLED succeeds (200 OK)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.SCHEDULED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.CANCELLED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.CANCELLED);
      expect(res.body.data.lifecycle.previousStatus).toBe(EXAM_STATUS.SCHEDULED);
      expect(res.body.data.lifecycle.currentStatus).toBe(EXAM_STATUS.CANCELLED);
    });

    it('5. ONGOING -> COMPLETED succeeds (200 OK)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.ONGOING);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.COMPLETED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.COMPLETED);
      expect(res.body.data.lifecycle.previousStatus).toBe(EXAM_STATUS.ONGOING);
      expect(res.body.data.lifecycle.currentStatus).toBe(EXAM_STATUS.COMPLETED);
    });

    it('6. ONGOING -> CANCELLED succeeds (200 OK)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.ONGOING);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.CANCELLED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.CANCELLED);
      expect(res.body.data.lifecycle.previousStatus).toBe(EXAM_STATUS.ONGOING);
      expect(res.body.data.lifecycle.currentStatus).toBe(EXAM_STATUS.CANCELLED);
    });
  });

  describe('2. Invalid State Transitions (Rejected)', () => {
    it('7. DRAFT -> ONGOING rejected (400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.ONGOING });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('8. DRAFT -> COMPLETED rejected (400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.COMPLETED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('9. SCHEDULED -> DRAFT rejected (400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.SCHEDULED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.DRAFT });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('10. SCHEDULED -> COMPLETED rejected (400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.SCHEDULED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.COMPLETED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('11. ONGOING -> DRAFT rejected (400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.ONGOING);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.DRAFT });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('12. ONGOING -> SCHEDULED rejected (400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.ONGOING);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('13. COMPLETED -> DRAFT rejected (terminal state, 400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.COMPLETED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.DRAFT });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('14. COMPLETED -> SCHEDULED rejected (terminal state, 400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.COMPLETED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('15. COMPLETED -> ONGOING rejected (terminal state, 400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.COMPLETED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.ONGOING });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('16. COMPLETED -> CANCELLED rejected (terminal state, 400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.COMPLETED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.CANCELLED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('17. CANCELLED -> DRAFT rejected (terminal state, 400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.CANCELLED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.DRAFT });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('18. CANCELLED -> SCHEDULED rejected (terminal state, 400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.CANCELLED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('19. CANCELLED -> ONGOING rejected (terminal state, 400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.CANCELLED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.ONGOING });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('20. CANCELLED -> COMPLETED rejected (terminal state, 400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.CANCELLED);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.COMPLETED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('3. Transition Validation', () => {
    it('21. Invalid status value rejected (422 Unprocessable Entity)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: 'INVALID_LIFECYCLE_STATUS' });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('22. Missing status rejected (422 Unprocessable Entity)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({});

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('23. Same status transition rejected (400 Bad Request)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.DRAFT });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SAME_STATUS_TRANSITION');
    });

    it('24. Non-existent examination returns 404 Not Found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await request(app)
        .patch(`/api/v1/exams/${fakeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('25. Soft-deleted examination cannot transition (404 Not Found)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);
      await exam.destroy(); // soft deletion

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. Role Authorization & Access Control', () => {
    it('26. ADMIN can perform valid transitions (200 OK)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.SCHEDULED);
    });

    it('27. FACULTY can perform valid transitions (200 OK)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.SCHEDULED);
    });

    it('28. STUDENT receives 403 Forbidden', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('29. Unauthenticated request receives 401 Unauthorized', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('5. Audit Trail Verification', () => {
    it('30-32. Successful transition creates immutable audit record with actor and status details', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(200);

      const auditLog = await AuditLog.findOne({
        where: {
          entityType: 'Exam',
          entityId: exam.id,
          eventType: 'EXAM_STATUS_TRANSITION',
        },
        order: [['createdAt', 'DESC']],
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog.performedBy).toBe(facultyUser.id);
      expect(auditLog.performedByRole).toBe(ROLES.FACULTY);
      expect(auditLog.description).toContain('DRAFT');
      expect(auditLog.description).toContain('SCHEDULED');
      expect(auditLog.recordHash).toBeDefined();
    });
  });

  describe('6. Generic PUT/PATCH Protection', () => {
    it('33. Generic PUT containing status field is rejected (422 Unprocessable Entity)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .put(`/api/v1/exams/${exam.id}`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const statusError = res.body.error.details.find((d) => d.field === 'status');
      expect(statusError).toBeDefined();
      expect(statusError.message).toContain('PATCH /api/v1/exams/:id/status');
    });

    it('34. Generic PATCH containing status field is rejected (422 Unprocessable Entity)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const statusError = res.body.error.details.find((d) => d.field === 'status');
      expect(statusError).toBeDefined();
      expect(statusError.message).toContain('PATCH /api/v1/exams/:id/status');
    });

    it('35. Dedicated status endpoint still performs valid transitions (200 OK)', async () => {
      const exam = await createExamWithStatus(EXAM_STATUS.DRAFT);

      const res = await request(app)
        .patch(`/api/v1/exams/${exam.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.SCHEDULED);
      expect(res.body.data.lifecycle.currentStatus).toBe(EXAM_STATUS.SCHEDULED);
    });
  });
});
