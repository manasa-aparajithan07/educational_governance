'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const {
  sequelize,
  User,
  Department,
  Subject,
  Exam,
  QuestionPaper,
  AuditLog,
} = require('../src/database/models');
const fileStorageService = require('../src/services/fileStorageService');
const { ROLES, EXAM_STATUS, ACCOUNT_STATUS } = require('../src/utils/constants');

jest.setTimeout(30000);

describe('Phase 4C: Question Paper Governance, Ownership & Immutability', () => {
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
  const createdPaperIds = [];
  const filesToCleanup = [];

  const samplePdfContent = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Title (Governance Test Question Paper) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );

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

    // 2. Authenticate Faculty A (CSE)
    const facultyARes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty@vit.ac.in', password: 'Faculty@12345' });
    facultyAToken = facultyARes.body.data.accessToken;
    facultyAUser = facultyARes.body.data.user;

    // 3. Authenticate Student
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

    // 6. Create / Authenticate Faculty B (CSE)
    const bHash = await bcrypt.hash('FacultyB@12345', 10);
    facultyBUser = await User.findOne({ where: { email: 'faculty.b@vit.ac.in' } });
    if (!facultyBUser) {
      facultyBUser = await User.create({
        fullName: 'Prof. Ananya Sharma',
        email: 'faculty.b@vit.ac.in',
        passwordHash: bHash,
        role: ROLES.FACULTY,
        facultyId: 'FAC-CSE-002',
        department: 'CSE',
        departmentId: cseDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
    }
    const bLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty.b@vit.ac.in', password: 'FacultyB@12345' });
    facultyBToken = bLogin.body.data.accessToken;

    // 7. Create / Authenticate Faculty ECE (ECE)
    const eceHash = await bcrypt.hash('FacultyECE@12345', 10);
    facultyECEUser = await User.findOne({ where: { email: 'faculty.ece@vit.ac.in' } });
    if (!facultyECEUser) {
      facultyECEUser = await User.create({
        fullName: 'Prof. Rajesh Kumar',
        email: 'faculty.ece@vit.ac.in',
        passwordHash: eceHash,
        role: ROLES.FACULTY,
        facultyId: 'FAC-ECE-001',
        department: 'ECE',
        departmentId: eceDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
    }
    const eceLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty.ece@vit.ac.in', password: 'FacultyECE@12345' });
    facultyECEToken = eceLogin.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    try {
      for (const id of createdPaperIds) {
        const paper = await QuestionPaper.findByPk(id, { paranoid: false });
        if (paper) {
          fileStorageService.deleteFile(paper.filePathOrStorageKey);
          await paper.destroy({ force: true });
        }
      }
      for (const key of filesToCleanup) {
        fileStorageService.deleteFile(key);
      }
      if (createdExamIds.length > 0) {
        await Exam.destroy({ where: { id: createdExamIds }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  describe('1. Faculty Ownership Isolation', () => {
    let examB;
    let paperB;

    beforeAll(async () => {
      // Faculty B creates an examination in CSE
      examB = await Exam.create({
        title: 'Faculty B Operating Systems Exam',
        examCode: `EXAM-GOV-B-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyBUser.id,
        examDate: '2026-11-20',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(examB.id);

      // Faculty B legitimately uploads a question paper
      const res = await request(app)
        .post(`/api/v1/exams/${examB.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyBToken}`)
        .attach('file', samplePdfContent, 'exam-b-paper.pdf');

      expect(res.statusCode).toBe(201);
      paperB = res.body.data.questionPaper;
      createdPaperIds.push(paperB.id);
      filesToCleanup.push(paperB.filePathOrStorageKey);
    });

    it('1. Faculty A cannot upload for Faculty B examination (403 Forbidden)', async () => {
      // Faculty B creates another exam with no paper
      const examB2 = await Exam.create({
        title: 'Faculty B Algorithms Exam',
        examCode: `EXAM-GOV-B2-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyBUser.id,
        examDate: '2026-11-22',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(examB2.id);

      const res = await request(app)
        .post(`/api/v1/exams/${examB2.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .attach('file', samplePdfContent, 'tamper-upload.pdf');

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('2. Faculty A cannot retrieve Faculty B paper by exam ID (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${examB.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('3. Faculty A cannot retrieve Faculty B paper by paper ID (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${paperB.id}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('4. Faculty A cannot download Faculty B paper (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${paperB.id}/download`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('5. Faculty A cannot verify Faculty B paper (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/question-papers/${paperB.id}/verify`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('6. Faculty A cannot delete Faculty B paper (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/question-papers/${paperB.id}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('7. Owning faculty (Faculty B) can perform allowed operations on their own paper', async () => {
      // Retrieve by exam ID
      const byExamRes = await request(app)
        .get(`/api/v1/exams/${examB.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyBToken}`);
      expect(byExamRes.statusCode).toBe(200);
      expect(byExamRes.body.data.questionPaper.id).toBe(paperB.id);

      // Retrieve by paper ID
      const byIdRes = await request(app)
        .get(`/api/v1/question-papers/${paperB.id}`)
        .set('Authorization', `Bearer ${facultyBToken}`);
      expect(byIdRes.statusCode).toBe(200);
      expect(byIdRes.body.data.questionPaper.id).toBe(paperB.id);

      // Download
      const dlRes = await request(app)
        .get(`/api/v1/question-papers/${paperB.id}/download`)
        .set('Authorization', `Bearer ${facultyBToken}`);
      expect(dlRes.statusCode).toBe(200);

      // Verify
      const vRes = await request(app)
        .post(`/api/v1/question-papers/${paperB.id}/verify`)
        .set('Authorization', `Bearer ${facultyBToken}`);
      expect(vRes.statusCode).toBe(200);
      expect(vRes.body.data.verificationStatus).toBe('VERIFIED');
    });
  });

  describe('2. Department Boundary Enforcement', () => {
    let examECE;
    let paperECE;

    beforeAll(async () => {
      // Faculty ECE creates an examination in ECE
      examECE = await Exam.create({
        title: 'Signals and Systems Midterm',
        examCode: `EXAM-GOV-ECE-${Date.now()}`,
        subjectId: eceSubject.id,
        departmentId: eceDept.id,
        createdBy: facultyECEUser.id,
        examDate: '2026-11-25',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(examECE.id);

      // Faculty ECE uploads paper
      const res = await request(app)
        .post(`/api/v1/exams/${examECE.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyECEToken}`)
        .attach('file', samplePdfContent, 'ece-paper.pdf');

      expect(res.statusCode).toBe(201);
      paperECE = res.body.data.questionPaper;
      createdPaperIds.push(paperECE.id);
      filesToCleanup.push(paperECE.filePathOrStorageKey);
    });

    it('8. Faculty cannot upload question paper for another department (403 Forbidden)', async () => {
      const examECE2 = await Exam.create({
        title: 'ECE Digital Circuits Exam',
        examCode: `EXAM-GOV-ECE2-${Date.now()}`,
        subjectId: eceSubject.id,
        departmentId: eceDept.id,
        createdBy: facultyECEUser.id,
        examDate: '2026-11-28',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(examECE2.id);

      // Faculty A (CSE) attempts to upload to ECE exam
      const res = await request(app)
        .post(`/api/v1/exams/${examECE2.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .attach('file', samplePdfContent, 'cross-dept.pdf');

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('9. Faculty cannot retrieve another department paper by exam ID (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${examECE.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('10. Faculty cannot retrieve another department paper by paper ID (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${paperECE.id}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('11. Faculty cannot download another department paper (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${paperECE.id}/download`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('12. Faculty cannot verify another department paper (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/question-papers/${paperECE.id}/verify`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('13. Faculty cannot delete another department paper (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/question-papers/${paperECE.id}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('3. Admin Institutional Override', () => {
    let adminExam;
    let adminPaper;

    beforeAll(async () => {
      // Faculty ECE creates an exam with no paper
      adminExam = await Exam.create({
        title: 'ECE Exam for Admin Override',
        examCode: `EXAM-GOV-ADMIN-${Date.now()}`,
        subjectId: eceSubject.id,
        departmentId: eceDept.id,
        createdBy: facultyECEUser.id,
        examDate: '2026-12-01',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(adminExam.id);
    });

    it('14. Admin can upload paper across faculty ownership and department boundaries (201 Created)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${adminExam.id}/question-paper`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', samplePdfContent, 'admin-uploaded-paper.pdf');

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      adminPaper = res.body.data.questionPaper;
      createdPaperIds.push(adminPaper.id);
      filesToCleanup.push(adminPaper.filePathOrStorageKey);
    });

    it('15. Admin can retrieve metadata across departments (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${adminPaper.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionPaper.id).toBe(adminPaper.id);
    });

    it('16. Admin can download question paper across departments (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${adminPaper.id}/download`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('17. Admin can verify question paper across departments (200 OK)', async () => {
      const res = await request(app)
        .post(`/api/v1/question-papers/${adminPaper.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.verificationStatus).toBe('VERIFIED');
    });

    it('18. Admin can delete an active-exam paper across departments (200 OK)', async () => {
      const res = await request(app)
        .delete(`/api/v1/question-papers/${adminPaper.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('4. Exam-State Governance & Immutability', () => {
    let completedExam;
    let cancelledExam;
    let completedPaperExam;
    let cancelledPaperExam;
    let completedPaper;
    let cancelledPaper;

    beforeAll(async () => {
      // 1. Create completed exam without paper
      completedExam = await Exam.create({
        title: 'Completed Exam No Paper',
        examCode: `EXAM-COMP-NO-QP-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-10-01',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(completedExam.id);
      await completedExam.update({ status: EXAM_STATUS.COMPLETED });

      // 2. Create cancelled exam without paper
      cancelledExam = await Exam.create({
        title: 'Cancelled Exam No Paper',
        examCode: `EXAM-CANC-NO-QP-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-10-05',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(cancelledExam.id);
      await cancelledExam.update({ status: EXAM_STATUS.CANCELLED });

      // 3. Create exam with paper then complete
      completedPaperExam = await Exam.create({
        title: 'Completed Exam With Paper',
        examCode: `EXAM-COMP-WITH-QP-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-10-10',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(completedPaperExam.id);

      const compRes = await request(app)
        .post(`/api/v1/exams/${completedPaperExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .attach('file', samplePdfContent, 'comp-paper.pdf');
      completedPaper = compRes.body.data.questionPaper;
      createdPaperIds.push(completedPaper.id);
      filesToCleanup.push(completedPaper.filePathOrStorageKey);

      await completedPaperExam.update({ status: EXAM_STATUS.COMPLETED });

      // 4. Create exam with paper then cancel
      cancelledPaperExam = await Exam.create({
        title: 'Cancelled Exam With Paper',
        examCode: `EXAM-CANC-WITH-QP-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-10-15',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(cancelledPaperExam.id);

      const cancRes = await request(app)
        .post(`/api/v1/exams/${cancelledPaperExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .attach('file', samplePdfContent, 'canc-paper.pdf');
      cancelledPaper = cancRes.body.data.questionPaper;
      createdPaperIds.push(cancelledPaper.id);
      filesToCleanup.push(cancelledPaper.filePathOrStorageKey);

      await cancelledPaperExam.update({ status: EXAM_STATUS.CANCELLED });
    });

    it('19. Reject upload on COMPLETED exam (400 EXAM_IMMUTABLE)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${completedExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .attach('file', samplePdfContent, 'upload-comp.pdf');

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXAM_IMMUTABLE');
    });

    it('20. Reject upload on CANCELLED exam (400 EXAM_IMMUTABLE)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${cancelledExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .attach('file', samplePdfContent, 'upload-canc.pdf');

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXAM_IMMUTABLE');
    });

    it('21. Reject delete on COMPLETED exam (400 EXAM_IMMUTABLE)', async () => {
      const res = await request(app)
        .delete(`/api/v1/question-papers/${completedPaper.id}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXAM_IMMUTABLE');
    });

    it('22. Reject delete on CANCELLED exam (400 EXAM_IMMUTABLE)', async () => {
      const res = await request(app)
        .delete(`/api/v1/question-papers/${cancelledPaper.id}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EXAM_IMMUTABLE');
    });
  });

  describe('5. Pre-Upload Authorization (No Disk Residue)', () => {
    it('23. Unauthorized upload does NOT leave a persisted uploaded file on disk', async () => {
      const uploadDir = fileStorageService.uploadDir;
      const filesBefore = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];

      // Attempt unauthorized upload (Faculty A uploading to Faculty B exam)
      const res = await request(app)
        .post(`/api/v1/exams/${createdExamIds[0]}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .attach('file', samplePdfContent, 'should-not-persist.pdf');

      expect(res.statusCode).toBe(403);

      const filesAfter = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
      expect(filesAfter.length).toBe(filesBefore.length);
    });
  });

  describe('6. Student Access Restrictions', () => {
    let studentTestExam;
    let studentTestPaper;

    beforeAll(async () => {
      studentTestExam = await Exam.create({
        title: 'Student Restriction Test Exam',
        examCode: `EXAM-STU-RESTRICT-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-12-15',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(studentTestExam.id);

      const res = await request(app)
        .post(`/api/v1/exams/${studentTestExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .attach('file', samplePdfContent, 'student-locked.pdf');

      studentTestPaper = res.body.data.questionPaper;
      createdPaperIds.push(studentTestPaper.id);
      filesToCleanup.push(studentTestPaper.filePathOrStorageKey);
    });

    it('24. Student upload attempt is rejected (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${studentTestExam.id}/question-paper`)
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('file', samplePdfContent, 'student-upload.pdf');

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('25. Student metadata retrieval by exam ID is rejected (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${studentTestExam.id}/question-paper`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('26. Student metadata retrieval by paper ID is rejected (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${studentTestPaper.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('27. Student download attempt is rejected (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${studentTestPaper.id}/download`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('28. Student verification attempt is rejected (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/question-papers/${studentTestPaper.id}/verify`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('29. Student deletion attempt is rejected (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/question-papers/${studentTestPaper.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
