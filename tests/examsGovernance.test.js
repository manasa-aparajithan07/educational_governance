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
} = require('../src/database/models');
const { ROLES, EXAM_STATUS, ACCOUNT_STATUS } = require('../src/utils/constants');

jest.setTimeout(30000);

describe('Phase 3C: Examination Governance & Ownership', () => {
  let adminToken;
  let facultyAToken;
  let facultyBToken;
  let facultyECEToken;
  let studentToken;

  let adminUser;
  let facultyAUser;
  let facultyBUser;
  let facultyECEUser;
  let studentUser;

  let cseDept;
  let eceDept;
  let cseSubject;
  let eceSubject;

  const createdExamIds = [];

  beforeAll(async () => {
    const migrate = require('../src/database/migrate');
    await migrate();
    const seed = require('../src/database/seed');
    await seed();

    // 1. Authenticate Seeded Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@vit.ac.in', password: 'Admin@12345' });
    adminToken = adminRes.body.data.accessToken;
    adminUser = adminRes.body.data.user;

    // 2. Authenticate Seeded Faculty A (CSE)
    const facultyARes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty@vit.ac.in', password: 'Faculty@12345' });
    facultyAToken = facultyARes.body.data.accessToken;
    facultyAUser = facultyARes.body.data.user;

    // 3. Authenticate Seeded Student
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student@vit.ac.in', password: 'Student@12345' });
    studentToken = studentRes.body.data.accessToken;
    studentUser = studentRes.body.data.user;

    // 4. Fetch Departments
    cseDept = await Department.findOne({ where: { code: 'CSE' } });
    eceDept = await Department.findOne({ where: { code: 'ECE' } });

    // 5. Fetch / Create Subjects
    cseSubject = await Subject.findOne({ where: { code: 'BACSE350' } });
    eceSubject = await Subject.findOne({ where: { code: 'BTECE201' } });
    if (!eceSubject) {
      eceSubject = await Subject.create({
        code: 'BTECE201',
        name: 'Signals and Systems',
        departmentId: eceDept.id,
        credits: 4,
      });
    }

    // 6. Create Faculty B (CSE)
    const passwordHash = await bcrypt.hash('FacultyB@12345', 10);
    facultyBUser = await User.findOne({ where: { email: 'faculty.b@vit.ac.in' } });
    if (!facultyBUser) {
      facultyBUser = await User.create({
        fullName: 'Prof. Ananya Sharma',
        email: 'faculty.b@vit.ac.in',
        passwordHash,
        role: ROLES.FACULTY,
        facultyId: 'FAC-CSE-002',
        department: 'CSE',
        departmentId: cseDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
    }
    const facultyBLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty.b@vit.ac.in', password: 'FacultyB@12345' });
    facultyBToken = facultyBLogin.body.data.accessToken;

    // 7. Create Faculty ECE (ECE)
    const ecePasswordHash = await bcrypt.hash('FacultyECE@12345', 10);
    facultyECEUser = await User.findOne({ where: { email: 'faculty.ece@vit.ac.in' } });
    if (!facultyECEUser) {
      facultyECEUser = await User.create({
        fullName: 'Prof. Rajesh Kumar',
        email: 'faculty.ece@vit.ac.in',
        passwordHash: ecePasswordHash,
        role: ROLES.FACULTY,
        facultyId: 'FAC-ECE-001',
        department: 'ECE',
        departmentId: eceDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
    }
    const facultyECELogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty.ece@vit.ac.in', password: 'FacultyECE@12345' });
    facultyECEToken = facultyECELogin.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    try {
      if (createdExamIds.length > 0) {
        await Exam.destroy({ where: { id: createdExamIds }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  describe('1. Faculty Ownership Isolation', () => {
    let examBId;

    beforeAll(async () => {
      // Faculty B creates an exam
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({
          title: 'Faculty B Operating Systems Exam',
          examCode: `EXAM-B-${Date.now()}`,
          subjectId: cseSubject.id,
          departmentId: cseDept.id,
          examDate: '2026-11-20',
          duration: 120,
          maximumMarks: 100,
          status: EXAM_STATUS.DRAFT,
        });
      expect(res.statusCode).toBe(201);
      examBId = res.body.data.exam.id;
      createdExamIds.push(examBId);
    });

    it('1. Faculty A cannot modify Faculty B exam via PUT (403 Forbidden)', async () => {
      const res = await request(app)
        .put(`/api/v1/exams/${examBId}`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ title: 'Tampered Title by Faculty A' });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('2. Faculty A cannot modify Faculty B exam via PATCH (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${examBId}`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ duration: 90 });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('3. Faculty A cannot delete Faculty B exam (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/exams/${examBId}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('4. Faculty A cannot transition Faculty B exam status (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${examBId}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('5. Faculty B can successfully modify their own exam (200 OK)', async () => {
      const res = await request(app)
        .put(`/api/v1/exams/${examBId}`)
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({ title: 'Legitimately Updated Title by Faculty B' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.title).toBe('Legitimately Updated Title by Faculty B');
    });
  });

  describe('2. Department Boundary Enforcement', () => {
    let eceExamId;

    beforeAll(async () => {
      // Faculty ECE creates an exam in ECE
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyECEToken}`)
        .send({
          title: 'ECE Signals and Systems Midterm',
          examCode: `EXAM-ECE-${Date.now()}`,
          subjectId: eceSubject.id,
          departmentId: eceDept.id,
          examDate: '2026-11-25',
          duration: 180,
          maximumMarks: 100,
          status: EXAM_STATUS.DRAFT,
        });
      expect(res.statusCode).toBe(201);
      eceExamId = res.body.data.exam.id;
      createdExamIds.push(eceExamId);
    });

    it('6. Faculty cannot create an exam outside their department (403 Forbidden)', async () => {
      // Faculty A (CSE) attempts to create an exam in ECE
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({
          title: 'Cross Department Exam Attempt',
          examCode: `CROSS-DEPT-${Date.now()}`,
          subjectId: eceSubject.id,
          departmentId: eceDept.id,
          examDate: '2026-11-28',
          duration: 120,
          maximumMarks: 100,
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.message).toContain('department');
    });

    it('7. Faculty cannot manage another department exam (403 Forbidden)', async () => {
      // Faculty A (CSE) attempts to update ECE exam
      const res = await request(app)
        .put(`/api/v1/exams/${eceExamId}`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ title: 'Tampered by CSE Faculty' });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('8. Faculty cannot move an exam outside their department via update (403 Forbidden)', async () => {
      // Faculty ECE attempts to change departmentId to CSE
      const res = await request(app)
        .put(`/api/v1/exams/${eceExamId}`)
        .set('Authorization', `Bearer ${facultyECEToken}`)
        .send({ departmentId: cseDept.id });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('3. Admin Institutional Override', () => {
    let overrideExamId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({
          title: 'Faculty B Exam for Admin Override',
          examCode: `EXAM-OVR-${Date.now()}`,
          subjectId: cseSubject.id,
          departmentId: cseDept.id,
          examDate: '2026-12-01',
          duration: 120,
          maximumMarks: 100,
          status: EXAM_STATUS.DRAFT,
        });
      overrideExamId = res.body.data.exam.id;
      createdExamIds.push(overrideExamId);
    });

    it('9. Admin can override ownership and update another user exam (200 OK)', async () => {
      const res = await request(app)
        .put(`/api/v1/exams/${overrideExamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Admin Overridden Title' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.title).toBe('Admin Overridden Title');
    });

    it('10. Admin can override ownership and transition exam status (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${overrideExamId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.SCHEDULED);
    });

    it('11. Admin can create exams in any department (201 Created)', async () => {
      const res = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Admin Created ECE Exam',
          examCode: `ADMIN-ECE-${Date.now()}`,
          subjectId: eceSubject.id,
          departmentId: eceDept.id,
          examDate: '2026-12-05',
          duration: 180,
          maximumMarks: 100,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.departmentId).toBe(eceDept.id);
      createdExamIds.push(res.body.data.exam.id);
    });

    it('12. Admin can override ownership and delete exam (200 OK)', async () => {
      const res = await request(app)
        .delete(`/api/v1/exams/${overrideExamId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('4. Completed / Cancelled Immutability', () => {
    let completedExamId;
    let cancelledExamId;

    beforeAll(async () => {
      // 1. Create and transition to COMPLETED
      const compRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({
          title: 'Exam to be Completed',
          examCode: `EXAM-COMP-${Date.now()}`,
          subjectId: cseSubject.id,
          departmentId: cseDept.id,
          examDate: '2026-11-10',
          duration: 180,
          maximumMarks: 100,
          status: EXAM_STATUS.DRAFT,
        });
      completedExamId = compRes.body.data.exam.id;
      createdExamIds.push(completedExamId);

      await request(app)
        .patch(`/api/v1/exams/${completedExamId}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });

      await request(app)
        .patch(`/api/v1/exams/${completedExamId}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: EXAM_STATUS.ONGOING });

      await request(app)
        .patch(`/api/v1/exams/${completedExamId}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: EXAM_STATUS.COMPLETED });

      // 2. Create and transition to CANCELLED
      const cancRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({
          title: 'Exam to be Cancelled',
          examCode: `EXAM-CANC-${Date.now()}`,
          subjectId: cseSubject.id,
          departmentId: cseDept.id,
          examDate: '2026-11-12',
          duration: 180,
          maximumMarks: 100,
          status: EXAM_STATUS.DRAFT,
        });
      cancelledExamId = cancRes.body.data.exam.id;
      createdExamIds.push(cancelledExamId);

      await request(app)
        .patch(`/api/v1/exams/${cancelledExamId}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: EXAM_STATUS.CANCELLED });
    });

    it('13. COMPLETED exam cannot be modified via PUT (400 EXAM_IMMUTABLE)', async () => {
      const res = await request(app)
        .put(`/api/v1/exams/${completedExamId}`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ title: 'Altered Completed Exam' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXAM_IMMUTABLE');
    });

    it('14. COMPLETED exam cannot be modified via PATCH (400 EXAM_IMMUTABLE)', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${completedExamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maximumMarks: 80 });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXAM_IMMUTABLE');
    });

    it('15. CANCELLED exam cannot be modified via PUT (400 EXAM_IMMUTABLE)', async () => {
      const res = await request(app)
        .put(`/api/v1/exams/${cancelledExamId}`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ title: 'Altered Cancelled Exam' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXAM_IMMUTABLE');
    });

    it('16. CANCELLED exam cannot be modified via PATCH (400 EXAM_IMMUTABLE)', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/${cancelledExamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ duration: 90 });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXAM_IMMUTABLE');
    });
  });

  describe('5. Student Visibility Scoping', () => {
    let draftExamId;
    let scheduledExamId;

    beforeAll(async () => {
      // Create DRAFT exam
      const draftRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({
          title: 'Confidential Draft Exam',
          examCode: `DRAFT-VIS-${Date.now()}`,
          subjectId: cseSubject.id,
          departmentId: cseDept.id,
          examDate: '2026-12-10',
          duration: 180,
          maximumMarks: 100,
          status: EXAM_STATUS.DRAFT,
        });
      draftExamId = draftRes.body.data.exam.id;
      createdExamIds.push(draftExamId);

      // Create SCHEDULED exam
      const schedRes = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({
          title: 'Published Scheduled Exam',
          examCode: `SCHED-VIS-${Date.now()}`,
          subjectId: cseSubject.id,
          departmentId: cseDept.id,
          examDate: '2026-12-15',
          duration: 180,
          maximumMarks: 100,
          status: EXAM_STATUS.DRAFT,
        });
      scheduledExamId = schedRes.body.data.exam.id;
      createdExamIds.push(scheduledExamId);

      await request(app)
        .patch(`/api/v1/exams/${scheduledExamId}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: EXAM_STATUS.SCHEDULED });
    });

    it('17. Student cannot see DRAFT exam in listing', async () => {
      const res = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      const items = res.body.data.items;
      const draftExam = items.find((e) => e.id === draftExamId);
      expect(draftExam).toBeUndefined();
      const anyDraft = items.find((e) => e.status === EXAM_STATUS.DRAFT);
      expect(anyDraft).toBeUndefined();
    });

    it('18. Student explicitly filtering by status=DRAFT receives an empty list', async () => {
      const res = await request(app)
        .get('/api/v1/exams?status=DRAFT')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(0);
    });

    it('19. Student cannot retrieve DRAFT exam by ID (404 Not Found)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${draftExamId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('20. Student can retrieve an allowed SCHEDULED exam by ID (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${scheduledExamId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.id).toBe(scheduledExamId);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.SCHEDULED);
    });

    it('21. Faculty and Admin can view DRAFT exams (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${draftExamId}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exam.status).toBe(EXAM_STATUS.DRAFT);
    });
  });
});
