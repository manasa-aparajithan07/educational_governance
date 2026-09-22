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
const { ROLES, EXAM_STATUS, ACCOUNT_STATUS } = require('../src/utils/constants');
const HashingService = require('../src/services/hashingService');

jest.setTimeout(30000);

describe('Phase 5A: Evaluation & Marks Entry Foundation', () => {
  let adminToken;
  let facultyToken;
  let studentToken;

  let adminUser;
  let facultyUser;
  let studentUser1;
  let studentUser2;
  let studentUser3;
  let nonStudentFaculty;

  let cseDept;
  let cseSubject;

  let ongoingExam;
  let completedExam;
  let draftExam;
  let scheduledExam;
  let cancelledExam;
  let customMaxMarksExam;

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

    // 5. Create additional Student 2 and Student 3 for batch testing
    const saltRounds = 10;
    const stdPasswordHash = await bcrypt.hash('Student@12345', saltRounds);

    studentUser2 = await User.findOne({ where: { email: 'student2.test@vit.ac.in' }, paranoid: false });
    if (!studentUser2) {
      studentUser2 = await User.create({
        fullName: 'Rahul Sharma',
        email: 'student2.test@vit.ac.in',
        passwordHash: stdPasswordHash,
        role: ROLES.STUDENT,
        studentId: '25BCE5991',
        department: 'CSE',
        departmentId: cseDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
      createdUserIds.push(studentUser2.id);
    } else if (studentUser2.deletedAt) {
      await studentUser2.restore();
    }

    studentUser3 = await User.findOne({ where: { email: 'student3.test@vit.ac.in' }, paranoid: false });
    if (!studentUser3) {
      studentUser3 = await User.create({
        fullName: 'Pooja Verma',
        email: 'student3.test@vit.ac.in',
        passwordHash: stdPasswordHash,
        role: ROLES.STUDENT,
        studentId: '25BCE5992',
        department: 'CSE',
        departmentId: cseDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
      createdUserIds.push(studentUser3.id);
    } else if (studentUser3.deletedAt) {
      await studentUser3.restore();
    }

    // 6. Create a secondary Faculty member to test non-student rejection
    nonStudentFaculty = await User.findOne({ where: { email: 'faculty.peer@vit.ac.in' }, paranoid: false });
    if (!nonStudentFaculty) {
      const peerHash = await bcrypt.hash('Faculty@12345', saltRounds);
      nonStudentFaculty = await User.create({
        fullName: 'Dr. Peer Evaluator',
        email: 'faculty.peer@vit.ac.in',
        passwordHash: peerHash,
        role: ROLES.FACULTY,
        facultyId: 'FAC-PEER-01',
        department: 'CSE',
        departmentId: cseDept.id,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      });
      createdUserIds.push(nonStudentFaculty.id);
    } else if (nonStudentFaculty.deletedAt) {
      await nonStudentFaculty.restore();
    }

    // 7. Create Exams in different statuses for evaluation tests
    // COMPLETED exam (standard 100 marks)
    completedExam = await Exam.create({
      title: 'Operating Systems Final Evaluation Exam',
      examCode: `EXAM-COMP-${Date.now()}`,
      subjectId: cseSubject.id,
      departmentId: cseDept.id,
      createdBy: facultyUser.id,
      examDate: '2026-10-10',
      duration: 180,
      maximumMarks: 100,
      status: EXAM_STATUS.COMPLETED,
    });
    createdExamIds.push(completedExam.id);

    // ONGOING exam (standard 100 marks)
    ongoingExam = await Exam.create({
      title: 'Database Systems Midterm Exam',
      examCode: `EXAM-ONG-${Date.now()}`,
      subjectId: cseSubject.id,
      departmentId: cseDept.id,
      createdBy: facultyUser.id,
      examDate: '2026-10-12',
      duration: 120,
      maximumMarks: 100,
      status: EXAM_STATUS.ONGOING,
    });
    createdExamIds.push(ongoingExam.id);

    // DRAFT exam
    draftExam = await Exam.create({
      title: 'Draft Exam Not Yet Conducted',
      examCode: `EXAM-DFT-${Date.now()}`,
      subjectId: cseSubject.id,
      departmentId: cseDept.id,
      createdBy: facultyUser.id,
      examDate: '2026-11-01',
      duration: 120,
      maximumMarks: 100,
      status: EXAM_STATUS.DRAFT,
    });
    createdExamIds.push(draftExam.id);

    // SCHEDULED exam
    scheduledExam = await Exam.create({
      title: 'Scheduled Future Exam',
      examCode: `EXAM-SCH-${Date.now()}`,
      subjectId: cseSubject.id,
      departmentId: cseDept.id,
      createdBy: facultyUser.id,
      examDate: '2026-11-15',
      duration: 120,
      maximumMarks: 100,
      status: EXAM_STATUS.SCHEDULED,
    });
    createdExamIds.push(scheduledExam.id);

    // CANCELLED exam
    cancelledExam = await Exam.create({
      title: 'Cancelled Test Exam',
      examCode: `EXAM-CNC-${Date.now()}`,
      subjectId: cseSubject.id,
      departmentId: cseDept.id,
      createdBy: facultyUser.id,
      examDate: '2026-10-01',
      duration: 120,
      maximumMarks: 100,
      status: EXAM_STATUS.CANCELLED,
    });
    createdExamIds.push(cancelledExam.id);

    // Exam with custom maximumMarks (50 marks)
    customMaxMarksExam = await Exam.create({
      title: 'Discrete Mathematics Quiz (50 Marks)',
      examCode: `EXAM-QZ50-${Date.now()}`,
      subjectId: cseSubject.id,
      departmentId: cseDept.id,
      createdBy: facultyUser.id,
      examDate: '2026-10-14',
      duration: 60,
      maximumMarks: 50,
      status: EXAM_STATUS.COMPLETED,
    });
    createdExamIds.push(customMaxMarksExam.id);
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

  describe('1. Single Result Creation (POST /api/v1/exams/:examId/results)', () => {
    it('1. Successfully records single result for an examinee on COMPLETED exam', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${completedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser1.id,
          marksObtained: 88.5,
          remarks: 'Good analytical answers in Section B',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result).toBeDefined();

      const { result } = res.body.data;
      createdResultIds.push(result.id);

      expect(result.examId).toBe(completedExam.id);
      expect(result.studentId).toBe(studentUser1.id);
      expect(Number(result.marksObtained)).toBe(88.5);
      expect(Number(result.maximumMarks)).toBe(100);
      expect(result.percentage).toBe(88.5);
      expect(result.grade).toBe('A');
      expect(result.remarks).toBe('Good analytical answers in Section B');
      expect(result.submissionStatus).toBe('DRAFT');
    });

    it('2. Successfully records single result on ONGOING exam', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${ongoingExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser1.id,
          marksObtained: 94,
        });

      expect(res.statusCode).toBe(201);
      const { result } = res.body.data;
      createdResultIds.push(result.id);

      expect(result.examId).toBe(ongoingExam.id);
      expect(result.percentage).toBe(94);
      expect(result.grade).toBe('S');
    });

    it('3. Respects decimal precision up to 2 places (DECIMAL(6,2))', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${completedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser2.id,
          marksObtained: 72.75,
        });

      expect(res.statusCode).toBe(201);
      const { result } = res.body.data;
      createdResultIds.push(result.id);

      expect(Number(result.marksObtained)).toBe(72.75);
      expect(result.percentage).toBe(72.75);
      expect(result.grade).toBe('B');
    });

    it('4. Rejects marks with more than 2 decimal places (422)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${completedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser3.id,
          marksObtained: 72.125,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('5. Percentage and Grade calculated correctly for custom maximumMarks (50 marks)', async () => {
      // 45 out of 50 = 90.00% -> Grade 'S'
      const res = await request(app)
        .post(`/api/v1/exams/${customMaxMarksExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser1.id,
          marksObtained: 45,
        });

      expect(res.statusCode).toBe(201);
      const { result } = res.body.data;
      createdResultIds.push(result.id);

      expect(Number(result.maximumMarks)).toBe(50);
      expect(result.percentage).toBe(90);
      expect(result.grade).toBe('S');
    });
  });

  describe('2. Validation & Edge Cases', () => {
    it('6. Rejects marks below 0 (422 Validation Error)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${completedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser3.id,
          marksObtained: -10,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('7. Rejects marks exceeding exam.maximumMarks (422 Validation Error)', async () => {
      // customMaxMarksExam has maximumMarks = 50
      const res = await request(app)
        .post(`/api/v1/exams/${customMaxMarksExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser2.id,
          marksObtained: 55, // exceeds 50
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('8. Rejects non-student user in studentId field (422)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${completedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: nonStudentFaculty.id, // Role is FACULTY, not STUDENT
          marksObtained: 85,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('9. Rejects invalid student UUID format (422)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${completedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: 'not-a-valid-uuid',
          marksObtained: 85,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('10. Rejects invalid exam UUID format (422)', async () => {
      const res = await request(app)
        .post('/api/v1/exams/not-a-valid-uuid/results')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser3.id,
          marksObtained: 85,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('11. Rejects missing exam reference (404 Not Found)', async () => {
      const nonExistentExamId = '99999999-9999-4999-9999-999999999999';
      const res = await request(app)
        .post(`/api/v1/exams/${nonExistentExamId}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser3.id,
          marksObtained: 85,
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('12. Rejects duplicate result for the same exam and student (409 Conflict)', async () => {
      // studentUser1 already has a result for completedExam from Test 1
      const res = await request(app)
        .post(`/api/v1/exams/${completedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser1.id,
          marksObtained: 92,
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_RESULT');
    });
  });

  describe('3. Exam Status Prerequisites', () => {
    it('13. Rejects evaluation on DRAFT exam (400 Bad Request)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${draftExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser1.id,
          marksObtained: 80,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_EXAM_STATUS');
    });

    it('14. Rejects evaluation on SCHEDULED exam (400 Bad Request)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${scheduledExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser1.id,
          marksObtained: 80,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_EXAM_STATUS');
    });

    it('15. Rejects evaluation on CANCELLED exam (400 Bad Request)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${cancelledExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser1.id,
          marksObtained: 80,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_EXAM_STATUS');
    });
  });

  describe('4. Batch Result Entry (POST /api/v1/exams/:examId/results/batch)', () => {
    let batchExam;

    beforeAll(async () => {
      batchExam = await Exam.create({
        title: 'Batch Evaluation Test Exam',
        examCode: `EXAM-BATCH-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-10-18',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(batchExam.id);
    });

    it('16. Successfully creates batch results in atomic transaction', async () => {
      const payload = {
        results: [
          {
            studentId: studentUser1.id,
            marksObtained: 92.5,
            remarks: 'Exceptional answers',
          },
          {
            studentId: studentUser2.id,
            marksObtained: 68.0,
            remarks: 'Satisfactory',
          },
        ],
      };

      const res = await request(app)
        .post(`/api/v1/exams/${batchExam.id}/results/batch`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send(payload);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(2);
      expect(res.body.data.results).toHaveLength(2);

      const [r1, r2] = res.body.data.results;
      createdResultIds.push(r1.id, r2.id);

      expect(r1.percentage).toBe(92.5);
      expect(r1.grade).toBe('S');
      expect(r2.percentage).toBe(68);
      expect(r2.grade).toBe('C');
    });

    it('17. Rejects batch if payload contains duplicate student IDs', async () => {
      const payload = {
        results: [
          { studentId: studentUser3.id, marksObtained: 75 },
          { studentId: studentUser3.id, marksObtained: 80 },
        ],
      };

      const res = await request(app)
        .post(`/api/v1/exams/${batchExam.id}/results/batch`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send(payload);

      expect(res.statusCode).toBe(422);
    });

    it('18. Rejects batch and performs atomic rollback when one item is invalid', async () => {
      // Create a fresh exam to verify rollback
      const rollbackExam = await Exam.create({
        title: 'Rollback Verification Exam',
        examCode: `EXAM-RB-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-10-19',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(rollbackExam.id);

      const payload = {
        results: [
          { studentId: studentUser1.id, marksObtained: 85 },
          { studentId: studentUser2.id, marksObtained: 150 }, // Exceeds 100!
        ],
      };

      const res = await request(app)
        .post(`/api/v1/exams/${rollbackExam.id}/results/batch`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send(payload);

      expect(res.statusCode).toBe(422);

      // Verify atomic rollback: neither result was committed
      const storedResults = await Result.findAll({
        where: { examId: rollbackExam.id },
      });
      expect(storedResults).toHaveLength(0);
    });
  });

  describe('5. Result Retrieval (GET /api/v1/results/:id & GET /api/v1/exams/:examId/results)', () => {
    let testResult;

    beforeAll(async () => {
      testResult = await Result.create({
        examId: completedExam.id,
        studentId: studentUser3.id,
        facultyId: facultyUser.id,
        marksObtained: 78.5,
        maximumMarks: completedExam.maximumMarks,
        grade: 'B',
        remarks: 'Consistent performance',
        submissionStatus: 'DRAFT',
      });
      createdResultIds.push(testResult.id);
    });

    it('19. Retrieves a single result by ID with associations and computed percentage', async () => {
      const res = await request(app)
        .get(`/api/v1/results/${testResult.id}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      const { result } = res.body.data;

      expect(result.id).toBe(testResult.id);
      expect(Number(result.marksObtained)).toBe(78.5);
      expect(result.percentage).toBe(78.5);
      expect(result.grade).toBe('B');
      expect(result.exam).toBeDefined();
      expect(result.exam.id).toBe(completedExam.id);
      expect(result.student).toBeDefined();
      expect(result.student.id).toBe(studentUser3.id);
      expect(result.faculty).toBeDefined();
      expect(result.faculty.id).toBe(facultyUser.id);
    });

    it('20. Returns 404 for non-existent result ID', async () => {
      const nonExistentId = '11111111-2222-4333-8444-555555555555';
      const res = await request(app)
        .get(`/api/v1/results/${nonExistentId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('21. Retrieves paginated results for an examination', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${completedExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.pagination).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);

      const first = res.body.data.items[0];
      expect(first.percentage).toBeDefined();
      expect(first.grade).toBeDefined();
      expect(first.student).toBeDefined();
    });

    it('22. Returns 404 when listing results for a non-existent examination', async () => {
      const nonExistentExamId = '99999999-9999-4999-9999-999999999999';
      const res = await request(app)
        .get(`/api/v1/exams/${nonExistentExamId}/results`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('6. Cryptographic Audit Logging', () => {
    it('23. Verifies RESULT_CREATED audit log event with SHA-256 recordHash', async () => {
      // Create another completed exam to capture a pristine audit log event
      const auditExam = await Exam.create({
        title: 'Audit Verification Exam',
        examCode: `EXAM-AUD-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-10-20',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(auditExam.id);

      const res = await request(app)
        .post(`/api/v1/exams/${auditExam.id}/results`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({
          studentId: studentUser1.id,
          marksObtained: 82.5,
        });

      expect(res.statusCode).toBe(201);
      const createdResult = res.body.data.result;
      createdResultIds.push(createdResult.id);

      // Verify AuditLog record in database
      const auditEntry = await AuditLog.findOne({
        where: {
          entityType: 'Result',
          entityId: createdResult.id,
          eventType: 'RESULT_CREATED',
        },
      });

      expect(auditEntry).not.toBeNull();
      expect(auditEntry.performedBy).toBe(facultyUser.id);
      expect(auditEntry.recordHash).toBeDefined();
      expect(auditEntry.recordHash).toHaveLength(64); // 64-char SHA-256 hex string
      expect(HashingService.hashData).toBeDefined();
    });
  });
});
