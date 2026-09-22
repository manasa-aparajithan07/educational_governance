'use strict';

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
  Result,
  BlockchainTransaction,
} = require('../src/database/models');
const {
  ROLES,
  EXAM_STATUS,
  RESULT_STATUS,
  BLOCKCHAIN_TX_STATUS,
} = require('../src/utils/constants');
const BlockchainService = require('../src/services/blockchainService');
const { calculateResultHash } = require('../src/modules/results/resultHashUtils');

jest.setTimeout(30000);

describe('Phase 6D: Blockchain Integration Readiness & Reconciliation', () => {
  let adminToken;
  let facultyToken;
  let studentToken;

  let adminUser;
  let facultyUser;
  let studentUser;
  let student2User;
  let student3User;
  let student4User;

  let testDept;
  let testSubject;
  let testExam;

  let unanchoredResult;
  let anchoredResult;
  let anchoredTx;
  let unresolvedResult;
  let tamperedResult;
  let tamperedTx;

  const createdExamIds = [];
  const createdResultIds = [];
  const createdTxIds = [];
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

    // 2. Authenticate Faculty
    const facultyRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'faculty@vit.ac.in', password: 'Faculty@12345' });
    facultyToken = facultyRes.body.data.accessToken;
    facultyUser = facultyRes.body.data.user;

    // 3. Authenticate Seeded Student
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student@vit.ac.in', password: 'Student@12345' });
    studentToken = studentRes.body.data.accessToken;
    studentUser = studentRes.body.data.user;

    // 4. Retrieve or create Department and Subject
    testDept = await Department.findOne({ where: { code: 'CSE' } });
    testSubject = await Subject.findOne({ where: { departmentId: testDept.id } });

    // 5. Create Test Examination
    testExam = await Exam.create({
      title: 'Phase 6D Reconciliation Test Exam',
      examCode: `EXAM-6D-${Date.now()}`,
      subjectId: testSubject.id,
      departmentId: testDept.id,
      createdBy: facultyUser.id,
      examDate: '2026-12-01',
      startTime: '10:00:00',
      endTime: '13:00:00',
      duration: 180,
      maximumMarks: 100,
      status: EXAM_STATUS.COMPLETED,
    });
    createdExamIds.push(testExam.id);

    // Create additional students to respect composite unique constraint [examId, studentId]
    const pwdHash = await bcrypt.hash('Student@12345', 10);
    student2User = await User.create({
      fullName: 'Reconciliation Student 2',
      email: `rec-student-2-${Date.now()}@vit.ac.in`,
      passwordHash: pwdHash,
      role: ROLES.STUDENT,
      studentId: `REC-STU-02-${Date.now()}`,
      departmentId: testDept.id,
      department: 'CSE',
      accountStatus: 'ACTIVE',
    });
    createdUserIds.push(student2User.id);

    student3User = await User.create({
      fullName: 'Reconciliation Student 3',
      email: `rec-student-3-${Date.now()}@vit.ac.in`,
      passwordHash: pwdHash,
      role: ROLES.STUDENT,
      studentId: `REC-STU-03-${Date.now()}`,
      departmentId: testDept.id,
      department: 'CSE',
      accountStatus: 'ACTIVE',
    });
    createdUserIds.push(student3User.id);

    student4User = await User.create({
      fullName: 'Reconciliation Student 4',
      email: `rec-student-4-${Date.now()}@vit.ac.in`,
      passwordHash: pwdHash,
      role: ROLES.STUDENT,
      studentId: `REC-STU-04-${Date.now()}`,
      departmentId: testDept.id,
      department: 'CSE',
      accountStatus: 'ACTIVE',
    });
    createdUserIds.push(student4User.id);

    // 6. Result 1: Unanchored Published Result (Disabled-mode normal)
    unanchoredResult = await Result.create({
      examId: testExam.id,
      studentId: studentUser.id,
      facultyId: facultyUser.id,
      marksObtained: 85.0,
      maximumMarks: 100,
      grade: 'A',
      submissionStatus: RESULT_STATUS.PUBLISHED,
      publishedAt: new Date('2026-12-02T10:00:00.000Z'),
      blockchainTransactionId: null,
    });
    createdResultIds.push(unanchoredResult.id);

    // 7. Result 2: Consistent Anchored Result
    const anchoredTxHash = `tx-hash-6d-valid-${Date.now()}`;
    anchoredResult = await Result.create({
      examId: testExam.id,
      studentId: student2User.id,
      facultyId: facultyUser.id,
      marksObtained: 92.5,
      maximumMarks: 100,
      grade: 'S',
      submissionStatus: RESULT_STATUS.PUBLISHED,
      publishedAt: new Date('2026-12-02T11:00:00.000Z'),
      blockchainTransactionId: anchoredTxHash,
    });
    createdResultIds.push(anchoredResult.id);

    const validPayloadHash = calculateResultHash(anchoredResult);
    anchoredTx = await BlockchainTransaction.create({
      txHash: anchoredTxHash,
      channelName: 'educhannel',
      chaincodeName: 'education',
      functionName: 'recordResult',
      payloadHash: validPayloadHash,
      status: BLOCKCHAIN_TX_STATUS.COMMITTED,
      blockNumber: 101,
    });
    createdTxIds.push(anchoredTx.id);

    // 8. Result 3: Unresolved Reference (transaction ID does not exist in transactions table)
    unresolvedResult = await Result.create({
      examId: testExam.id,
      studentId: student3User.id,
      facultyId: facultyUser.id,
      marksObtained: 78.0,
      maximumMarks: 100,
      grade: 'B',
      submissionStatus: RESULT_STATUS.PUBLISHED,
      publishedAt: new Date('2026-12-02T12:00:00.000Z'),
      blockchainTransactionId: 'tx-hash-non-existent-999999',
    });
    createdResultIds.push(unresolvedResult.id);

    // 9. Result 4: Payload Hash Mismatch (database record altered or anchor contains wrong hash)
    const tamperedTxHash = `tx-hash-6d-tampered-${Date.now()}`;
    tamperedResult = await Result.create({
      examId: testExam.id,
      studentId: student4User.id,
      facultyId: facultyUser.id,
      marksObtained: 65.0,
      maximumMarks: 100,
      grade: 'C',
      submissionStatus: RESULT_STATUS.PUBLISHED,
      publishedAt: new Date('2026-12-02T13:00:00.000Z'),
      blockchainTransactionId: tamperedTxHash,
    });
    createdResultIds.push(tamperedResult.id);

    tamperedTx = await BlockchainTransaction.create({
      txHash: tamperedTxHash,
      channelName: 'educhannel',
      chaincodeName: 'education',
      functionName: 'recordResult',
      payloadHash: '0000000000000000000000000000000000000000000000000000000000000000',
      status: BLOCKCHAIN_TX_STATUS.COMMITTED,
      blockNumber: 102,
    });
    createdTxIds.push(tamperedTx.id);
  });

  afterAll(async () => {
    for (const rId of createdResultIds) {
      await Result.destroy({ where: { id: rId }, force: true }).catch(() => {});
    }
    for (const tId of createdTxIds) {
      await BlockchainTransaction.destroy({ where: { id: tId }, force: true }).catch(() => {});
    }
    for (const eId of createdExamIds) {
      await Exam.destroy({ where: { id: eId }, force: true }).catch(() => {});
    }
    for (const uId of createdUserIds) {
      await User.destroy({ where: { id: uId }, force: true }).catch(() => {});
    }
  });

  // =========================================================================
  // SUITE 1: Result <-> BlockchainTransaction Association
  // =========================================================================
  describe('1. Model Associations & Relational Consistency', () => {
    it('should define Result.associations.blockchainTransaction', () => {
      expect(Result.associations.blockchainTransaction).toBeDefined();
    });

    it('should define BlockchainTransaction.associations.results', () => {
      expect(BlockchainTransaction.associations.results).toBeDefined();
    });

    it('should eagerly load linked BlockchainTransaction using association alias', async () => {
      const foundResult = await Result.findByPk(anchoredResult.id, {
        include: [{ model: BlockchainTransaction, as: 'blockchainTransaction' }],
      });

      expect(foundResult).toBeDefined();
      expect(foundResult.blockchainTransaction).toBeDefined();
      expect(foundResult.blockchainTransaction.txHash).toBe(anchoredResult.blockchainTransactionId);
      expect(foundResult.blockchainTransaction.payloadHash).toBe(anchoredTx.payloadHash);
    });

    it('should eagerly load linked Results from BlockchainTransaction', async () => {
      const foundTx = await BlockchainTransaction.findByPk(anchoredTx.id, {
        include: [{ model: Result, as: 'results' }],
      });

      expect(foundTx).toBeDefined();
      expect(Array.isArray(foundTx.results)).toBe(true);
      expect(foundTx.results.some((r) => r.id === anchoredResult.id)).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 2: Service-Level Reconciliation Functionality
  // =========================================================================
  describe('2. Published Result Reconciliation Service Logic', () => {
    it('should identify and classify DISABLED_UNANCHORED results when Fabric is disabled', async () => {
      const report = await BlockchainService.reconcilePublishedResults({
        examId: testExam.id,
      });

      expect(report).toBeDefined();
      expect(report.summary.fabricEnabled).toBe(false);

      const unanchoredItem = report.items.find((i) => i.resultId === unanchoredResult.id);
      expect(unanchoredItem).toBeDefined();
      expect(unanchoredItem.classification).toBe('DISABLED_UNANCHORED');
      expect(unanchoredItem.blockchainTransactionId).toBeNull();
      expect(unanchoredItem.detail).toContain('FABRIC_ENABLED=false');
    });

    it('should identify and classify ANCHORED_COMMITTED results', async () => {
      const report = await BlockchainService.reconcilePublishedResults({
        examId: testExam.id,
      });

      const anchoredItem = report.items.find((i) => i.resultId === anchoredResult.id);
      expect(anchoredItem).toBeDefined();
      expect(anchoredItem.classification).toBe('ANCHORED_COMMITTED');
      expect(anchoredItem.tx).toBeDefined();
      expect(anchoredItem.tx.status).toBe(BLOCKCHAIN_TX_STATUS.COMMITTED);
      expect(anchoredItem.tx.payloadHash).toBe(anchoredTx.payloadHash);
    });

    it('should identify and classify UNRESOLVED_REFERENCE results', async () => {
      const report = await BlockchainService.reconcilePublishedResults({
        examId: testExam.id,
      });

      const unresolvedItem = report.items.find((i) => i.resultId === unresolvedResult.id);
      expect(unresolvedItem).toBeDefined();
      expect(unresolvedItem.classification).toBe('UNRESOLVED_REFERENCE');
      expect(unresolvedItem.tx).toBeNull();
      expect(unresolvedItem.detail).toContain('not correspond to any registered');
    });

    it('should identify and classify PAYLOAD_HASH_MISMATCH results', async () => {
      const report = await BlockchainService.reconcilePublishedResults({
        examId: testExam.id,
      });

      const mismatchedItem = report.items.find((i) => i.resultId === tamperedResult.id);
      expect(mismatchedItem).toBeDefined();
      expect(mismatchedItem.classification).toBe('PAYLOAD_HASH_MISMATCH');
      expect(mismatchedItem.tx).toBeDefined();
      expect(mismatchedItem.tx.payloadHash).not.toBe(mismatchedItem.calculatedHash);
    });

    it('should collect all discrepancies in the discrepancies list', async () => {
      const report = await BlockchainService.reconcilePublishedResults({
        examId: testExam.id,
      });

      expect(report.discrepancies.length).toBeGreaterThanOrEqual(2);
      expect(report.discrepancies.some((d) => d.resultId === unresolvedResult.id)).toBe(true);
      expect(report.discrepancies.some((d) => d.resultId === tamperedResult.id)).toBe(true);
      expect(report.discrepancies.some((d) => d.resultId === anchoredResult.id)).toBe(false);
    });

    it('should perform strictly read-only operations without writing to database', async () => {
      const resultCountBefore = await Result.count();
      const txCountBefore = await BlockchainTransaction.count();

      await BlockchainService.reconcilePublishedResults({ examId: testExam.id });

      const resultCountAfter = await Result.count();
      const txCountAfter = await BlockchainTransaction.count();

      expect(resultCountAfter).toBe(resultCountBefore);
      expect(txCountAfter).toBe(txCountBefore);
    });

    it('should never expose student PII in reconciliation data items', async () => {
      const report = await BlockchainService.reconcilePublishedResults({
        examId: testExam.id,
      });

      for (const item of report.items) {
        expect(item.fullName).toBeUndefined();
        expect(item.email).toBeUndefined();
        expect(item.studentName).toBeUndefined();
        expect(item.studentId).toBeUndefined();
        expect(item.remarks).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // SUITE 3: Admin Reconciliation Endpoint & RBAC
  // =========================================================================
  describe('3. Admin Reconciliation HTTP Endpoint (GET /api/v1/results/reconciliation)', () => {
    it('ADMIN can retrieve reconciliation report (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/results/reconciliation?examId=${testExam.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('discrepancies');
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('pagination');
    });

    it('FACULTY access is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/results/reconciliation?examId=${testExam.id}`)
        .set('Authorization', `Bearer ${facultyToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('STUDENT access is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/results/reconciliation?examId=${testExam.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Unauthenticated request is rejected with 401 Unauthorized', async () => {
      const res = await request(app)
        .get(`/api/v1/results/reconciliation?examId=${testExam.id}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // SUITE 4: Fabric Readiness Non-Network Verification
  // =========================================================================
  describe('4. Hyperledger Fabric Readiness Non-Network Health Information', () => {
    it('returns DISABLED when FABRIC_ENABLED=false without network calls', () => {
      const readiness = BlockchainService.checkFabricReadiness({ enabled: false });

      expect(readiness.status).toBe('DISABLED');
      expect(readiness.ready).toBe(false);
      expect(readiness.enabled).toBe(false);
      expect(readiness.message).toContain('FABRIC_ENABLED=false');
      expect(readiness.components.configuration).toBe(false);
    });

    it('returns CONFIG_MISSING when configuration parameters or connection profile missing', () => {
      const readiness = BlockchainService.checkFabricReadiness({
        enabled: true,
        channelName: '',
        chaincodeName: 'education',
        connectionProfilePath: '/non/existent/path.json',
      });

      expect(readiness.status).toBe('CONFIG_MISSING');
      expect(readiness.ready).toBe(false);
      expect(readiness.enabled).toBe(true);
      expect(readiness.components.configuration).toBe(false);
    });

    it('returns CRYPTO_MATERIAL_MISSING when crypto files not found on disk', () => {
      // Mock existing connection profile but missing crypto files
      const tempProfile = path.join(__dirname, 'temp-connection-profile.json');
      fs.writeFileSync(tempProfile, JSON.stringify({ name: 'test' }));

      try {
        const readiness = BlockchainService.checkFabricReadiness({
          enabled: true,
          channelName: 'educhannel',
          chaincodeName: 'education',
          peerEndpoint: 'localhost:7051',
          mspId: 'Org1MSP',
          connectionProfilePath: tempProfile,
          certPath: '/non/existent/cert.pem',
          privateKeyPath: '/non/existent/key.pem',
        });

        expect(readiness.status).toBe('CRYPTO_MATERIAL_MISSING');
        expect(readiness.ready).toBe(false);
        expect(readiness.components.configuration).toBe(true);
        expect(readiness.components.cryptoMaterial).toBe(false);
      } finally {
        if (fs.existsSync(tempProfile)) fs.unlinkSync(tempProfile);
      }
    });

    it('returns CONFIG_READY when all local config and crypto files exist and are readable', () => {
      const tempDir = path.join(__dirname, 'temp-fabric-test');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

      const tempProfile = path.join(tempDir, 'connection.json');
      const tempCert = path.join(tempDir, 'cert.pem');
      const tempKey = path.join(tempDir, 'key.pem');

      fs.writeFileSync(tempProfile, JSON.stringify({ name: 'test' }));
      fs.writeFileSync(tempCert, 'CERTIFICATE-CONTENT');
      fs.writeFileSync(tempKey, 'KEY-CONTENT');

      try {
        const readiness = BlockchainService.checkFabricReadiness({
          enabled: true,
          channelName: 'educhannel',
          chaincodeName: 'education',
          peerEndpoint: 'localhost:7051',
          mspId: 'Org1MSP',
          connectionProfilePath: tempProfile,
          certPath: tempCert,
          privateKeyPath: tempKey,
        });

        expect(readiness.status).toBe('CONFIG_READY');
        expect(readiness.ready).toBe(true);
        expect(readiness.enabled).toBe(true);
        expect(readiness.components.configuration).toBe(true);
        expect(readiness.components.cryptoMaterial).toBe(true);
        expect(readiness.message).toContain('Live network connection is not established');
      } finally {
        if (fs.existsSync(tempProfile)) fs.unlinkSync(tempProfile);
        if (fs.existsSync(tempCert)) fs.unlinkSync(tempCert);
        if (fs.existsSync(tempKey)) fs.unlinkSync(tempKey);
        if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
      }
    });

    it('GET /api/v1/health includes blockchain.readiness property safely', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.blockchain).toHaveProperty('readiness');
      expect(res.body.data.blockchain.readiness).toHaveProperty('status', 'DISABLED');
      expect(res.body.data.blockchain.readiness).toHaveProperty('ready', false);

      // Sensitive paths or contents must never be exposed
      const readinessJson = JSON.stringify(res.body.data.blockchain.readiness);
      expect(readinessJson).not.toContain('PRIVATE KEY');
      expect(readinessJson).not.toContain('password');
      expect(readinessJson).not.toContain('dev_access_secret');
    });
  });
});
