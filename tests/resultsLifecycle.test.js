'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const {
  sequelize,
  User,
  Department,
  Subject,
  Exam,
  Result,
  AuditLog,
} = require('../src/database/models');
const { ROLES, EXAM_STATUS, RESULT_STATUS, ACCOUNT_STATUS } = require('../src/utils/constants');

jest.setTimeout(30000);

describe('Phase 5B: Result Lifecycle & Audit Verification', () => {
  let adminToken;
  let facultyToken;
  let studentToken;

  let adminUser;
  let facultyUser;
  let studentUser1;
  let studentUser2;

  let cseDept;
  let cseSubject;
  let testExam;

  const createdExamIds = [];
  const createdUserIds = [];
  const createdResultIds = [];

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

    // 3. Authenticate Default Student
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student@vit.ac.in', password: 'Student@12345' });
    studentToken = studentRes.body.data.accessToken;
    studentUser1 = studentRes.body.data.user;

    // 4. Fetch Department & Subject
    cseDept = await Department.findOne({ where: { code: 'CSE' } });
    cseSubject = await Subject.findOne({ where: { code: 'BACSE350' } });

    // 5. Create Student 2
    const saltRounds = 10;
    const stdPasswordHash = await bcrypt.hash('Student@12345', saltRounds);
    studentUser2 = await User.findOne({ where: { email: 'student2.5b@vit.ac.in' }, paranoid: false });
    if (!studentUser2) {
      await User.destroy({ where: { studentId: '25BCE8801' }, force: true });
      studentUser2 = await User.create({
        fullName: 'Aakash Mehta',
        email: 'student2.5b@vit.ac.in',
        passwordHash: stdPasswordHash,
        role: ROLES.STUDENT,
        studentId: '25BCE8801',
        department: 'CSE',
        departmentId: cseDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
      createdUserIds.push(studentUser2.id);
    } else if (studentUser2.deletedAt) {
      await studentUser2.restore();
    }

    // 6. Create Completed Exam for testing result lifecycle
    testExam = await Exam.create({
      title: 'Lifecycle Verification Exam',
      examCode: `EXAM-5B-${Date.now()}`,
      subjectId: cseSubject.id,
      departmentId: cseDept.id,
      createdBy: facultyUser.id,
      examDate: '2026-10-25',
      duration: 120,
      maximumMarks: 100,
      status: EXAM_STATUS.COMPLETED,
    });
    createdExamIds.push(testExam.id);
  });

  afterAll(async () => {
    try {
      if (createdResultIds.length > 0) {
        await Result.destroy({ where: { id: createdResultIds }, force: true });
      }
      if (createdExamIds.length > 0) {
        await Result.destroy({ where: { examId: createdExamIds }, force: true });
        await Exam.destroy({ where: { id: createdExamIds }, force: true });
      }
      if (createdUserIds.length > 0) {
        await User.destroy({ where: { id: createdUserIds }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  describe('1. Valid Single Result Lifecycle Transitions (PATCH /api/v1/results/:id/status)', () => {
    let resultRecord;

    beforeAll(async () => {
      // Create initial DRAFT result
      resultRecord = await Result.create({
        examId: testExam.id,
        studentId: studentUser1.id,
        facultyId: facultyUser.id,
        marksObtained: 85.0,
        maximumMarks: testExam.maximumMarks,
        grade: 'A',
        remarks: 'Initial draft evaluation',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      createdResultIds.push(resultRecord.id);
    });

    it('1. DRAFT -> SUBMITTED transitions and sets submittedAt', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${resultRecord.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.submissionStatus).toBe(RESULT_STATUS.SUBMITTED);
      expect(res.body.data.result.submittedAt).toBeDefined();
      expect(new Date(res.body.data.result.submittedAt).getTime()).not.toBeNaN();

      // Check AuditLog
      const audit = await AuditLog.findOne({
        where: {
          entityType: 'Result',
          entityId: resultRecord.id,
          eventType: 'RESULT_SUBMITTED',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit.performedBy).toBe(facultyUser.id);
      expect(audit.recordHash).toHaveLength(64);
    });

    it('2. SUBMITTED -> UNDER_REVIEW transitions successfully', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${resultRecord.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.UNDER_REVIEW });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.submissionStatus).toBe(RESULT_STATUS.UNDER_REVIEW);

      const audit = await AuditLog.findOne({
        where: {
          entityType: 'Result',
          entityId: resultRecord.id,
          eventType: 'RESULT_UNDER_REVIEW',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('3. UNDER_REVIEW -> VERIFIED sets verifiedBy and verifiedAt', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${resultRecord.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.VERIFIED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      const { result } = res.body.data;
      expect(result.submissionStatus).toBe(RESULT_STATUS.VERIFIED);
      expect(result.verifiedBy).toBe(facultyUser.id);
      expect(result.verifiedAt).toBeDefined();
      expect(new Date(result.verifiedAt).getTime()).not.toBeNaN();

      const audit = await AuditLog.findOne({
        where: {
          entityType: 'Result',
          entityId: resultRecord.id,
          eventType: 'RESULT_VERIFIED',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit.recordHash).toHaveLength(64);
    });

    it('4. VERIFIED -> PUBLISHED by ADMIN sets publishedAt', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${resultRecord.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      const { result } = res.body.data;
      expect(result.submissionStatus).toBe(RESULT_STATUS.PUBLISHED);
      expect(result.publishedAt).toBeDefined();
      expect(new Date(result.publishedAt).getTime()).not.toBeNaN();

      const audit = await AuditLog.findOne({
        where: {
          entityType: 'Result',
          entityId: resultRecord.id,
          eventType: 'RESULT_PUBLISHED',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit.performedBy).toBe(adminUser.id);
      expect(audit.recordHash).toHaveLength(64);
    });

    it('5. UNDER_REVIEW -> REJECTED transitions and logs event', async () => {
      // Create a separate result to test rejection workflow
      const rejectableResult = await Result.create({
        examId: testExam.id,
        studentId: studentUser2.id,
        facultyId: facultyUser.id,
        marksObtained: 40.0,
        maximumMarks: testExam.maximumMarks,
        grade: 'E',
        submissionStatus: RESULT_STATUS.UNDER_REVIEW,
      });
      createdResultIds.push(rejectableResult.id);

      const res = await request(app)
        .patch(`/api/v1/results/${rejectableResult.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.REJECTED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.submissionStatus).toBe(RESULT_STATUS.REJECTED);

      const audit = await AuditLog.findOne({
        where: {
          entityType: 'Result',
          entityId: rejectableResult.id,
          eventType: 'RESULT_REJECTED',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('6. REJECTED -> DRAFT reopens result for marks rework', async () => {
      // Find the rejected result from previous test
      const rejectedResult = await Result.findOne({
        where: { examId: testExam.id, studentId: studentUser2.id, submissionStatus: RESULT_STATUS.REJECTED },
      });

      const res = await request(app)
        .patch(`/api/v1/results/${rejectedResult.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.DRAFT });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.submissionStatus).toBe(RESULT_STATUS.DRAFT);
    });
  });

  describe('2. State Machine Enforcement & Invalid Transitions', () => {
    let draftResult;
    let publishedResult;
    let verifiedResult;

    beforeAll(async () => {
      // Create test results in different statuses for negative testing
      const exam2 = await Exam.create({
        title: 'Negative Testing Exam',
        examCode: `EXAM-NEG-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-10-26',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(exam2.id);

      draftResult = await Result.create({
        examId: exam2.id,
        studentId: studentUser1.id,
        facultyId: facultyUser.id,
        marksObtained: 75.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      createdResultIds.push(draftResult.id);

      publishedResult = await Result.create({
        examId: exam2.id,
        studentId: studentUser2.id,
        facultyId: facultyUser.id,
        marksObtained: 90.0,
        maximumMarks: 100,
        grade: 'S',
        submissionStatus: RESULT_STATUS.PUBLISHED,
        publishedAt: new Date(),
      });
      createdResultIds.push(publishedResult.id);

      // Create extra user for verified result
      const extraStudent = await User.create({
        fullName: 'Extra Student',
        email: `extra.${Date.now()}@vit.ac.in`,
        passwordHash: await bcrypt.hash('Student@12345', 10),
        role: ROLES.STUDENT,
        studentId: `25BCE${Math.floor(1000 + Math.random() * 9000)}`,
        department: 'CSE',
        departmentId: cseDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
      createdUserIds.push(extraStudent.id);

      verifiedResult = await Result.create({
        examId: exam2.id,
        studentId: extraStudent.id,
        facultyId: facultyUser.id,
        marksObtained: 80.0,
        maximumMarks: 100,
        grade: 'A',
        submissionStatus: RESULT_STATUS.VERIFIED,
        verifiedBy: facultyUser.id,
        verifiedAt: new Date(),
      });
      createdResultIds.push(verifiedResult.id);
    });

    it('7. Rejects same-status transition (400 SAME_STATUS_TRANSITION)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${draftResult.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.DRAFT });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SAME_STATUS_TRANSITION');
    });

    it('8. Rejects arbitrary forward jump DRAFT -> PUBLISHED (400 INVALID_STATUS_TRANSITION)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${draftResult.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('9. Rejects arbitrary forward jump DRAFT -> VERIFIED (400 INVALID_STATUS_TRANSITION)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${draftResult.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.VERIFIED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('10. Rejects unpermitted transition from terminal state PUBLISHED -> DRAFT (400 INVALID_STATUS_TRANSITION)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${publishedResult.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.DRAFT });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('11. Rejects unpermitted backward transition VERIFIED -> DRAFT (400 INVALID_STATUS_TRANSITION)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${verifiedResult.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.DRAFT });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('12. Rejects invalid status value (422 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${draftResult.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: 'INVALID_STATUS_CODE' });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('13. Returns 404 for non-existent result ID', async () => {
      const nonExistentId = '99999999-9999-4999-9999-999999999999';
      const res = await request(app)
        .patch(`/api/v1/results/${nonExistentId}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(res.statusCode).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('3. Role-Based Access Control (RBAC)', () => {
    let rbacResult;

    beforeAll(async () => {
      const rbacExam = await Exam.create({
        title: 'RBAC Verification Exam',
        examCode: `EXAM-RBAC-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-10-27',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(rbacExam.id);

      rbacResult = await Result.create({
        examId: rbacExam.id,
        studentId: studentUser1.id,
        facultyId: facultyUser.id,
        marksObtained: 82.0,
        maximumMarks: 100,
        grade: 'A',
        submissionStatus: RESULT_STATUS.VERIFIED,
      });
      createdResultIds.push(rbacResult.id);
    });

    it('14. STUDENT cannot transition result status (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${rbacResult.id}/status`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('15. Non-admin (FACULTY) cannot transition VERIFIED -> PUBLISHED (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${rbacResult.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('16. Unauthenticated request is rejected (401 UNAUTHORIZED)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${rbacResult.id}/status`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('4. Batch Status Transition (PATCH /api/v1/exams/:examId/results/status)', () => {
    let batchExam;
    let batchR1;
    let batchR2;

    beforeAll(async () => {
      batchExam = await Exam.create({
        title: 'Batch Transition Test Exam',
        examCode: `EXAM-BATCH-TR-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-10-28',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(batchExam.id);

      batchR1 = await Result.create({
        examId: batchExam.id,
        studentId: studentUser1.id,
        facultyId: facultyUser.id,
        marksObtained: 88.0,
        maximumMarks: 100,
        grade: 'A',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      batchR2 = await Result.create({
        examId: batchExam.id,
        studentId: studentUser2.id,
        facultyId: facultyUser.id,
        marksObtained: 92.0,
        maximumMarks: 100,
        grade: 'S',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      createdResultIds.push(batchR1.id, batchR2.id);
    });

    it('17. Successfully batch transitions DRAFT -> SUBMITTED', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${batchExam.id}/results/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(2);
      expect(res.body.data.status).toBe(RESULT_STATUS.SUBMITTED);

      // Verify records in database
      const refreshedR1 = await Result.findByPk(batchR1.id);
      const refreshedR2 = await Result.findByPk(batchR2.id);
      expect(refreshedR1.submissionStatus).toBe(RESULT_STATUS.SUBMITTED);
      expect(refreshedR2.submissionStatus).toBe(RESULT_STATUS.SUBMITTED);
      expect(refreshedR1.submittedAt).toBeDefined();
      expect(refreshedR2.submittedAt).toBeDefined();
    });

    it('18. Successfully batch transitions SUBMITTED -> UNDER_REVIEW', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${batchExam.id}/results/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.UNDER_REVIEW });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(RESULT_STATUS.UNDER_REVIEW);

      const refreshed = await Result.findAll({ where: { examId: batchExam.id } });
      expect(refreshed.every((r) => r.submissionStatus === RESULT_STATUS.UNDER_REVIEW)).toBe(true);
    });

    it('19. Successfully batch transitions UNDER_REVIEW -> VERIFIED', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${batchExam.id}/results/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.VERIFIED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(RESULT_STATUS.VERIFIED);

      const refreshed = await Result.findAll({ where: { examId: batchExam.id } });
      expect(refreshed.every((r) => r.submissionStatus === RESULT_STATUS.VERIFIED)).toBe(true);
      expect(refreshed.every((r) => r.verifiedBy === facultyUser.id)).toBe(true);
      expect(refreshed.every((r) => r.verifiedAt !== null)).toBe(true);
    });

    it('20. Batch transition VERIFIED -> PUBLISHED rejected for non-admin (FACULTY)', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${batchExam.id}/results/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('21. Successfully batch transitions VERIFIED -> PUBLISHED by ADMIN', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${batchExam.id}/results/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(RESULT_STATUS.PUBLISHED);

      const refreshed = await Result.findAll({ where: { examId: batchExam.id } });
      expect(refreshed.every((r) => r.submissionStatus === RESULT_STATUS.PUBLISHED)).toBe(true);
      expect(refreshed.every((r) => r.publishedAt !== null)).toBe(true);
    });

    it('22. Atomic rollback when one result in batch cannot legally transition', async () => {
      // Create an exam with 2 results in heterogeneous statuses: one DRAFT, one PUBLISHED
      const mixedExam = await Exam.create({
        title: 'Mixed Status Rollback Exam',
        examCode: `EXAM-RB-MX-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-10-29',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(mixedExam.id);

      const rDraft = await Result.create({
        examId: mixedExam.id,
        studentId: studentUser1.id,
        facultyId: facultyUser.id,
        marksObtained: 70.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      const rPublished = await Result.create({
        examId: mixedExam.id,
        studentId: studentUser2.id,
        facultyId: facultyUser.id,
        marksObtained: 85.0,
        maximumMarks: 100,
        grade: 'A',
        submissionStatus: RESULT_STATUS.PUBLISHED,
        publishedAt: new Date(),
      });
      createdResultIds.push(rDraft.id, rPublished.id);

      // Attempt to batch transition to SUBMITTED:
      // rDraft can transition (DRAFT -> SUBMITTED), but rPublished CANNOT (PUBLISHED is terminal)
      const res = await request(app)
        .patch(`/api/v1/exams/${mixedExam.id}/results/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');

      // Verify atomic rollback: rDraft MUST remain in DRAFT status!
      const checkDraft = await Result.findByPk(rDraft.id);
      expect(checkDraft.submissionStatus).toBe(RESULT_STATUS.DRAFT);
      expect(checkDraft.submittedAt).toBeNull();
    });
  });

  describe('5. Audit Log Event Integrity & Cryptographic Hashes', () => {
    it('23. Transition creates audit event with valid 64-character SHA-256 recordHash', async () => {
      const auditTestExam = await Exam.create({
        title: 'Audit Test Exam',
        examCode: `EXAM-AUD-5B-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-10-30',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(auditTestExam.id);

      const resRecord = await Result.create({
        examId: auditTestExam.id,
        studentId: studentUser1.id,
        facultyId: facultyUser.id,
        marksObtained: 95.0,
        maximumMarks: 100,
        grade: 'S',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      createdResultIds.push(resRecord.id);

      // Transition to SUBMITTED
      await request(app)
        .patch(`/api/v1/results/${resRecord.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      const auditEntry = await AuditLog.findOne({
        where: {
          entityType: 'Result',
          entityId: resRecord.id,
          eventType: 'RESULT_SUBMITTED',
        },
      });

      expect(auditEntry).not.toBeNull();
      expect(auditEntry.performedBy).toBe(facultyUser.id);
      expect(auditEntry.recordHash).toBeDefined();
      expect(auditEntry.recordHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
