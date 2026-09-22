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
  ExamFacultyAssignment,
  AuditLog,
} = require('../src/database/models');
const {
  ROLES,
  EXAM_STATUS,
  RESULT_STATUS,
  ACCOUNT_STATUS,
} = require('../src/utils/constants');

jest.setTimeout(30000);

describe('Phase 5C: Results Governance, Ownership, Immutability & Student Privacy Scoping', () => {
  let adminToken;
  let facultyAToken;
  let facultyBToken;
  let facultyECEToken;
  let student1Token;
  let student2Token;

  let adminUser;
  let facultyAUser;
  let facultyBUser;
  let facultyECEUser;
  let student1User;
  let student2User;

  let cseDept;
  let eceDept;
  let cseSubject;
  let eceSubject;

  const createdExamIds = [];
  const createdResultIds = [];
  const createdAssignmentIds = [];
  const createdUserIds = [];

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

    // 3. Authenticate Student 1
    const student1Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student@vit.ac.in', password: 'Student@12345' });
    student1Token = student1Res.body.data.accessToken;
    student1User = student1Res.body.data.user;

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
    const saltRounds = 10;
    const bHash = await bcrypt.hash('FacultyB@12345', saltRounds);
    facultyBUser = await User.findOne({ where: { email: 'faculty.b@vit.ac.in' }, paranoid: false });
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
      createdUserIds.push(facultyBUser.id);
    } else if (facultyBUser.deletedAt) {
      await facultyBUser.restore();
    }
    const bLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty.b@vit.ac.in', password: 'FacultyB@12345' });
    facultyBToken = bLogin.body.data.accessToken;

    // 7. Create / Authenticate Faculty ECE (ECE)
    const eceHash = await bcrypt.hash('FacultyECE@12345', saltRounds);
    facultyECEUser = await User.findOne({ where: { email: 'faculty.ece@vit.ac.in' }, paranoid: false });
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
      createdUserIds.push(facultyECEUser.id);
    } else if (facultyECEUser.deletedAt) {
      await facultyECEUser.restore();
    }
    const eceLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty.ece@vit.ac.in', password: 'FacultyECE@12345' });
    facultyECEToken = eceLogin.body.data.accessToken;

    // 8. Create / Authenticate Student 2 (CSE)
    const s2Hash = await bcrypt.hash('Student2@12345', saltRounds);
    student2User = await User.findOne({ where: { email: 'student2.gov@vit.ac.in' }, paranoid: false });
    if (!student2User) {
      student2User = await User.create({
        fullName: 'Vikramaditya Roy',
        email: 'student2.gov@vit.ac.in',
        passwordHash: s2Hash,
        role: ROLES.STUDENT,
        studentId: '25BCE9911',
        department: 'CSE',
        departmentId: cseDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
      createdUserIds.push(student2User.id);
    } else if (student2User.deletedAt) {
      await student2User.restore();
    }
    const s2Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student2.gov@vit.ac.in', password: 'Student2@12345' });
    student2Token = s2Login.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      if (createdAssignmentIds.length > 0) {
        await ExamFacultyAssignment.destroy({ where: { id: createdAssignmentIds }, force: true });
      }
      if (createdResultIds.length > 0) {
        await Result.destroy({ where: { id: createdResultIds }, force: true });
      }
      if (createdExamIds.length > 0) {
        await Result.destroy({ where: { examId: createdExamIds }, force: true });
        await ExamFacultyAssignment.destroy({ where: { examId: createdExamIds }, force: true });
        await Exam.destroy({ where: { id: createdExamIds }, force: true });
      }
      if (createdUserIds.length > 0) {
        await User.destroy({ where: { id: createdUserIds }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  describe('1. Faculty Ownership & Creator Authorization', () => {
    let examA;
    let resultA;

    beforeAll(async () => {
      examA = await Exam.create({
        title: 'Faculty A Operating Systems Exam',
        examCode: `EXAM-GOV-A-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-10',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(examA.id);
    });

    it('1. Faculty creator can create/manage results for own exam', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${examA.id}/results`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({
          studentId: student1User.id,
          marksObtained: 88.5,
          remarks: 'Created by faculty creator',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.examId).toBe(examA.id);
      expect(res.body.data.result.studentId).toBe(student1User.id);
      resultA = res.body.data.result;
      createdResultIds.push(resultA.id);
    });

    it('2. Faculty creator can retrieve own exam results', async () => {
      // By exam ID
      const examRes = await request(app)
        .get(`/api/v1/exams/${examA.id}/results`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(examRes.statusCode).toBe(200);
      expect(examRes.body.success).toBe(true);
      expect(examRes.body.data.items.length).toBeGreaterThanOrEqual(1);

      // By result ID
      const res = await request(app)
        .get(`/api/v1/results/${resultA.id}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.id).toBe(resultA.id);
    });

    it('3. Faculty not owning the exam cannot create results (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${examA.id}/results`)
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({
          studentId: student2User.id,
          marksObtained: 75.0,
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('4. Faculty not owning the exam cannot retrieve results (403 Forbidden)', async () => {
      // By exam list
      const examRes = await request(app)
        .get(`/api/v1/exams/${examA.id}/results`)
        .set('Authorization', `Bearer ${facultyBToken}`);

      expect(examRes.statusCode).toBe(403);
      expect(examRes.body.success).toBe(false);
      expect(examRes.body.error.code).toBe('FORBIDDEN');

      // By result ID
      const res = await request(app)
        .get(`/api/v1/results/${resultA.id}`)
        .set('Authorization', `Bearer ${facultyBToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('5. Faculty not owning the exam cannot transition result status (403 Forbidden)', async () => {
      // Single transition
      const singleRes = await request(app)
        .patch(`/api/v1/results/${resultA.id}/status`)
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(singleRes.statusCode).toBe(403);
      expect(singleRes.body.success).toBe(false);
      expect(singleRes.body.error.code).toBe('FORBIDDEN');

      // Batch transition
      const batchRes = await request(app)
        .patch(`/api/v1/exams/${examA.id}/results/status`)
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(batchRes.statusCode).toBe(403);
      expect(batchRes.body.success).toBe(false);
      expect(batchRes.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. Evaluator Assignment Governance', () => {
    let assignedExam;
    let invigilatorExam;
    let unassignedExam;
    let assignedResult;

    beforeAll(async () => {
      // Exam where Faculty B is EVALUATOR
      assignedExam = await Exam.create({
        title: 'Evaluator Assigned Exam',
        examCode: `EXAM-EVAL-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-15',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(assignedExam.id);

      const evalAssignment = await ExamFacultyAssignment.create({
        examId: assignedExam.id,
        facultyId: facultyBUser.id,
        assignmentRole: 'EVALUATOR',
      });
      createdAssignmentIds.push(evalAssignment.id);

      // Exam where Faculty B is INVIGILATOR only
      invigilatorExam = await Exam.create({
        title: 'Invigilator Only Exam',
        examCode: `EXAM-INVG-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-16',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(invigilatorExam.id);

      const invgAssignment = await ExamFacultyAssignment.create({
        examId: invigilatorExam.id,
        facultyId: facultyBUser.id,
        assignmentRole: 'INVIGILATOR',
      });
      createdAssignmentIds.push(invgAssignment.id);

      // Exam where Faculty B is unassigned
      unassignedExam = await Exam.create({
        title: 'Unassigned Faculty Exam',
        examCode: `EXAM-UNAS-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-17',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(unassignedExam.id);
    });

    it('6. Assigned EVALUATOR can manage results for the exam', async () => {
      // Create result
      const createRes = await request(app)
        .post(`/api/v1/exams/${assignedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({
          studentId: student1User.id,
          marksObtained: 91.0,
          remarks: 'Entered by assigned evaluator',
        });

      expect(createRes.statusCode).toBe(201);
      expect(createRes.body.success).toBe(true);
      assignedResult = createRes.body.data.result;
      createdResultIds.push(assignedResult.id);

      // Retrieve results by exam ID
      const listRes = await request(app)
        .get(`/api/v1/exams/${assignedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyBToken}`);

      expect(listRes.statusCode).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.items.length).toBe(1);

      // Transition result status
      const transRes = await request(app)
        .patch(`/api/v1/results/${assignedResult.id}/status`)
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(transRes.statusCode).toBe(200);
      expect(transRes.body.success).toBe(true);
      expect(transRes.body.data.result.submissionStatus).toBe(RESULT_STATUS.SUBMITTED);
    });

    it('7. INVIGILATOR-only faculty cannot manage/evaluate results (403 Forbidden)', async () => {
      // Attempt to create result
      const createRes = await request(app)
        .post(`/api/v1/exams/${invigilatorExam.id}/results`)
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({
          studentId: student1User.id,
          marksObtained: 80.0,
        });

      expect(createRes.statusCode).toBe(403);
      expect(createRes.body.success).toBe(false);
      expect(createRes.body.error.code).toBe('FORBIDDEN');

      // Attempt to retrieve results
      const listRes = await request(app)
        .get(`/api/v1/exams/${invigilatorExam.id}/results`)
        .set('Authorization', `Bearer ${facultyBToken}`);

      expect(listRes.statusCode).toBe(403);
      expect(listRes.body.success).toBe(false);
      expect(listRes.body.error.code).toBe('FORBIDDEN');
    });

    it('8. Unassigned faculty cannot manage results (403 Forbidden)', async () => {
      // Attempt to create result
      const createRes = await request(app)
        .post(`/api/v1/exams/${unassignedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({
          studentId: student1User.id,
          marksObtained: 80.0,
        });

      expect(createRes.statusCode).toBe(403);
      expect(createRes.body.success).toBe(false);
      expect(createRes.body.error.code).toBe('FORBIDDEN');

      // Attempt to retrieve results
      const listRes = await request(app)
        .get(`/api/v1/exams/${unassignedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyBToken}`);

      expect(listRes.statusCode).toBe(403);
      expect(listRes.body.success).toBe(false);
      expect(listRes.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('3. Department Boundary Isolation', () => {
    let eceExam;
    let eceResult;

    beforeAll(async () => {
      eceExam = await Exam.create({
        title: 'ECE Signals Examination',
        examCode: `EXAM-ECE-${Date.now()}`,
        subjectId: eceSubject.id,
        departmentId: eceDept.id,
        createdBy: facultyECEUser.id,
        examDate: '2026-11-20',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(eceExam.id);

      eceResult = await Result.create({
        examId: eceExam.id,
        studentId: student1User.id,
        facultyId: facultyECEUser.id,
        marksObtained: 77.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      createdResultIds.push(eceResult.id);
    });

    it('9. Faculty from another department cannot create results (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${eceExam.id}/results`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({
          studentId: student2User.id,
          marksObtained: 84.0,
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('10. Faculty from another department cannot retrieve results (403 Forbidden)', async () => {
      // By exam list
      const examRes = await request(app)
        .get(`/api/v1/exams/${eceExam.id}/results`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(examRes.statusCode).toBe(403);
      expect(examRes.body.success).toBe(false);
      expect(examRes.body.error.code).toBe('FORBIDDEN');

      // By result ID
      const res = await request(app)
        .get(`/api/v1/results/${eceResult.id}`)
        .set('Authorization', `Bearer ${facultyAToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('11. Faculty from another department cannot transition results (403 Forbidden)', async () => {
      // Single transition
      const singleRes = await request(app)
        .patch(`/api/v1/results/${eceResult.id}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(singleRes.statusCode).toBe(403);
      expect(singleRes.body.success).toBe(false);
      expect(singleRes.body.error.code).toBe('FORBIDDEN');

      // Batch transition
      const batchRes = await request(app)
        .patch(`/api/v1/exams/${eceExam.id}/results/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(batchRes.statusCode).toBe(403);
      expect(batchRes.body.success).toBe(false);
      expect(batchRes.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4. Administrative Cross-Department Governance', () => {
    let adminManagedExam;
    let adminResult;

    beforeAll(async () => {
      adminManagedExam = await Exam.create({
        title: 'Admin Cross-Dept Exam',
        examCode: `EXAM-ADM-${Date.now()}`,
        subjectId: eceSubject.id,
        departmentId: eceDept.id,
        createdBy: facultyECEUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(adminManagedExam.id);
    });

    it('12. ADMIN can access/manage across departments', async () => {
      // Admin creates result in ECE department exam
      const createRes = await request(app)
        .post(`/api/v1/exams/${adminManagedExam.id}/results`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId: student1User.id,
          marksObtained: 95.0,
          remarks: 'Recorded by Administrator',
        });

      expect(createRes.statusCode).toBe(201);
      expect(createRes.body.success).toBe(true);
      adminResult = createRes.body.data.result;
      createdResultIds.push(adminResult.id);

      // Admin transitions result
      const transRes = await request(app)
        .patch(`/api/v1/results/${adminResult.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(transRes.statusCode).toBe(200);
      expect(transRes.body.success).toBe(true);
      expect(transRes.body.data.result.submissionStatus).toBe(RESULT_STATUS.SUBMITTED);
    });

    it('13. ADMIN can retrieve results regardless of faculty ownership', async () => {
      // By exam ID
      const listRes = await request(app)
        .get(`/api/v1/exams/${adminManagedExam.id}/results`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.statusCode).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.items.length).toBeGreaterThanOrEqual(1);

      // By result ID
      const singleRes = await request(app)
        .get(`/api/v1/results/${adminResult.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(singleRes.statusCode).toBe(200);
      expect(singleRes.body.success).toBe(true);
      expect(singleRes.body.data.result.id).toBe(adminResult.id);
    });
  });

  describe('5. Student Single-Result Privacy & Scoping', () => {
    let studentExam;
    let pubResult1;
    let pubResult2;
    let draftResult1;
    let submittedResult1;
    let underReviewResult1;
    let verifiedResult1;
    let rejectedResult1;

    beforeAll(async () => {
      studentExam = await Exam.create({
        title: 'Student Privacy Verification Exam',
        examCode: `EXAM-STU-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-28',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(studentExam.id);

      // Student 1 PUBLISHED result
      pubResult1 = await Result.create({
        examId: studentExam.id,
        studentId: student1User.id,
        facultyId: facultyAUser.id,
        marksObtained: 89.0,
        maximumMarks: 100,
        grade: 'A',
        submissionStatus: RESULT_STATUS.PUBLISHED,
        publishedAt: new Date(),
      });
      createdResultIds.push(pubResult1.id);

      // Student 2 PUBLISHED result
      pubResult2 = await Result.create({
        examId: studentExam.id,
        studentId: student2User.id,
        facultyId: facultyAUser.id,
        marksObtained: 94.0,
        maximumMarks: 100,
        grade: 'S',
        submissionStatus: RESULT_STATUS.PUBLISHED,
        publishedAt: new Date(),
      });
      createdResultIds.push(pubResult2.id);

      // Separate exams to test interim status privacy for Student 1
      const examDraft = await Exam.create({
        title: 'Interim Draft Exam',
        examCode: `EXAM-DFT-${Date.now()}-1`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-29',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(examDraft.id);

      draftResult1 = await Result.create({
        examId: examDraft.id,
        studentId: student1User.id,
        facultyId: facultyAUser.id,
        marksObtained: 70.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      createdResultIds.push(draftResult1.id);

      const examSubmitted = await Exam.create({
        title: 'Interim Submitted Exam',
        examCode: `EXAM-SUB-${Date.now()}-2`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-29',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(examSubmitted.id);

      submittedResult1 = await Result.create({
        examId: examSubmitted.id,
        studentId: student1User.id,
        facultyId: facultyAUser.id,
        marksObtained: 72.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.SUBMITTED,
        submittedAt: new Date(),
      });
      createdResultIds.push(submittedResult1.id);

      const examUnderReview = await Exam.create({
        title: 'Interim Under Review Exam',
        examCode: `EXAM-REV-${Date.now()}-3`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-29',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(examUnderReview.id);

      underReviewResult1 = await Result.create({
        examId: examUnderReview.id,
        studentId: student1User.id,
        facultyId: facultyAUser.id,
        marksObtained: 74.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.UNDER_REVIEW,
      });
      createdResultIds.push(underReviewResult1.id);

      const examVerified = await Exam.create({
        title: 'Interim Verified Exam',
        examCode: `EXAM-VER-${Date.now()}-4`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-29',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(examVerified.id);

      verifiedResult1 = await Result.create({
        examId: examVerified.id,
        studentId: student1User.id,
        facultyId: facultyAUser.id,
        marksObtained: 76.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.VERIFIED,
        verifiedBy: facultyAUser.id,
        verifiedAt: new Date(),
      });
      createdResultIds.push(verifiedResult1.id);

      const examRejected = await Exam.create({
        title: 'Interim Rejected Exam',
        examCode: `EXAM-REJ-${Date.now()}-5`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-29',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(examRejected.id);

      rejectedResult1 = await Result.create({
        examId: examRejected.id,
        studentId: student1User.id,
        facultyId: facultyAUser.id,
        marksObtained: 78.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.REJECTED,
      });
      createdResultIds.push(rejectedResult1.id);
    });

    it('14. Student can retrieve their own PUBLISHED result', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${pubResult1.id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result.id).toBe(pubResult1.id);
      expect(res.body.data.result.studentId).toBe(student1User.id);
      expect(res.body.data.result.submissionStatus).toBe(RESULT_STATUS.PUBLISHED);
      expect(Number(res.body.data.result.marksObtained)).toBe(89.0);
    });

    it('15. Student cannot retrieve another student\'s result — expect 404', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${pubResult2.id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('16. Student cannot retrieve their own DRAFT result — expect 404', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${draftResult1.id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('17. Student cannot retrieve their own SUBMITTED result — expect 404', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${submittedResult1.id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('18. Student cannot retrieve their own UNDER_REVIEW result — expect 404', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${underReviewResult1.id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('19. Student cannot retrieve their own VERIFIED result — expect 404', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${verifiedResult1.id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('20. Student cannot retrieve their own REJECTED result — expect 404', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${rejectedResult1.id}`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('21. Student exam-list endpoint returns only their own PUBLISHED result', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${studentExam.id}/results`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe(pubResult1.id);
      expect(res.body.data.items[0].student.id).toBe(student1User.id);
      expect(res.body.data.items[0].submissionStatus).toBe(RESULT_STATUS.PUBLISHED);
    });

    it('22. Student cannot manipulate query parameters to retrieve another student\'s result', async () => {
      // Student 1 attempts to pass studentId of Student 2 and request all statuses
      const res = await request(app)
        .get(`/api/v1/exams/${studentExam.id}/results?studentId=${student2User.id}&submissionStatus=DRAFT`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      // Query parameters are overridden: only Student 1's PUBLISHED result is returned
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].student.id).toBe(student1User.id);
      expect(res.body.data.items[0].student.id).not.toBe(student2User.id);
    });
  });

  describe('6. Regression & Immutability Verification', () => {
    let regExam;
    let regResult;

    beforeAll(async () => {
      regExam = await Exam.create({
        title: 'Regression Verification Exam',
        examCode: `EXAM-REG-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyAUser.id,
        examDate: '2026-11-30',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(regExam.id);
    });

    it('23. Existing result creation behavior still works (percentage, grade, audit log)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${regExam.id}/results`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({
          studentId: student1User.id,
          marksObtained: 85.0,
          remarks: 'Regression test evaluation',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      regResult = res.body.data.result;
      createdResultIds.push(regResult.id);

      expect(Number(regResult.marksObtained)).toBe(85.0);
      expect(regResult.grade).toBe('A');
      expect(regResult.percentage).toBe(85.0);
      expect(regResult.submissionStatus).toBe(RESULT_STATUS.DRAFT);

      const audit = await AuditLog.findOne({
        where: {
          entityType: 'Result',
          entityId: regResult.id,
          eventType: 'RESULT_CREATED',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit.performedBy).toBe(facultyAUser.id);
    });

    it('24. Existing lifecycle transitions still work (DRAFT -> SUBMITTED -> UNDER_REVIEW -> VERIFIED)', async () => {
      // DRAFT -> SUBMITTED
      const subRes = await request(app)
        .patch(`/api/v1/results/${regResult.id}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(subRes.statusCode).toBe(200);
      expect(subRes.body.data.result.submissionStatus).toBe(RESULT_STATUS.SUBMITTED);
      expect(subRes.body.data.result.submittedAt).toBeDefined();

      // SUBMITTED -> UNDER_REVIEW
      const revRes = await request(app)
        .patch(`/api/v1/results/${regResult.id}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: RESULT_STATUS.UNDER_REVIEW });

      expect(revRes.statusCode).toBe(200);
      expect(revRes.body.data.result.submissionStatus).toBe(RESULT_STATUS.UNDER_REVIEW);

      // UNDER_REVIEW -> VERIFIED
      const verRes = await request(app)
        .patch(`/api/v1/results/${regResult.id}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: RESULT_STATUS.VERIFIED });

      expect(verRes.statusCode).toBe(200);
      expect(verRes.body.data.result.submissionStatus).toBe(RESULT_STATUS.VERIFIED);
      expect(verRes.body.data.result.verifiedBy).toBe(facultyAUser.id);
      expect(verRes.body.data.result.verifiedAt).toBeDefined();
    });

    it('25. Existing ADMIN publication restriction remains intact', async () => {
      // Faculty attempt to publish fails (403)
      const facPub = await request(app)
        .patch(`/api/v1/results/${regResult.id}/status`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(facPub.statusCode).toBe(403);
      expect(facPub.body.error.code).toBe('FORBIDDEN');

      // Admin legitimately publishes
      const admPub = await request(app)
        .patch(`/api/v1/results/${regResult.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(admPub.statusCode).toBe(200);
      expect(admPub.body.data.result.submissionStatus).toBe(RESULT_STATUS.PUBLISHED);
      expect(admPub.body.data.result.publishedAt).toBeDefined();
    });

    it('26. PUBLISHED remains terminal and immutable', async () => {
      // Attempting any transition out of PUBLISHED status is rejected with 400
      const res = await request(app)
        .patch(`/api/v1/results/${regResult.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.SUBMITTED });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });
});
