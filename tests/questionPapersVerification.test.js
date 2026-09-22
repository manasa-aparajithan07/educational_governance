'use strict';

const crypto = require('crypto');
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
  AuditLog,
} = require('../src/database/models');
const fileStorageService = require('../src/services/fileStorageService');
const { EXAM_STATUS } = require('../src/utils/constants');

jest.setTimeout(30000);

describe('Phase 4B: Question Paper Integrity Verification & Audit Logging', () => {
  let adminToken;
  let facultyToken;
  let studentToken;
  let facultyUser;
  let testDepartment;
  let testSubject;

  const createdExamIds = [];
  const createdPaperIds = [];
  const filesToCleanup = [];

  const samplePdfContent = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Title (Midterm Test Document) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );
  const samplePdfHash = crypto
    .createHash('sha256')
    .update(samplePdfContent)
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

    // 4. Academic entities
    testDepartment = await Department.findOne({ where: { code: 'CSE' } });
    testSubject = await Subject.findOne({ where: { code: 'BACSE350' } });
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
      for (const fileKey of filesToCleanup) {
        fileStorageService.deleteFile(fileKey);
      }
      if (createdExamIds.length > 0) {
        await Exam.destroy({ where: { id: createdExamIds }, force: true });
      }
    } catch (_) {}
    await sequelize.close();
  });

  describe('1. Integrity Verification (POST /api/v1/question-papers/:id/verify)', () => {
    let validExam;
    let validPaper;

    beforeAll(async () => {
      validExam = await Exam.create({
        title: 'Integrity Verification Valid Exam',
        examCode: `EXAM-VERIFY-VALID-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        createdBy: facultyUser.id,
        examDate: '2026-12-01',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(validExam.id);

      const res = await request(app)
        .post(`/api/v1/exams/${validExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', samplePdfContent, 'midterm-verify.pdf');

      validPaper = res.body.data.questionPaper;
      createdPaperIds.push(validPaper.id);
      filesToCleanup.push(validPaper.filePathOrStorageKey);
    });

    it('should verify matching hash and set status to VERIFIED (200 OK)', async () => {
      const res = await request(app)
        .post(`/api/v1/question-papers/${validPaper.id}/verify`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('verified successfully');
      expect(res.body.data.verificationStatus).toBe('VERIFIED');
      expect(res.body.data.isMatch).toBe(true);
      expect(res.body.data.storedHash).toBe(samplePdfHash);
      expect(res.body.data.calculatedHash).toBe(samplePdfHash);
      expect(res.body.data.questionPaper.verificationStatus).toBe('VERIFIED');

      // Verify database updated
      const paperInDb = await QuestionPaper.findByPk(validPaper.id);
      expect(paperInDb.verificationStatus).toBe('VERIFIED');
    });

    it('should record QUESTION_PAPER_VERIFIED audit log with cryptographic recordHash', async () => {
      const auditLog = await AuditLog.findOne({
        where: {
          entityType: 'QuestionPaper',
          entityId: validPaper.id,
          eventType: 'QUESTION_PAPER_VERIFIED',
        },
        order: [['createdAt', 'DESC']],
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog.performedBy).toBe(facultyUser.id);
      expect(auditLog.performedByRole).toBe(facultyUser.role);
      expect(auditLog.recordHash).toBeDefined();
      expect(auditLog.recordHash).toMatch(/^[a-f0-9]{64}$/i);
      expect(auditLog.description).toContain('hash matches');
    });

    it('should verify that upload event was also recorded in audit log', async () => {
      const uploadAudit = await AuditLog.findOne({
        where: {
          entityType: 'QuestionPaper',
          entityId: validPaper.id,
          eventType: 'QUESTION_PAPER_UPLOADED',
        },
      });

      expect(uploadAudit).not.toBeNull();
      expect(uploadAudit.recordHash).toMatch(/^[a-f0-9]{64}$/i);
    });

    it('should record QUESTION_PAPER_DOWNLOADED in audit log when file is downloaded', async () => {
      await request(app)
        .get(`/api/v1/question-papers/${validPaper.id}/download`)
        .set('Authorization', `Bearer ${facultyToken}`);

      const downloadAudit = await AuditLog.findOne({
        where: {
          entityType: 'QuestionPaper',
          entityId: validPaper.id,
          eventType: 'QUESTION_PAPER_DOWNLOADED',
        },
        order: [['createdAt', 'DESC']],
      });

      expect(downloadAudit).not.toBeNull();
      expect(downloadAudit.performedBy).toBe(facultyUser.id);
      expect(downloadAudit.recordHash).toMatch(/^[a-f0-9]{64}$/i);
    });
  });

  describe('2. Tamper Detection & Immutability of Stored Hash', () => {
    let tamperExam;
    let tamperedPaper;
    let originalStoredHash;

    beforeAll(async () => {
      tamperExam = await Exam.create({
        title: 'Tamper Detection Test Exam',
        examCode: `EXAM-TAMPER-TEST-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        createdBy: facultyUser.id,
        examDate: '2026-12-05',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(tamperExam.id);

      const res = await request(app)
        .post(`/api/v1/exams/${tamperExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', samplePdfContent, 'tamper-test.pdf');

      tamperedPaper = res.body.data.questionPaper;
      originalStoredHash = tamperedPaper.sha256Hash;
      createdPaperIds.push(tamperedPaper.id);
      filesToCleanup.push(tamperedPaper.filePathOrStorageKey);

      // Simulate malicious tampering: overwrite file contents on disk
      const diskPath = fileStorageService.getStoragePath(
        tamperedPaper.filePathOrStorageKey
      );
      fs.writeFileSync(
        diskPath,
        '%PDF-1.4\nMALICIOUSLY ALTERED QUESTION PAPER CONTENTS\n%%EOF'
      );
    });

    it('should detect modified file and set status to TAMPER_DETECTED (200 OK)', async () => {
      const res = await request(app)
        .post(`/api/v1/question-papers/${tamperedPaper.id}/verify`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Tamper detected');
      expect(res.body.data.verificationStatus).toBe('TAMPER_DETECTED');
      expect(res.body.data.isMatch).toBe(false);
      expect(res.body.data.questionPaper.verificationStatus).toBe('TAMPER_DETECTED');

      // Verify database updated
      const paperInDb = await QuestionPaper.findByPk(tamperedPaper.id);
      expect(paperInDb.verificationStatus).toBe('TAMPER_DETECTED');
    });

    it('should NEVER overwrite the original stored sha256Hash after tamper detection', async () => {
      const paperInDb = await QuestionPaper.findByPk(tamperedPaper.id);

      // The stored hash must remain untouched
      expect(paperInDb.sha256Hash).toBe(originalStoredHash);
      expect(paperInDb.sha256Hash).toBe(samplePdfHash);
    });

    it('should record QUESTION_PAPER_TAMPER_DETECTED audit log entry', async () => {
      const auditLog = await AuditLog.findOne({
        where: {
          entityType: 'QuestionPaper',
          entityId: tamperedPaper.id,
          eventType: 'QUESTION_PAPER_TAMPER_DETECTED',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog.performedBy).toBe(facultyUser.id);
      expect(auditLog.performedByRole).toBe(facultyUser.role);
      expect(auditLog.recordHash).toMatch(/^[a-f0-9]{64}$/i);
      expect(auditLog.description).toContain('Tampering detected');
    });
  });

  describe('3. Error Handling & Access Control', () => {
    let missingFileExam;
    let missingFilePaper;

    beforeAll(async () => {
      missingFileExam = await Exam.create({
        title: 'Missing File Test Exam',
        examCode: `EXAM-MISSING-FILE-${Date.now()}`,
        subjectId: testSubject.id,
        departmentId: testDepartment.id,
        createdBy: facultyUser.id,
        examDate: '2026-12-10',
        duration: 180,
        maximumMarks: 100,
        status: EXAM_STATUS.DRAFT,
      });
      createdExamIds.push(missingFileExam.id);

      const res = await request(app)
        .post(`/api/v1/exams/${missingFileExam.id}/question-paper`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .attach('file', samplePdfContent, 'missing-file-paper.pdf');

      missingFilePaper = res.body.data.questionPaper;
      createdPaperIds.push(missingFilePaper.id);

      // Delete the file from storage to test missing file handling
      const diskPath = fileStorageService.getStoragePath(
        missingFilePaper.filePathOrStorageKey
      );
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }
    });

    it('should return 404 when physical file is missing from storage', async () => {
      const res = await request(app)
        .post(`/api/v1/question-papers/${missingFilePaper.id}/verify`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.message).toContain('not found on storage');
    });

    it('should return 404 for non-existent QuestionPaper ID', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .post(`/api/v1/question-papers/${nonExistentId}/verify`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for invalid UUID format in ID', async () => {
      const res = await request(app)
        .post('/api/v1/question-papers/not-a-valid-uuid/verify')
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should reject verification request from Student with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/v1/question-papers/${missingFilePaper.id}/verify`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject unauthenticated verification request with 401 Unauthorized', async () => {
      const res = await request(app).post(
        `/api/v1/question-papers/${missingFilePaper.id}/verify`
      );

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should record QUESTION_PAPER_DELETED audit log entry when paper is deleted', async () => {
      const res = await request(app)
        .delete(`/api/v1/question-papers/${missingFilePaper.id}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(200);

      const deleteAudit = await AuditLog.findOne({
        where: {
          entityType: 'QuestionPaper',
          entityId: missingFilePaper.id,
          eventType: 'QUESTION_PAPER_DELETED',
        },
      });

      expect(deleteAudit).not.toBeNull();
      expect(deleteAudit.performedBy).toBe(facultyUser.id);
      expect(deleteAudit.recordHash).toMatch(/^[a-f0-9]{64}$/i);
    });
  });
});
