'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const request = require('supertest');
const app = require('../src/app');
const {
  sequelize,
  User,
  Department,
  Subject,
  Exam,
  QuestionPaper,
} = require('../src/database/models');
const fileStorageService = require('../src/services/fileStorageService');
const HashingService = require('../src/services/hashingService');
const { EXAM_STATUS } = require('../src/utils/constants');

jest.setTimeout(30000);

describe('Phase 4A: Question Paper Foundation, Upload & Retrieval', () => {
  let adminToken;
  let facultyToken;
  let studentToken;
  let facultyUser;
  let testDepartment;
  let testSubject;
  let testExam1;
  let testExam2;
  let uploadedPaperId;

  const createdExamIds = [];
  const createdPaperIds = [];
  const uploadedFilesToCleanup = [];

  const samplePdfContent = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Title (Blockchain Midterm Examination Paper) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );
  const samplePdfHash = crypto
    .createHash('sha256')
    .update(samplePdfContent)
    .digest('hex');

  const sampleDocxContent = Buffer.from(
    'PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00DOCX-SAMPLE-CONTENT-FOR-TESTING'
  );
  const sampleDocxHash = crypto
    .createHash('sha256')
    .update(sampleDocxContent)
    .digest('hex');

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

    // 5. Create test exams for question paper upload
    testExam1 = await Exam.create({
      title: 'Blockchain Architecture Midterm Paper',
      examCode: `EXAM-QP-TEST-1-${Date.now()}`,
      subjectId: testSubject.id,
      departmentId: testDepartment.id,
      createdBy: facultyUser.id,
      examDate: '2026-11-15',
      duration: 180,
      maximumMarks: 100,
      status: EXAM_STATUS.DRAFT,
    });
    createdExamIds.push(testExam1.id);

    testExam2 = await Exam.create({
      title: 'Distributed Systems Final Paper',
      examCode: `EXAM-QP-TEST-2-${Date.now()}`,
      subjectId: testSubject.id,
      departmentId: testDepartment.id,
      createdBy: facultyUser.id,
      examDate: '2026-11-20',
      duration: 180,
      maximumMarks: 100,
      status: EXAM_STATUS.SCHEDULED,
    });
    createdExamIds.push(testExam2.id);
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
      for (const fileKey of uploadedFilesToCleanup) {
        fileStorageService.deleteFile(fileKey);
      }
      if (createdExamIds.length > 0) {
        await Exam.destroy({ where: { id: createdExamIds }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  describe('1. Question Paper Upload (POST /api/v1/exams/:examId/question-paper)', () => {
    it('should successfully upload a PDF question paper by Faculty (201 Created)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${testExam1.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', samplePdfContent, 'midterm-paper.pdf');

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('successfully');
      expect(res.body.data.questionPaper).toBeDefined();

      const paper = res.body.data.questionPaper;
      uploadedPaperId = paper.id;
      createdPaperIds.push(paper.id);
      uploadedFilesToCleanup.push(paper.filePathOrStorageKey);

      expect(paper.id).toBeDefined();
      expect(paper.examId).toBe(testExam1.id);
      expect(paper.fileName).toBe('midterm-paper.pdf');
      expect(paper.mimeType).toBe('application/pdf');
      expect(Number(paper.fileSize)).toBe(samplePdfContent.length);
      expect(paper.sha256Hash).toBe(samplePdfHash);
      expect(paper.sha256Hash).toMatch(/^[a-f0-9]{64}$/i);
      expect(paper.uploadedBy).toBe(facultyUser.id);
      expect(paper.verificationStatus).toBe('NOT_VERIFIED');

      // Verify file exists on disk
      expect(fileStorageService.fileExists(paper.filePathOrStorageKey)).toBe(true);
    });

    it('should successfully upload a DOCX question paper by Admin (201 Created)', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${testExam2.id}/question-paper`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', sampleDocxContent, 'final-exam.docx');

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionPaper).toBeDefined();

      const paper = res.body.data.questionPaper;
      createdPaperIds.push(paper.id);
      uploadedFilesToCleanup.push(paper.filePathOrStorageKey);

      expect(paper.fileName).toBe('final-exam.docx');
      expect(paper.sha256Hash).toBe(sampleDocxHash);
      expect(fileStorageService.fileExists(paper.filePathOrStorageKey)).toBe(true);
    });

    it('should reject accidental duplicate upload for the same exam (409 Conflict)', async () => {
      const duplicateContent = Buffer.from('%PDF-1.4\nDuplicate exam paper content');
      const res = await request(app)
        .post(`/api/v1/exams/${testExam1.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', duplicateContent, 'duplicate-paper.pdf');

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('QUESTION_PAPER_ALREADY_EXISTS');
      expect(res.body.message).toContain('already exists');
    });

    it('should reject file upload with invalid MIME type / extension (422)', async () => {
      const mimeExam = await Exam.create({
        title: 'MIME Test Exam',
        examCode: `EXAM-MIME-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-21',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(mimeExam.id);

      const textContent = Buffer.from('Plain text question content');
      const res = await request(app)
        .post(`/api/v1/exams/${mimeExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', textContent, 'questions.txt');

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('Only PDF');
    });

    it('should reject file upload when executable is disguised (422)', async () => {
      const exeExam = await Exam.create({
        title: 'Exe Disguise Test Exam',
        examCode: `EXAM-EXE-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-22',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(exeExam.id);

      const exeContent = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
      const res = await request(app)
        .post(`/api/v1/exams/${exeExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', exeContent, 'malware.exe');

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject upload when no file is attached (422)', async () => {
      const freshExam = await Exam.create({
        title: 'Empty File Test Exam',
        examCode: `EXAM-NO-FILE-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-25',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(freshExam.id);

      const res = await request(app)
        .post(`/api/v1/exams/${freshExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('required');
    });

    it('should reject upload when file exceeds configured size limit (422)', async () => {
      const freshExam = await Exam.create({
        title: 'Oversized File Test Exam',
        examCode: `EXAM-OVERSIZED-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-26',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(freshExam.id);

      // 10MB + 1KB Buffer
      const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024, 0);

      const res = await request(app)
        .post(`/api/v1/exams/${freshExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', oversizedBuffer, 'oversized.pdf');

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('exceeds');
    });

    it('should reject upload for invalid UUID format in examId (422)', async () => {
      const res = await request(app)
        .post('/api/v1/exams/not-a-valid-uuid/question-paper')
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', samplePdfContent, 'test.pdf');

      expect(res.statusCode).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject upload for non-existent exam ID (404)', async () => {
      const nonExistentUuid = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .post(`/api/v1/exams/${nonExistentUuid}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', samplePdfContent, 'test.pdf');

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject upload by Student role with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${testExam1.id}/question-paper`)
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('file', samplePdfContent, 'student-paper.pdf');

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated upload with 401 Unauthorized', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${testExam1.id}/question-paper`)
        .attach('file', samplePdfContent, 'unauth-paper.pdf');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should safely sanitize path traversal characters in original filename', async () => {
      const freshExam = await Exam.create({
        title: 'Path Traversal Filename Test Exam',
        examCode: `EXAM-TRAVERSAL-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-28',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(freshExam.id);

      const res = await request(app)
        .post(`/api/v1/exams/${freshExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', samplePdfContent, '../../malicious_traversal.pdf');

      expect(res.statusCode).toBe(201);
      const paper = res.body.data.questionPaper;
      createdPaperIds.push(paper.id);
      uploadedFilesToCleanup.push(paper.filePathOrStorageKey);

      // Traversal characters should be stripped
      expect(paper.fileName).toBe('malicious_traversal.pdf');
      // Storage key must be a safe UUID
      expect(paper.filePathOrStorageKey).toMatch(/^[0-9a-f-]+\.pdf$/i);
    });
  });

  describe('2. Question Paper Metadata Retrieval', () => {
    it('should successfully retrieve question paper metadata by ID (GET /api/v1/question-papers/:id)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${uploadedPaperId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionPaper).toBeDefined();

      const paper = res.body.data.questionPaper;
      expect(paper.id).toBe(uploadedPaperId);
      expect(paper.fileName).toBe('midterm-paper.pdf');
      expect(paper.exam).toBeDefined();
      expect(paper.exam.id).toBe(testExam1.id);
      expect(paper.uploader).toBeDefined();
      expect(paper.uploader.id).toBe(facultyUser.id);
    });

    it('should successfully retrieve question paper metadata by Exam ID (GET /api/v1/exams/:examId/question-paper)', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${testExam1.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionPaper).toBeDefined();
      expect(res.body.data.questionPaper.id).toBe(uploadedPaperId);
    });

    it('should return 404 for non-existent question paper ID', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .get(`/api/v1/question-papers/${nonExistentId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject student access to question paper metadata with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${uploadedPaperId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated access to question paper metadata with 401 Unauthorized', async () => {
      const res = await request(app).get(
        `/api/v1/question-papers/${uploadedPaperId}`
      );

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('3. Secure Question Paper Download (GET /api/v1/question-papers/:id/download)', () => {
    it('should successfully stream and download the question paper file by Faculty (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${uploadedPaperId}/download`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .buffer(true)
        .parse((response, callback) => {
          response.data = Buffer.from([]);
          response.on('data', (chunk) => {
            response.data = Buffer.concat([response.data, chunk]);
          });
          response.on('end', () => {
            callback(null, response.data);
          });
        });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('midterm-paper.pdf');

      // Verify the downloaded file bytes match samplePdfContent and match stored SHA-256
      const downloadedHash = crypto
        .createHash('sha256')
        .update(res.body)
        .digest('hex');
      expect(downloadedHash).toBe(samplePdfHash);
    });

    it('should successfully stream and download question paper file by Admin (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${uploadedPaperId}/download`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('should reject student download attempt with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${uploadedPaperId}/download`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated download attempt with 401 Unauthorized', async () => {
      const res = await request(app).get(
        `/api/v1/question-papers/${uploadedPaperId}/download`
      );

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 for download of non-existent paper ID', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .get(`/api/v1/question-papers/${nonExistentId}/download`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('4. Question Paper Soft-Deletion & Re-upload Lifecycle', () => {
    let reuploadExam;
    let paperToDeleteId;

    beforeAll(async () => {
      reuploadExam = await Exam.create({
        title: 'Lifecycle Soft Delete Exam',
        examCode: `EXAM-SOFT-DEL-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-30',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(reuploadExam.id);

      const res = await request(app)
        .post(`/api/v1/exams/${reuploadExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', samplePdfContent, 'original-paper.pdf');

      paperToDeleteId = res.body.data.questionPaper.id;
      createdPaperIds.push(paperToDeleteId);
      uploadedFilesToCleanup.push(
        res.body.data.questionPaper.filePathOrStorageKey
      );
    });

    it('should successfully soft-delete a question paper (DELETE /api/v1/question-papers/:id)', async () => {
      const res = await request(app)
        .delete(`/api/v1/question-papers/${paperToDeleteId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('successfully');

      // Verify soft deletion in database
      const paperInDb = await QuestionPaper.findByPk(paperToDeleteId);
      expect(paperInDb).toBeNull(); // Excluded by paranoid query

      const softDeletedPaper = await QuestionPaper.findByPk(paperToDeleteId, {
        paranoid: false,
      });
      expect(softDeletedPaper).not.toBeNull();
      expect(softDeletedPaper.deletedAt).not.toBeNull();
    });

    it('should return 404 when trying to retrieve a soft-deleted question paper', async () => {
      const res = await request(app)
        .get(`/api/v1/question-papers/${paperToDeleteId}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should allow re-uploading a new question paper for the exam after soft deletion (201 Created)', async () => {
      const newContent = Buffer.from(
        '%PDF-1.4\nNew revision of examination paper after deletion'
      );
      const res = await request(app)
        .post(`/api/v1/exams/${reuploadExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', newContent, 'revised-paper.pdf');

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);

      const newPaper = res.body.data.questionPaper;
      createdPaperIds.push(newPaper.id);
      uploadedFilesToCleanup.push(newPaper.filePathOrStorageKey);

      expect(newPaper.id).not.toBe(paperToDeleteId);
      expect(newPaper.fileName).toBe('revised-paper.pdf');
    });
  });
});
