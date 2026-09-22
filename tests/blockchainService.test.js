'use strict';

const net = require('net');
const http = require('http');
const https = require('https');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const fabricConfig = require('../src/config/fabricConfig');
const BlockchainService = require('../src/services/blockchainService');
const blockchainModule = require('../src/modules/blockchain');
const {
  sequelize,
  User,
  Department,
  Subject,
  Exam,
  Result,
  BlockchainTransaction,
  AuditLog,
} = require('../src/database/models');
const {
  ROLES,
  EXAM_STATUS,
  RESULT_STATUS,
  BLOCKCHAIN_TX_STATUS,
  ACCOUNT_STATUS,
} = require('../src/utils/constants');
const {
  calculateResultHash,
  buildCanonicalResultPayload,
  SCHEMA_VERSION,
} = require('../src/modules/results/resultHashUtils');

jest.setTimeout(30000);

describe('Phase 6B — Blockchain Service Abstraction & Disabled-Mode Handling', () => {
  let adminToken;
  let facultyToken;
  let studentToken;

  let adminUser;
  let facultyUser;
  let studentUser;

  let cseDept;
  let cseSubject;
  let testExam;

  const createdExamIds = [];
  const createdUserIds = [];
  const createdResultIds = [];

  const sampleResultData = {
    id: 'a1b2c3d4-e5f6-4a5b-8c9d-012345678901',
    examId: 'e1f2a3b4-c5d6-4e5f-a6b7-c8d9e0f1a2b3',
    marksObtained: 92.5,
    maximumMarks: 100,
    grade: 'S',
    publishedAt: '2026-03-20T10:00:00.000Z',
  };

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

    // 4. Fetch Department & Subject
    cseDept = await Department.findOne({ where: { code: 'CSE' } });
    cseSubject = await Subject.findOne({ where: { code: 'BACSE350' } });

    // 5. Create Completed Exam for integration tests
    testExam = await Exam.create({
      title: 'Blockchain Phase 6B Test Exam',
      examCode: `EXAM-6B-${Date.now()}`,
      subjectId: cseSubject.id,
      departmentId: cseDept.id,
      createdBy: facultyUser.id,
      examDate: '2026-11-20',
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

  describe('1. Service Initialization & Fabric Configuration', () => {
    it('1. Service loads cleanly with Fabric disabled (FABRIC_ENABLED=false)', () => {
      expect(BlockchainService).toBeDefined();
      expect(typeof BlockchainService.anchorResult).toBe('function');
      expect(typeof BlockchainService.getTransactionStatus).toBe('function');
      expect(typeof BlockchainService.verifyResultHash).toBe('function');
      expect(BlockchainService.isFabricEnabled()).toBe(false);
      expect(fabricConfig.enabled).toBe(false);
    });

    it('2. Blockchain module index exports BlockchainService', () => {
      expect(blockchainModule).toBeDefined();
      expect(blockchainModule.name).toBe('blockchain');
      expect(blockchainModule.service).toBe(BlockchainService);
    });

    it('3. Hyperledger Fabric SDK packages are not installed or required', () => {
      expect(() => require.resolve('fabric-network')).toThrow();
      expect(() => require.resolve('fabric-ca-client')).toThrow();
    });

    it('4. Service operations do not attempt network connections or open sockets', async () => {
      const connectSpy = jest.spyOn(net, 'connect');
      const createConnectionSpy = jest.spyOn(net, 'createConnection');
      const httpSpy = jest.spyOn(http, 'request');
      const httpsSpy = jest.spyOn(https, 'request');

      await BlockchainService.anchorResult(sampleResultData);
      await BlockchainService.getTransactionStatus('dummy-tx-hash');
      await BlockchainService.verifyResultHash(sampleResultData, 'some-hash');

      expect(connectSpy).not.toHaveBeenCalled();
      expect(createConnectionSpy).not.toHaveBeenCalled();
      expect(httpSpy).not.toHaveBeenCalled();
      expect(httpsSpy).not.toHaveBeenCalled();

      connectSpy.mockRestore();
      createConnectionSpy.mockRestore();
      httpSpy.mockRestore();
      httpsSpy.mockRestore();
    });
  });

  describe('2. anchorResult in Fabric-Disabled Mode', () => {
    it('5. anchorResult returns explicit disabled response', async () => {
      const response = await BlockchainService.anchorResult(sampleResultData);

      expect(response).toBeDefined();
      expect(response.anchored).toBe(false);
      expect(response.status).toBe('DISABLED');
      expect(response.enabled).toBe(false);
      expect(response.message).toContain('FABRIC_ENABLED=false');
      expect(response.message).toContain('No transaction was submitted or committed');
    });

    it('6. No blockchain commitment is claimed', async () => {
      const response = await BlockchainService.anchorResult(sampleResultData);

      expect(response.status).not.toBe(BLOCKCHAIN_TX_STATUS.COMMITTED);
      expect(response.status).not.toBe('COMMITTED');
      expect(response.status).not.toBe(BLOCKCHAIN_TX_STATUS.PENDING);
      expect(response.anchored).toBe(false);
    });

    it('7. No fake transaction hash or block number is generated', async () => {
      const response = await BlockchainService.anchorResult(sampleResultData);

      expect(response.txHash).toBeNull();
      expect(response.transactionId).toBeNull();
      expect(response.blockNumber).toBeNull();
    });

    it('8. Preserves authoritative canonical payload hash (SHA-256)', async () => {
      const expectedHash = calculateResultHash(sampleResultData);
      const response = await BlockchainService.anchorResult(sampleResultData);

      expect(response.payloadHash).toBe(expectedHash);
      expect(response.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('9. Preserves canonical payload fields and excludes all PII and plaintext studentId', async () => {
      const resultWithPII = {
        ...sampleResultData,
        studentName: 'Jane Doe',
        studentEmail: 'jane.doe@example.com',
        studentId: '25BCE9999',
        remarks: 'Excellent practical viva performance',
        password: 'SecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        ipAddress: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      };

      const response = await BlockchainService.anchorResult(resultWithPII);
      const { canonicalPayload } = response;

      expect(canonicalPayload).toBeDefined();
      expect(canonicalPayload.resultId).toBe(sampleResultData.id);
      expect(canonicalPayload.examId).toBe(sampleResultData.examId);
      expect(canonicalPayload.marksObtained).toBe('92.50');
      expect(canonicalPayload.maximumMarks).toBe('100.00');
      expect(canonicalPayload.grade).toBe('S');
      expect(canonicalPayload.publishedAt).toBe('2026-03-20T10:00:00.000Z');
      expect(canonicalPayload.schemaVersion).toBe(SCHEMA_VERSION);

      // Verify PII is excluded from canonical payload
      expect(canonicalPayload).not.toHaveProperty('studentName');
      expect(canonicalPayload).not.toHaveProperty('studentEmail');
      expect(canonicalPayload).not.toHaveProperty('studentId');
      expect(canonicalPayload).not.toHaveProperty('remarks');
      expect(canonicalPayload).not.toHaveProperty('password');
      expect(canonicalPayload).not.toHaveProperty('token');
      expect(canonicalPayload).not.toHaveProperty('ipAddress');
      expect(canonicalPayload).not.toHaveProperty('userAgent');

      // Hash must match pristine hash without PII
      const pristineHash = calculateResultHash(sampleResultData);
      expect(response.payloadHash).toBe(pristineHash);
    });

    it('10. Throws descriptive error when required identifiers are missing', async () => {
      await expect(BlockchainService.anchorResult(null)).rejects.toThrow(
        'Result payload is required for blockchain anchoring'
      );
      await expect(BlockchainService.anchorResult({ marksObtained: 85 })).rejects.toThrow(
        'Result payload missing required identifiers'
      );
    });
  });

  describe('3. Database Safety & Persistence Prevention', () => {
    it('11. anchorResult in disabled mode creates NO records in blockchain_transactions table', async () => {
      const countBefore = await BlockchainTransaction.count();

      await BlockchainService.anchorResult(sampleResultData);
      await BlockchainService.anchorResult({
        ...sampleResultData,
        id: 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f',
      });

      const countAfter = await BlockchainTransaction.count();
      expect(countAfter).toBe(countBefore);
    });

    it('12. Never persists an uncommitted transaction marked as COMMITTED', async () => {
      await BlockchainService.anchorResult(sampleResultData);

      const committedTxs = await BlockchainTransaction.findAll({
        where: { status: BLOCKCHAIN_TX_STATUS.COMMITTED },
      });
      expect(committedTxs).toHaveLength(0);
    });
  });

  describe('4. Determinism of Repeated Disabled Calls', () => {
    it('13. Repeated calls with identical data produce identical payload hash and canonical payload', async () => {
      const res1 = await BlockchainService.anchorResult(sampleResultData);
      const res2 = await BlockchainService.anchorResult({ ...sampleResultData });
      const res3 = await BlockchainService.anchorResult(sampleResultData);

      expect(res1.payloadHash).toBe(res2.payloadHash);
      expect(res2.payloadHash).toBe(res3.payloadHash);
      expect(res1.canonicalPayload).toEqual(res2.canonicalPayload);
    });

    it('14. Modifying result data produces a different canonical payload hash', async () => {
      const resOriginal = await BlockchainService.anchorResult(sampleResultData);
      const resModifiedMarks = await BlockchainService.anchorResult({
        ...sampleResultData,
        marksObtained: 93.0,
      });
      const resModifiedGrade = await BlockchainService.anchorResult({
        ...sampleResultData,
        grade: 'A',
      });

      expect(resOriginal.payloadHash).not.toBe(resModifiedMarks.payloadHash);
      expect(resOriginal.payloadHash).not.toBe(resModifiedGrade.payloadHash);
    });
  });

  describe('5. Transaction Status Lookup (getTransactionStatus)', () => {
    it('15. Returns explicit disabled response for non-existent transaction without network call', async () => {
      const res = await BlockchainService.getTransactionStatus('any-non-existent-hash');

      expect(res).toBeDefined();
      expect(res.found).toBe(false);
      expect(res.status).toBe('DISABLED');
      expect(res.enabled).toBe(false);
      expect(res.message).toContain('FABRIC_ENABLED=false');
    });

    it('16. Rejects empty or invalid transaction ID cleanly', async () => {
      const resNull = await BlockchainService.getTransactionStatus(null);
      const resEmpty = await BlockchainService.getTransactionStatus('   ');

      expect(resNull.found).toBe(false);
      expect(resNull.status).toBe('NOT_FOUND');
      expect(resEmpty.found).toBe(false);
      expect(resEmpty.status).toBe('NOT_FOUND');
    });

    it('17. Retrieves transaction from local database if record exists', async () => {
      // Create a test local record
      const knownTxHash = `0x${Date.now()}abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;
      const localRecord = await BlockchainTransaction.create({
        txHash: knownTxHash,
        channelName: 'educhannel',
        chaincodeName: 'education',
        functionName: 'anchorResult',
        payloadHash: calculateResultHash(sampleResultData),
        status: BLOCKCHAIN_TX_STATUS.PENDING,
      });

      const res = await BlockchainService.getTransactionStatus(knownTxHash);

      expect(res.found).toBe(true);
      expect(res.status).toBe(BLOCKCHAIN_TX_STATUS.PENDING);
      expect(res.txHash).toBe(knownTxHash);
      expect(res.payloadHash).toBe(localRecord.payloadHash);

      // Clean up test record
      await localRecord.destroy({ force: true });
    });
  });

  describe('6. Canonical Hash Verification (verifyResultHash)', () => {
    it('18. Successfully verifies when calculated hash matches expected hash', async () => {
      const expectedHash = calculateResultHash(sampleResultData);
      const res = await BlockchainService.verifyResultHash(sampleResultData, expectedHash);

      expect(res.verified).toBe(true);
      expect(res.isMatch).toBe(true);
      expect(res.status).toBe('VERIFIED');
      expect(res.calculatedHash).toBe(expectedHash);
      expect(res.expectedHash).toBe(expectedHash);
    });

    it('19. Detects mismatch when calculated hash does not match expected hash', async () => {
      const wrongHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const res = await BlockchainService.verifyResultHash(sampleResultData, wrongHash);

      expect(res.verified).toBe(false);
      expect(res.isMatch).toBe(false);
      expect(res.status).toBe('MISMATCH');
      expect(res.calculatedHash).not.toBe(wrongHash);
    });

    it('20. Supports object wrapper with payload and expectedHash', async () => {
      const expectedHash = calculateResultHash(sampleResultData);
      const res = await BlockchainService.verifyResultHash({
        result: sampleResultData,
        expectedHash,
      });

      expect(res.verified).toBe(true);
      expect(res.isMatch).toBe(true);
      expect(res.status).toBe('VERIFIED');
    });

    it('21. Verifies Result record in database by UUID reference', async () => {
      const exam21 = await Exam.create({
        title: 'Ref Test Exam 21',
        examCode: `EXAM-6B-21-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-21',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(exam21.id);

      const dbResult = await Result.create({
        examId: exam21.id,
        studentId: studentUser.id,
        facultyId: facultyUser.id,
        marksObtained: 85.0,
        maximumMarks: 100,
        grade: 'A',
        submissionStatus: RESULT_STATUS.VERIFIED,
      });
      createdResultIds.push(dbResult.id);

      const expectedHash = calculateResultHash(dbResult);
      const res = await BlockchainService.verifyResultHash(dbResult.id, expectedHash);

      expect(res.verified).toBe(true);
      expect(res.isMatch).toBe(true);
      expect(res.calculatedHash).toBe(expectedHash);
    });

    it('22. Returns explicit disabled response when called for reference without expected hash or on-chain anchor', async () => {
      const exam22 = await Exam.create({
        title: 'Ref Test Exam 22',
        examCode: `EXAM-6B-22-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-22',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(exam22.id);

      const dbResult = await Result.create({
        examId: exam22.id,
        studentId: studentUser.id,
        facultyId: facultyUser.id,
        marksObtained: 80.0,
        maximumMarks: 100,
        grade: 'A',
        submissionStatus: RESULT_STATUS.DRAFT,
      });
      createdResultIds.push(dbResult.id);

      const res = await BlockchainService.verifyResultHash(dbResult.id);

      expect(res.verified).toBe(false);
      expect(res.isMatch).toBe(false);
      expect(res.status).toBe('DISABLED');
      expect(res.message).toContain('FABRIC_ENABLED=false');
    });

    it('23. Handles non-existent result ID gracefully', async () => {
      const nonExistentId = '99999999-9999-4999-9999-999999999999';
      const res = await BlockchainService.verifyResultHash(nonExistentId, 'some-hash');

      expect(res.verified).toBe(false);
      expect(res.status).toBe('NOT_FOUND');
    });

    it('24. Handles null/invalid input gracefully', async () => {
      const res = await BlockchainService.verifyResultHash(null);
      expect(res.verified).toBe(false);
      expect(res.status).toBe('INVALID_INPUT');
    });
  });

  describe('7. Integration with Result Publication Workflow', () => {
    let pubExam;
    let verifiedResult;

    beforeAll(async () => {
      pubExam = await Exam.create({
        title: 'Publication Workflow Exam',
        examCode: `EXAM-PUB-6B-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-23',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(pubExam.id);

      verifiedResult = await Result.create({
        examId: pubExam.id,
        studentId: studentUser.id,
        facultyId: facultyUser.id,
        marksObtained: 88.0,
        maximumMarks: 100,
        grade: 'A',
        remarks: 'Strong viva performance',
        submissionStatus: RESULT_STATUS.VERIFIED,
        verifiedBy: facultyUser.id,
        verifiedAt: new Date(),
      });
      createdResultIds.push(verifiedResult.id);
    });

    it('25. Existing publication behavior is unchanged (VERIFIED -> PUBLISHED by ADMIN)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${verifiedResult.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Result status updated successfully');

      const { result } = res.body.data;
      expect(result.submissionStatus).toBe(RESULT_STATUS.PUBLISHED);
      expect(result.publishedAt).toBeDefined();
      expect(new Date(result.publishedAt).getTime()).not.toBeNaN();

      // Ensure no blockchain transaction was generated or linked in disabled mode
      expect(result.blockchainTransactionId).toBeNull();
      const txCount = await BlockchainTransaction.count();
      expect(txCount).toBe(0);

      // Audit log must still be created with cryptographic recordHash
      const auditLog = await AuditLog.findOne({
        where: {
          entityType: 'Result',
          entityId: verifiedResult.id,
          eventType: 'RESULT_PUBLISHED',
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog.performedBy).toBe(adminUser.id);
      expect(auditLog.recordHash).toHaveLength(64);
    });

    it('26. Batch publication triggers hook safely and preserves existing response contract', async () => {
      const batchExam = await Exam.create({
        title: 'Batch Pub Exam',
        examCode: `EXAM-BPUB-6B-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-24',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(batchExam.id);

      const r1 = await Result.create({
        examId: batchExam.id,
        studentId: studentUser.id,
        facultyId: facultyUser.id,
        marksObtained: 75.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.VERIFIED,
        verifiedBy: facultyUser.id,
        verifiedAt: new Date(),
      });
      createdResultIds.push(r1.id);

      const res = await request(app)
        .patch(`/api/v1/exams/${batchExam.id}/results/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(RESULT_STATUS.PUBLISHED);

      const refreshed = await Result.findByPk(r1.id);
      expect(refreshed.submissionStatus).toBe(RESULT_STATUS.PUBLISHED);
      expect(refreshed.publishedAt).toBeDefined();
    });
  });

  describe('8. Lifecycle and Governance Rules Preservation', () => {
    let rbacExam;
    let rbacResult;

    beforeAll(async () => {
      rbacExam = await Exam.create({
        title: 'RBAC Governance Exam',
        examCode: `EXAM-RBAC-6B-${Date.now()}`,
        subjectId: cseSubject.id,
        departmentId: cseDept.id,
        createdBy: facultyUser.id,
        examDate: '2026-11-25',
        duration: 120,
        maximumMarks: 100,
        status: EXAM_STATUS.COMPLETED,
      });
      createdExamIds.push(rbacExam.id);

      rbacResult = await Result.create({
        examId: rbacExam.id,
        studentId: studentUser.id,
        facultyId: facultyUser.id,
        marksObtained: 78.0,
        maximumMarks: 100,
        grade: 'B',
        submissionStatus: RESULT_STATUS.VERIFIED,
        verifiedBy: facultyUser.id,
        verifiedAt: new Date(),
      });
      createdResultIds.push(rbacResult.id);
    });

    it('27. Non-admin (FACULTY) cannot publish results (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${rbacResult.id}/status`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('28. STUDENT cannot transition result status (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${rbacResult.id}/status`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ status: RESULT_STATUS.PUBLISHED });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('29. Illegal lifecycle transition (VERIFIED -> DRAFT) is rejected (400 INVALID_STATUS_TRANSITION)', async () => {
      const res = await request(app)
        .patch(`/api/v1/results/${rbacResult.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: RESULT_STATUS.DRAFT });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });
});
