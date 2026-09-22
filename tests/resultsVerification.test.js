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
  BlockchainTransaction,
} = require('../src/database/models');
const {
  ROLES,
  EXAM_STATUS,
  RESULT_STATUS,
  ACCOUNT_STATUS,
  BLOCKCHAIN_TX_STATUS,
} = require('../src/utils/constants');
const BlockchainService = require('../src/services/blockchainService');
const { calculateResultHash } = require('../src/modules/results/resultHashUtils');

jest.setTimeout(30000);

describe('Phase 6C: Result Hash Verification & Controlled Verification API', () => {
  let adminToken;
  let creatorFacultyToken;
  let evaluatorFacultyToken;
  let invigilatorFacultyToken;
  let unassignedFacultyToken;
  let crossDeptFacultyToken;
  let student1Token;
  let student2Token;

  let adminUser;
  let creatorFacultyUser;
  let evaluatorFacultyUser;
  let invigilatorFacultyUser;
  let unassignedFacultyUser;
  let crossDeptFacultyUser;
  let student1User;
  let student2User;

  let cseDept;
  let eceDept;
  let cseSubject;

  let creatorExam;
  let evaluatorExam;
  let invigilatorExam;
  let draftExam;
  let submittedExam;
  let underReviewExam;
  let verifiedExam;
  let rejectedExam;
  let anchoredExam;

  let student1PublishedResult;
  let student2PublishedResult;
  let evaluatorResult;
  let invigilatorResult;
  let student1DraftResult;
  let student1SubmittedResult;
  let student1UnderReviewResult;
  let student1VerifiedResult;
  let student1RejectedResult;

  let anchoredResult;
  let anchoredTx;

  const createdExamIds = [];
  const createdResultIds = [];
  const createdUserIds = [];
  const createdTxIds = [];
  const createdAssignmentIds = [];

  beforeAll(async () => {
    const migrate = require('../src/database/migrate');
    await migrate();
    const seed = require('../src/database/seed');
    await seed();

      const passwordHash = await bcrypt.hash('TestPass@12345', 10);

      // 1. Authenticate seeded Admin
      const adminRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@vit.ac.in', password: 'Admin@12345' });
      adminToken = adminRes.body.data.accessToken;
      adminUser = adminRes.body.data.user;

      // 2. Authenticate seeded Faculty (CSE) -> creator
      const creatorRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'faculty@vit.ac.in', password: 'Faculty@12345' });
      creatorFacultyToken = creatorRes.body.data.accessToken;
      creatorFacultyUser = creatorRes.body.data.user;

      // 3. Authenticate seeded Student 1
      const student1Res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'student@vit.ac.in', password: 'Student@12345' });
      student1Token = student1Res.body.data.accessToken;
      student1User = student1Res.body.data.user;

      // 4. Fetch Departments & Subjects
      cseDept = await Department.findOne({ where: { code: 'CSE' } });
      eceDept = await Department.findOne({ where: { code: 'ECE' } });
      cseSubject = await Subject.findOne({ where: { code: 'BACSE350' } });

      // 5. Create Evaluator Faculty (CSE)
      evaluatorFacultyUser = await User.create({
        fullName: 'Prof. Evaluator CSE',
        email: `faculty.evaluator.${Date.now()}@vit.ac.in`,
        passwordHash,
        role: ROLES.FACULTY,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        departmentId: cseDept.id,
        facultyId: `FAC-EVAL-${Date.now()}`,
      });
      createdUserIds.push(evaluatorFacultyUser.id);
      evaluatorFacultyToken = (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: evaluatorFacultyUser.email, password: 'TestPass@12345' })
      ).body.data.accessToken;

      // 6. Create Invigilator Faculty (CSE)
      invigilatorFacultyUser = await User.create({
        fullName: 'Prof. Invigilator CSE',
        email: `faculty.invigilator.${Date.now()}@vit.ac.in`,
        passwordHash,
        role: ROLES.FACULTY,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        departmentId: cseDept.id,
        facultyId: `FAC-INVG-${Date.now()}`,
      });
      createdUserIds.push(invigilatorFacultyUser.id);
      invigilatorFacultyToken = (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: invigilatorFacultyUser.email, password: 'TestPass@12345' })
      ).body.data.accessToken;

      // 7. Create Unassigned Faculty (CSE)
      unassignedFacultyUser = await User.create({
        fullName: 'Prof. Unassigned CSE',
        email: `faculty.unassigned.${Date.now()}@vit.ac.in`,
        passwordHash,
        role: ROLES.FACULTY,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        departmentId: cseDept.id,
        facultyId: `FAC-UNAS-${Date.now()}`,
      });
      createdUserIds.push(unassignedFacultyUser.id);
      unassignedFacultyToken = (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: unassignedFacultyUser.email, password: 'TestPass@12345' })
      ).body.data.accessToken;

      // 8. Create Cross-Department Faculty (ECE)
      crossDeptFacultyUser = await User.create({
        fullName: 'Prof. Cross ECE',
        email: `faculty.ece.${Date.now()}@vit.ac.in`,
        passwordHash,
        role: ROLES.FACULTY,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        departmentId: eceDept.id,
        facultyId: `FAC-ECE-${Date.now()}`,
      });
      createdUserIds.push(crossDeptFacultyUser.id);
      crossDeptFacultyToken = (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: crossDeptFacultyUser.email, password: 'TestPass@12345' })
      ).body.data.accessToken;

      // 9. Create Student 2
      student2User = await User.create({
        fullName: 'Student Two',
        email: `student2.${Date.now()}@vit.ac.in`,
        passwordHash,
        role: ROLES.STUDENT,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        departmentId: cseDept.id,
        studentId: `STU-02-${Date.now()}`,
      });
      createdUserIds.push(student2User.id);
      student2Token = (
        await request(app)
          .post('/api/v1/auth/login')
          .send({ email: student2User.email, password: 'TestPass@12345' })
      ).body.data.accessToken;

      // 10. Create Creator Exam
      creatorExam = await Exam.create({
        title: 'Creator Exam',
        examCode: `EXAM-CREATOR-${Date.now()}-1`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: creatorFacultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(creatorExam.id);

      student1PublishedResult = await Result.create({
        examId: creatorExam.id,
        studentId: student1User.id,
        facultyId: creatorFacultyUser.id,
        marksObtained: 87.5,
        maximumMarks: 100,
        grade: 'A',
        remarks: 'Confidential evaluator remarks for student 1',
        submissionStatus: RESULT_STATUS.PUBLISHED,
        publishedAt: new Date('2026-11-26T12:00:00.000Z'),
      });
      createdResultIds.push(student1PublishedResult.id);

      student2PublishedResult = await Result.create({
        examId: creatorExam.id,
        studentId: student2User.id,
        facultyId: creatorFacultyUser.id,
        marksObtained: 94.0,
        maximumMarks: 100,
        grade: 'S',
        remarks: 'Top score student 2 remarks',
        submissionStatus: RESULT_STATUS.PUBLISHED,
        publishedAt: new Date('2026-11-26T12:00:00.000Z'),
      });
      createdResultIds.push(student2PublishedResult.id);

      // 11. Create Evaluator Exam
      evaluatorExam = await Exam.create({
        title: 'Evaluator Assigned Exam',
        examCode: `EXAM-EVAL-${Date.now()}-2`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: creatorFacultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(evaluatorExam.id);

      const evalAssign = await ExamFacultyAssignment.create({
        examId: evaluatorExam.id,
        facultyId: evaluatorFacultyUser.id,
        assignmentRole: 'EVALUATOR',
      });
      createdAssignmentIds.push(evalAssign.id);

      evaluatorResult = await Result.create({
        examId: evaluatorExam.id,
        studentId: student1User.id,
        facultyId: evaluatorFacultyUser.id,
        marksObtained: 91.0,
        maximumMarks: 100,
        grade: 'S',
        submissionStatus: RESULT_STATUS.PUBLISHED,
        publishedAt: new Date('2026-11-26T12:00:00.000Z'),
      });
      createdResultIds.push(evaluatorResult.id);

      // 12. Create Invigilator Exam
      invigilatorExam = await Exam.create({
        title: 'Invigilator Assigned Exam',
        examCode: `EXAM-INVG-${Date.now()}-3`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: creatorFacultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(invigilatorExam.id);

      const invgAssign = await ExamFacultyAssignment.create({
        examId: invigilatorExam.id,
        facultyId: invigilatorFacultyUser.id,
        assignmentRole: 'INVIGILATOR',
      });
      createdAssignmentIds.push(invgAssign.id);

      invigilatorResult = await Result.create({
        examId: invigilatorExam.id,
        studentId: student1User.id,
        facultyId: creatorFacultyUser.id,
        marksObtained: 85.0,
        maximumMarks: 100,
        grade: 'A',
        submissionStatus: RESULT_STATUS.PUBLISHED,
        publishedAt: new Date('2026-11-26T12:00:00.000Z'),
      });
      createdResultIds.push(invigilatorResult.id);

      // 13. Create Interim Status Exams for Student 1
      draftExam = await Exam.create({
        title: 'Draft Interim Exam',
        examCode: `EXAM-DFT-${Date.now()}-4`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: creatorFacultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(draftExam.id);
      student1DraftResult = await Result.create({
        examId: draftExam.id,
        studentId: student1User.id,
        facultyId: creatorFacultyUser.id,
        marksObtained: 70.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      createdResultIds.push(student1DraftResult.id);

      submittedExam = await Exam.create({
        title: 'Submitted Interim Exam',
        examCode: `EXAM-SUB-${Date.now()}-5`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: creatorFacultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(submittedExam.id);
      student1SubmittedResult = await Result.create({
        examId: submittedExam.id,
        studentId: student1User.id,
        facultyId: creatorFacultyUser.id,
        marksObtained: 72.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.SUBMITTED,
        submittedAt: new Date(),
      });
      createdResultIds.push(student1SubmittedResult.id);

      underReviewExam = await Exam.create({
        title: 'Under Review Interim Exam',
        examCode: `EXAM-REV-${Date.now()}-6`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: creatorFacultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(underReviewExam.id);
      student1UnderReviewResult = await Result.create({
        examId: underReviewExam.id,
        studentId: student1User.id,
        facultyId: creatorFacultyUser.id,
        marksObtained: 74.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.UNDER_REVIEW,
      });
      createdResultIds.push(student1UnderReviewResult.id);

      verifiedExam = await Exam.create({
        title: 'Verified Interim Exam',
        examCode: `EXAM-VER-${Date.now()}-7`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: creatorFacultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(verifiedExam.id);
      student1VerifiedResult = await Result.create({
        examId: verifiedExam.id,
        studentId: student1User.id,
        facultyId: creatorFacultyUser.id,
        marksObtained: 76.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.VERIFIED,
        verifiedBy: creatorFacultyUser.id,
        verifiedAt: new Date(),
      });
      createdResultIds.push(student1VerifiedResult.id);

      rejectedExam = await Exam.create({
        title: 'Rejected Interim Exam',
        examCode: `EXAM-REJ-${Date.now()}-8`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: creatorFacultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(rejectedExam.id);
      student1RejectedResult = await Result.create({
        examId: rejectedExam.id,
        studentId: student1User.id,
        facultyId: creatorFacultyUser.id,
        marksObtained: 60.0,
        maximumMarks: 100,
        grade: 'D',
        submissionStatus: RESULT_STATUS.REJECTED,
      });
      createdResultIds.push(student1RejectedResult.id);

      // 14. Create Anchored Result Exam
      anchoredExam = await Exam.create({
        title: 'Anchored Blockchain Exam',
        examCode: `EXAM-ANC-${Date.now()}-9`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: creatorFacultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(anchoredExam.id);

      anchoredResult = await Result.create({
        examId: anchoredExam.id,
        studentId: student2User.id,
        facultyId: creatorFacultyUser.id,
        marksObtained: 88.0,
        maximumMarks: 100,
        grade: 'A',
        submissionStatus: RESULT_STATUS.PUBLISHED,
        publishedAt: new Date('2026-11-27T10:00:00.000Z'),
        blockchainTransactionId: `tx-hash-anchor-${Date.now()}`,
      });
      createdResultIds.push(anchoredResult.id);

      const anchoredCanonicalHash = calculateResultHash(anchoredResult);

      anchoredTx = await BlockchainTransaction.create({
        txHash: anchoredResult.blockchainTransactionId,
        channelName: 'educhannel',
        chaincodeName: 'education',
        functionName: 'anchorResult',
        payloadHash: anchoredCanonicalHash,
        status: BLOCKCHAIN_TX_STATUS.PENDING,
        metadata: JSON.stringify({ resultId: anchoredResult.id }),
      });
      createdTxIds.push(anchoredTx.id);
  });

  afterAll(async () => {
    try {
      if (createdTxIds.length > 0) {
        await BlockchainTransaction.destroy({ where: { id: createdTxIds } });
      }
      if (createdResultIds.length > 0) {
        await Result.destroy({ where: { id: createdResultIds }, force: true });
      }
      if (createdAssignmentIds.length > 0) {
        await ExamFacultyAssignment.destroy({
          where: { id: createdAssignmentIds },
        });
      }
      if (createdExamIds.length > 0) {
        await Exam.destroy({ where: { id: createdExamIds }, force: true });
      }
      if (createdUserIds.length > 0) {
        await User.destroy({ where: { id: createdUserIds }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  // =========================================================================
  // SUITE 1: Route Registration, Authentication & Format Validation
  // =========================================================================
  describe('1. Route Registration, Authentication & Parameter Validation', () => {
    it('1. Rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app).get(
        `/api/v1/results/${student1PublishedResult.id}/verify`
      );

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('2. Returns 404 for invalid UUID format in result ID', async () => {
      const res = await request(app)
        .get('/api/v1/results/not-a-valid-uuid/verify')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('3. Returns 404 for non-existent result UUID', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .get(`/api/v1/results/${nonExistentId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('4. Does not conflict with GET /api/v1/results/:id', async () => {
      // Direct GET /:id returns the full result with student/faculty objects
      const getRes = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.statusCode).toBe(200);
      expect(getRes.body.data.result).toBeDefined();

      // GET /:id/verify returns verification-specific payload
      const verifyRes = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.body.data.calculatedHash).toBeDefined();
      expect(verifyRes.body.data.blockchain).toBeDefined();
    });

    it('4a. Returns 422 for invalid expectedHash length (e.g. 10 chars or 63 chars)', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify?expectedHash=abc123short`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'expectedHash')).toBe(true);
    });

    it('4b. Returns 422 for non-hex characters in expectedHash', async () => {
      const invalidHex = 'z'.repeat(64);
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify?expectedHash=${invalidHex}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'expectedHash')).toBe(true);
    });

    it('4c. Returns 422 for array / multiple expectedHash query parameters', async () => {
      const hash1 = 'a'.repeat(64);
      const hash2 = 'b'.repeat(64);
      const res = await request(app)
        .get(
          `/api/v1/results/${student1PublishedResult.id}/verify?expectedHash=${hash1}&expectedHash=${hash2}`
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'expectedHash')).toBe(true);
    });

    it('4d. Returns 422 for invalid hash alias query parameter', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify?hash=not-a-valid-hash`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.some((d) => d.field === 'hash')).toBe(true);
    });

    it('4e. Accepts valid uppercase hexadecimal expectedHash and normalizes successfully', async () => {
      const expectedHash = calculateResultHash(student1PublishedResult);
      const uppercaseHash = expectedHash.toUpperCase();

      const res = await request(app)
        .get(
          `/api/v1/results/${student1PublishedResult.id}/verify?expectedHash=${uppercaseHash}`
        )
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isMatch).toBe(true);
      expect(res.body.data.expectedHash).toBe(expectedHash.toLowerCase());
    });
  });


  // =========================================================================
  // SUITE 2: Role-Based Authorization & Governance Enforcement
  // =========================================================================
  describe('2. Role-Based Access Control & Governance Enforcement', () => {
    it('5. ADMIN can verify any valid result (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resultId).toBe(student1PublishedResult.id);
      expect(res.body.data.calculatedHash).toBeDefined();
    });

    it('6. Authorized faculty (exam creator) can verify results for their exam (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${creatorFacultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resultId).toBe(student1PublishedResult.id);
      expect(res.body.data.calculatedHash).toBeDefined();
    });

    it('7. Authorized faculty (assigned EVALUATOR) can verify results (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${evaluatorResult.id}/verify`)
        .set('Authorization', `Bearer ${evaluatorFacultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resultId).toBe(evaluatorResult.id);
      expect(res.body.data.calculatedHash).toBeDefined();
    });

    it('8. Unauthorized faculty (same dept, neither creator nor evaluator) is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${unassignedFacultyToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('9. Unauthorized faculty (assigned INVIGILATOR only) is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${invigilatorResult.id}/verify`)
        .set('Authorization', `Bearer ${invigilatorFacultyToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('10. Cross-department faculty (ECE) is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${crossDeptFacultyToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // SUITE 3: Student Privacy & Scoping (IDOR & Unpublished Protection)
  // =========================================================================
  describe('3. Student Single-Result Privacy, IDOR & Unpublished Protection', () => {
    it('11. Student can verify their own PUBLISHED result (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resultId).toBe(student1PublishedResult.id);
      expect(res.body.data.submissionStatus).toBe(RESULT_STATUS.PUBLISHED);
      expect(res.body.data.calculatedHash).toBeDefined();
    });

    it("12. Student cannot verify another student's result — returns 404 Not Found (IDOR protection)", async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student2PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('13. Student cannot verify their own DRAFT result — returns 404 Not Found', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1DraftResult.id}/verify`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('14. Student cannot verify their own SUBMITTED result — returns 404 Not Found', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1SubmittedResult.id}/verify`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('15. Student cannot verify their own UNDER_REVIEW result — returns 404 Not Found', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1UnderReviewResult.id}/verify`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('16. Student cannot verify their own VERIFIED result — returns 404 Not Found', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1VerifiedResult.id}/verify`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('17. Student cannot verify their own REJECTED result — returns 404 Not Found', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1RejectedResult.id}/verify`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('18. ADMIN can verify unpublished result (e.g. VERIFIED) — returns calculated hash with publishedAt: null', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1VerifiedResult.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resultId).toBe(student1VerifiedResult.id);
      expect(res.body.data.submissionStatus).toBe(RESULT_STATUS.VERIFIED);
      expect(res.body.data.calculatedHash).toMatch(/^[a-f0-9]{64}$/i);
      expect(res.body.data.canonicalPayload.publishedAt).toBeNull();
    });
  });

  // =========================================================================
  // SUITE 4: Deterministic Canonical Hashing & Tamper Detection
  // =========================================================================
  describe('4. Canonical Hash Verification & Tamper Detection', () => {
    it('19. Verifying without expectedHash when not anchored returns calculatedHash with status DISABLED', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.calculatedHash).toMatch(/^[a-f0-9]{64}$/i);
      expect(res.body.data.expectedHash).toBeNull();
      expect(res.body.data.isMatch).toBe(false);
      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.status).toBe('DISABLED');
      expect(res.body.data.message).toContain('Hyperledger Fabric is disabled');
    });

    it('20. Unanchored result with matching caller expectedHash returns DISABLED without claiming VERIFIED', async () => {
      const expectedHash = calculateResultHash(student1PublishedResult);

      const res = await request(app)
        .get(
          `/api/v1/results/${student1PublishedResult.id}/verify?expectedHash=${expectedHash}`
        )
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isMatch).toBe(true);
      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.status).toBe('DISABLED');
      expect(res.body.data.calculatedHash).toBe(expectedHash);
      expect(res.body.data.expectedHash).toBe(expectedHash);
      expect(res.body.data.message).toContain('result is not anchored');
      expect(res.body.data.blockchain.enabled).toBe(false);
      expect(res.body.data.blockchain.committed).toBe(false);
    });

    it('21. Mismatched expectedHash via query parameter produces MISMATCH', async () => {
      const bogusHash =
        '1111111111111111111111111111111111111111111111111111111111111111';

      const res = await request(app)
        .get(
          `/api/v1/results/${student1PublishedResult.id}/verify?expectedHash=${bogusHash}`
        )
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isMatch).toBe(false);
      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.status).toBe('MISMATCH');
      expect(res.body.data.expectedHash).toBe(bogusHash);
      expect(res.body.data.calculatedHash).not.toBe(bogusHash);
      expect(res.body.data.message).toContain('does not match');
    });

    it('22. Supports ?hash= query parameter alias for expectedHash on unanchored result', async () => {
      const expectedHash = calculateResultHash(student1PublishedResult);

      const res = await request(app)
        .get(
          `/api/v1/results/${student1PublishedResult.id}/verify?hash=${expectedHash}`
        )
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.isMatch).toBe(true);
      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.status).toBe('DISABLED');
    });


    it('23. Tampered result in database produces a MISMATCH against original hash', async () => {
      // 1. Compute pristine hash for Student 2's published result
      const pristineHash = calculateResultHash(student2PublishedResult);

      // 2. Maliciously modify marks in database directly
      const originalMarks = student2PublishedResult.marksObtained;
      student2PublishedResult.marksObtained = 99.9;
      await student2PublishedResult.save();

      // 3. Verify against the original pristine hash
      const res = await request(app)
        .get(
          `/api/v1/results/${student2PublishedResult.id}/verify?expectedHash=${pristineHash}`
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.isMatch).toBe(false);
      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.status).toBe('MISMATCH');
      expect(res.body.data.expectedHash).toBe(pristineHash);
      expect(res.body.data.calculatedHash).not.toBe(pristineHash);

      // Restore marks
      student2PublishedResult.marksObtained = originalMarks;
      await student2PublishedResult.save();
    });
  });

  // =========================================================================
  // SUITE 5: Anchored Transaction Verification, Separation & Disabled Mode
  // =========================================================================
  describe('5. Anchored Transaction Verification & Separation of Hashes', () => {
    it('24. Automatically uses anchored BlockchainTransaction.payloadHash as expectedHash', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${anchoredResult.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isMatch).toBe(true);
      expect(res.body.data.verified).toBe(true);
      expect(res.body.data.status).toBe('VERIFIED');
      expect(res.body.data.expectedHash).toBe(anchoredTx.payloadHash);
      expect(res.body.data.calculatedHash).toBe(anchoredTx.payloadHash);
    });

    it('25. Strictly separates payloadHash from txHash (never compares against txHash)', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${anchoredResult.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      const data = res.body.data;

      // payloadHash and txHash must be distinct strings
      expect(data.blockchain.txHash).toBe(anchoredResult.blockchainTransactionId);
      expect(data.blockchain.payloadHash).toBe(anchoredTx.payloadHash);
      expect(data.blockchain.txHash).not.toBe(data.blockchain.payloadHash);

      // calculatedHash must match payloadHash, NOT txHash
      expect(data.calculatedHash).toBe(data.blockchain.payloadHash);
      expect(data.calculatedHash).not.toBe(data.blockchain.txHash);
      expect(data.expectedHash).toBe(data.blockchain.payloadHash);
      expect(data.expectedHash).not.toBe(data.blockchain.txHash);
    });

    it('26. Fabric-disabled mode never claims blockchain commitment', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${anchoredResult.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      const bc = res.body.data.blockchain;

      expect(bc.enabled).toBe(false);
      expect(bc.committed).toBe(false);
      expect(bc.status).not.toBe('COMMITTED');
      expect(bc.message).toContain('Hyperledger Fabric is disabled');
    });

    it('26a. Trusted stored payloadHash cannot be overridden by conflicting caller expectedHash', async () => {
      const conflictingHash = 'f'.repeat(64);
      const res = await request(app)
        .get(
          `/api/v1/results/${anchoredResult.id}/verify?expectedHash=${conflictingHash}`
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isMatch).toBe(false);
      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.status).toBe('MISMATCH');
      expect(res.body.data.expectedHash).toBe(anchoredTx.payloadHash);
      expect(res.body.data.message).toContain('conflicts with trusted blockchain anchor');
    });

    it('26b. Tampered result with caller-supplied tampered hash cannot bypass tamper detection', async () => {
      // 1. Maliciously modify marks of anchored result
      const originalMarks = anchoredResult.marksObtained;
      try {
        anchoredResult.marksObtained = 99.5;
        await anchoredResult.save();

        // 2. Compute the tampered hash
        const tamperedHash = calculateResultHash(anchoredResult);

        // 3. Caller supplies the tampered hash, attempting to make it appear VERIFIED
        const res = await request(app)
          .get(
            `/api/v1/results/${anchoredResult.id}/verify?expectedHash=${tamperedHash}`
          )
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.data.isMatch).toBe(false);
        expect(res.body.data.verified).toBe(false);
        expect(res.body.data.tamperDetected).toBe(true);
        expect(res.body.data.status).toBe('MISMATCH');
        expect(res.body.data.calculatedHash).toBe(tamperedHash);
        expect(res.body.data.expectedHash).toBe(anchoredTx.payloadHash);
        expect(res.body.data.message).toContain('Tamper detected');
      } finally {
        // 4. Restore original marks
        anchoredResult.marksObtained = originalMarks;
        await anchoredResult.save();
      }
    });

    it('26c. Anchored result with matching caller expectedHash returns VERIFIED', async () => {
      const res = await request(app)
        .get(
          `/api/v1/results/${anchoredResult.id}/verify?expectedHash=${anchoredTx.payloadHash}`
        )
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isMatch).toBe(true);
      expect(res.body.data.verified).toBe(true);
      expect(res.body.data.status).toBe('VERIFIED');
      expect(res.body.data.expectedHash).toBe(anchoredTx.payloadHash);
      expect(res.body.data.calculatedHash).toBe(anchoredTx.payloadHash);
    });
  });


  // =========================================================================
  // SUITE 6: Database Immutability & PII Protection
  // =========================================================================
  describe('6. Zero Database Side-Effects & PII Sanitization', () => {
    it('27. Verification creates ZERO BlockchainTransaction records', async () => {
      const countBefore = await BlockchainTransaction.count();

      await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      await request(app)
        .get(
          `/api/v1/results/${student1PublishedResult.id}/verify?expectedHash=${calculateResultHash(
            student1PublishedResult
          )}`
        )
        .set('Authorization', `Bearer ${student1Token}`);

      const countAfter = await BlockchainTransaction.count();
      expect(countAfter).toBe(countBefore);
    });

    it('28. Verification does NOT modify result submissionStatus or any database fields', async () => {
      const beforeResult = await Result.findByPk(student1PublishedResult.id);
      const statusBefore = beforeResult.submissionStatus;
      const updatedAtBefore = beforeResult.updatedAt;

      await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${student1Token}`);

      const afterResult = await Result.findByPk(student1PublishedResult.id);
      expect(afterResult.submissionStatus).toBe(statusBefore);
      expect(afterResult.updatedAt.getTime()).toBe(updatedAtBefore.getTime());
    });

    it('29. Verification response sanitizes and excludes sensitive student PII', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${student1PublishedResult.id}/verify`)
        .set('Authorization', `Bearer ${student1Token}`);

      expect(res.statusCode).toBe(200);
      const data = res.body.data;

      // PII must NOT be present in verification data
      expect(data.fullName).toBeUndefined();
      expect(data.email).toBeUndefined();
      expect(data.student).toBeUndefined();
      expect(data.faculty).toBeUndefined();
      expect(data.remarks).toBeUndefined();
      expect(data.studentId).toBeUndefined();

      // Canonical payload must not contain sensitive fields
      expect(data.canonicalPayload.fullName).toBeUndefined();
      expect(data.canonicalPayload.email).toBeUndefined();
      expect(data.canonicalPayload.remarks).toBeUndefined();
      expect(data.canonicalPayload.studentId).toBeUndefined();
    });
  });
});
