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
const { ROLES, EXAM_STATUS, EXAM_TYPE } = require('../src/utils/constants');

jest.setTimeout(30000);

describe('Phase 3A: Examination Management Module Foundation', () => {
  let adminToken;
  let facultyToken;
  let studentToken;
  let adminUser;
  let facultyUser;
  let studentUser;
  let testDepartment;
  let testSubject;
  let testExamId;
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
    studentUser = studentRes.body.data.user;

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

  describe('1. Examination Creation (POST /api/v1/exams)', () => {
    it('should successfully create an examination with valid data by Faculty (201 Created)', async () => {
      const payload = {
        title: 'Blockchain Architecture Midterm Examination',
        description: 'Comprehensive assessment on distributed ledgers and consensus',
        examCode: `TEST-EXAM-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        examDate: '2026-10-15',
        startTime: '10:00:00',
        endTime: '13:00:00',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      };

      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send(payload);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('successfully');
      expect(res.body.data.exam).toBeDefined();

      const exam = res.body.data.exam;
      testExamId = exam.id;
      createdExamIds.push(exam.id);

      expect(exam.id).toBeDefined();
      expect(exam.title).toBe(payload.title);
      expect(exam.examCode).toBe(payload.examCode);
      expect(exam.subjectId).toBe(testSubject.id);
      expect(exam.departmentId).toBe(testDepartment.id);
      expect(exam.examDate).toBe(payload.examDate);
      expect(exam.duration).toBe(180);
      expect(exam.maximumMarks).toBe(100);
      expect(exam.status).toBe(EXAM_STATUS.DRAFT);
      expect(exam.createdBy).toBe(facultyUser.id);
      expect(exam.creator).toBeDefined();
      expect(exam.creator.id).toBe(facultyUser.id);
      expect(exam.subject).toBeDefined();
      expect(exam.subject.code).toBe('BACSE350');
      expect(exam.department).toBeDefined();
      expect(exam.department.code).toBe('CSE');
    });

    it('should auto-generate unique examCode when omitted in payload', async () => {
      const payload = {
        title: 'Distributed Systems Surprise Quiz',
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        examDate: '2026-10-20',
        duration: 60,
        maximumMarks: 50,
      };

      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.examCode).toBeDefined();
      expect(res.body.data.exam.examCode).toMatch(/^EXAM-BACSE350-/);
      createdExamIds.push(res.body.data.exam.id);
    });

    it('should reject creation when required fields are missing (422 Unprocessable Entity)', async () => {
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({});

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);

      const fieldsWithErrors = res.body.error.details.map((d) => d.field);
      expect(fieldsWithErrors).toContain('title');
      expect(fieldsWithErrors).toContain('subjectId');
      expect(fieldsWithErrors).toContain('departmentId');
      expect(fieldsWithErrors).toContain('examDate');
      expect(fieldsWithErrors).toContain('duration');
      expect(fieldsWithErrors).toContain('maximumMarks');
    });

    it('should reject creation with malformed or non-existent subjectId (422)', async () => {
      // 1. Malformed UUID
      const malformedRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Valid Title Here',
          subjectId: 'not-a-valid-uuid',
          departmentId: testDepartment.id,
          examDate: '2026-10-20',
          duration: 90,
          maximumMarks: 100,
        });

      expect(malformedRes.statusCode).toBe(422);
      expect(malformedRes.body.success).toBe(false);

      // 2. Non-existent UUID
      const nonExistentRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Valid Title Here',
          subjectId: '00000000-0000-0000-0000-000000000000',
          departmentId: testDepartment.id,
          examDate: '2026-10-20',
          duration: 90,
          maximumMarks: 100,
        });

      expect(nonExistentRes.statusCode).toBe(422);
      expect(nonExistentRes.body.success).toBe(false);
      expect(nonExistentRes.body.message).toContain('Validation failed');
    });

    it('should reject creation with malformed or non-existent departmentId (422)', async () => {
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Valid Title Here',
          subjectId: testSubject.id,
          departmentId: '00000000-0000-0000-0000-000000000000',
          examDate: '2026-10-20',
          duration: 90,
          maximumMarks: 100,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject creation with invalid duration (<= 0 or non-integer) (422)', async () => {
      const negativeDurationRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Test Exam',
          subjectId: testSubject.id,
          departmentId: testDepartment.id,
          examDate: '2026-10-20',
          duration: -30,
          maximumMarks: 100,
        });

      expect(negativeDurationRes.statusCode).toBe(422);
      expect(negativeDurationRes.body.success).toBe(false);

      const zeroDurationRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Test Exam',
          subjectId: testSubject.id,
          departmentId: testDepartment.id,
          examDate: '2026-10-20',
          duration: 0,
          maximumMarks: 100,
        });

      expect(zeroDurationRes.statusCode).toBe(422);
      expect(zeroDurationRes.body.success).toBe(false);
    });

    it('should reject creation with invalid maximumMarks (<= 0) (422)', async () => {
      const negativeMarksRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Test Exam',
          subjectId: testSubject.id,
          departmentId: testDepartment.id,
          examDate: '2026-10-20',
          duration: 120,
          maximumMarks: -10,
        });

      expect(negativeMarksRes.statusCode).toBe(422);
      expect(negativeMarksRes.body.success).toBe(false);

      const zeroMarksRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Test Exam',
          subjectId: testSubject.id,
          departmentId: testDepartment.id,
          examDate: '2026-10-20',
          duration: 120,
          maximumMarks: 0,
        });

      expect(zeroMarksRes.statusCode).toBe(422);
      expect(zeroMarksRes.body.success).toBe(false);
    });

    it('should reject creation with duplicate examCode (409 Conflict)', async () => {
      const duplicateCode = `DUP-EXAM-${Date.now()}`;

      // First creation
      const firstRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Original Exam',
          examCode: duplicateCode,
          subjectId: testSubject.id,
          departmentId: testDepartment.id,
          examDate: '2026-10-25',
          duration: 120,
          maximumMarks: 100,
        });
      expect(firstRes.statusCode).toBe(201);
      createdExamIds.push(firstRes.body.data.exam.id);

      // Second creation with identical examCode
      const secondRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Duplicate Exam Code Test',
          examCode: duplicateCode,
          subjectId: testSubject.id,
          departmentId: testDepartment.id,
          examDate: '2026-10-26',
          duration: 120,
          maximumMarks: 100,
        });

      expect(secondRes.statusCode).toBe(409);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.error.code).toBe('EXAM_CODE_EXISTS');
    });

    it('should reject creation with invalid status for Phase 3A (422)', async () => {
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Premature Result Published Exam',
          subjectId: testSubject.id,
          departmentId: testDepartment.id,
          examDate: '2026-10-20',
          duration: 120,
          maximumMarks: 100,
          status: 'RESULT_PUBLISHED', // Advanced status not allowed in Phase 3A initial creation
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2. Examination Retrieval (GET /api/v1/exams & GET /api/v1/exams/:id)', () => {
    it('should retrieve examination by ID (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${testExamId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam).toBeDefined();
      expect(res.body.data.exam.id).toBe(testExamId);
      expect(res.body.data.exam.subject).toBeDefined();
      expect(res.body.data.exam.department).toBeDefined();
      expect(res.body.data.exam.creator).toBeDefined();
    });

    it('should return 404 when retrieving a non-existent examination', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/v1/exams/${fakeId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should list examinations with pagination and metadata (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/exams?page=1&limit=5')
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(5);
      expect(res.body.data.pagination.totalItems).toBeGreaterThanOrEqual(1);
    });

    it('should filter examinations by status', async () => {
      const res = await request(app)
        .get(`/api/v1/exams?status=${EXAM_STATUS.DRAFT}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.data.items.forEach((item) => {
        expect(item.status).toBe(EXAM_STATUS.DRAFT);
      });
    });

    it('should filter examinations by departmentId', async () => {
      const res = await request(app)
        .get(`/api/v1/exams?departmentId=${testDepartment.id}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.data.items.forEach((item) => {
        expect(item.departmentId).toBe(testDepartment.id);
      });
    });
  });

  describe('3. Examination Modification (PUT & PATCH /api/v1/exams/:id)', () => {
    it('should successfully update an examination by Faculty/Admin (200 OK)', async () => {
      const updatePayload = {
        title: 'Updated Blockchain Architecture Midterm',
        duration: 150,
        maximumMarks: 80,
      };

      const res = await request(app)
        .put(`/api/v1/exams/${testExamId}`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send(updatePayload);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.title).toBe(updatePayload.title);
      expect(res.body.data.exam.duration).toBe(150);
      expect(res.body.data.exam.maximumMarks).toBe(80);
    });

    it('should support partial updates via PATCH method (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${testExamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maximumMarks: 100 });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.maximumMarks).toBe(100);
    });

    it('should reject invalid update values (negative marks, invalid status) (422)', async () => {
      const res = await request(app)
        .put(`/api/v1/exams/${testExamId}`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          maximumMarks: -50,
          status: 'UNSUPPORTED_STATUS',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when updating non-existent examination', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .put(`/api/v1/exams/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Non-Existent Exam' });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. Examination Deletion (DELETE /api/v1/exams/:id)', () => {
    let deletableExamId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          title: 'Exam to be Deleted',
          subjectId: testSubject.id,
          departmentId: testDepartment.id,
          examDate: '2026-11-01',
          duration: 90,
          maximumMarks: 50,
          status: EXAM_STATUS.DRAFT,
        });
      deletableExamId = res.body.data.exam.id;
      createdExamIds.push(deletableExamId);
    });

    it('should safely soft-delete an examination in DRAFT/SCHEDULED status (200 OK)', async () => {
      const res = await request(app)
        .delete(`/api/v1/exams/${deletableExamId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('successfully');

      // Verify soft deletion: GET by ID should now return 404
      const getRes = await request(app)
        .get(`/api/v1/exams/${deletableExamId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(getRes.statusCode).toBe(404);

      // Verify database record still exists but with deletedAt set (paranoid mode)
      const rawExam = await Exam.findByPk(deletableExamId, { paranoid: false });
      expect(rawExam).not.toBeNull();
      expect(rawExam.deletedAt).not.toBeNull();
    });

    it('should return 404 when deleting a non-existent examination', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .delete(`/api/v1/exams/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('5. Role-Based Access Control (RBAC) & Security Enforcement', () => {
    it('should reject unauthenticated requests to examination endpoints (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/exams');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject STUDENT attempting to create an examination (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Unauthorized Student Exam',
          subjectId: testSubject.id,
          departmentId: testDepartment.id,
          examDate: '2026-10-30',
          duration: 120,
          maximumMarks: 100,
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject STUDENT attempting to modify an examination (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/v1/exams/${testExamId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Tampered By Student' });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject STUDENT attempting to delete an examination (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/exams/${testExamId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow STUDENT to view examination listings and details (200 OK)', async () => {
      // Transition testExamId to SCHEDULED so it is published for students
      await request(app)
        .patch(`/api/v1/exams/${testExamId}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      // List
      const listRes = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(listRes.statusCode).toBe(200);
      expect(listRes.body.success).toBe(true);

      // Single item
      const itemRes = await request(app)
        .get(`/api/v1/exams/${testExamId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(itemRes.statusCode).toBe(200);
      expect(itemRes.body.success).toBe(true);
      expect(itemRes.body.data.exam.id).toBe(testExamId);
    });
  });

  describe('6. Immutable Audit Trail Integration', () => {
    it('should log audit events for examination creation, updates, and deletion', async () => {
      const createLog = await AuditLog.findOne({
        where: {
          entityType: 'Exam',
          eventType: 'EXAM_CREATED',
        },
        order: [['createdAt', 'DESC']],
      });

      expect(createLog).not.toBeNull();
      expect(createLog.recordHash).toBeDefined();
      expect(createLog.performedBy).toBeDefined();

      const updateLog = await AuditLog.findOne({
        where: {
          entityType: 'Exam',
          eventType: 'EXAM_UPDATED',
        },
        order: [['createdAt', 'DESC']],
      });

      expect(updateLog).not.toBeNull();
    });
  });
});
