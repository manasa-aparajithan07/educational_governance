'use strict';

const HashingService = require('../src/services/hashingService');
const {
  SCHEMA_VERSION,
  normalizeDecimal,
  normalizeDate,
  normalizeIdentifier,
  buildCanonicalResultPayload,
  serializeCanonicalPayload,
  calculateResultHash,
  verifyResultHash,
} = require('../src/modules/results/resultHashUtils');

describe('Result Hash Utils (Phase 6A Canonical Hashing)', () => {
  const baseResultData = {
    id: 'b5f2c5d1-1234-4a5b-8c9d-0123456789ab',
    examId: 'e8a1b2c3-4567-890a-bcde-f01234567890',
    marksObtained: 85.5,
    maximumMarks: 100,
    grade: 'A',
    publishedAt: '2026-03-15T10:00:00.000Z',
  };

  describe('1. Canonical payload structure', () => {
    it('should contain exactly the expected deterministic fields and correct schemaVersion', () => {
      const payload = buildCanonicalResultPayload(baseResultData);

      expect(payload).toEqual({
        examId: 'e8a1b2c3-4567-890a-bcde-f01234567890',
        grade: 'A',
        marksObtained: '85.50',
        maximumMarks: '100.00',
        publishedAt: '2026-03-15T10:00:00.000Z',
        resultId: 'b5f2c5d1-1234-4a5b-8c9d-0123456789ab',
        schemaVersion: SCHEMA_VERSION,
      });
      expect(payload.schemaVersion).toBe('1.0');
    });

    it('should throw error if required identifiers are missing', () => {
      expect(() => buildCanonicalResultPayload({ examId: 'e1' })).toThrow(
        'Result payload missing required identifiers'
      );
      expect(() => buildCanonicalResultPayload({ id: 'r1' })).toThrow(
        'Result payload missing required identifiers'
      );
    });

    it('should support Sequelize model instances with toJSON()', () => {
      const mockInstance = {
        toJSON: () => ({ ...baseResultData }),
      };
      const payload = buildCanonicalResultPayload(mockInstance);
      expect(payload.resultId).toBe(baseResultData.id);
    });
  });

  describe('2. Deterministic serialization', () => {
    it('should produce identical serialized payloads regardless of property insertion order', () => {
      const payload1 = {
        resultId: 'r1',
        examId: 'e1',
        marksObtained: '85.00',
        maximumMarks: '100.00',
        grade: 'A',
        publishedAt: '2026-03-15T10:00:00.000Z',
        schemaVersion: '1.0',
      };

      const payload2 = {
        schemaVersion: '1.0',
        publishedAt: '2026-03-15T10:00:00.000Z',
        grade: 'A',
        maximumMarks: '100.00',
        marksObtained: '85.00',
        examId: 'e1',
        resultId: 'r1',
      };

      const serialized1 = serializeCanonicalPayload(payload1);
      const serialized2 = serializeCanonicalPayload(payload2);

      expect(serialized1).toBe(serialized2);
      expect(serialized1).toBe(
        '{"examId":"e1","grade":"A","marksObtained":"85.00","maximumMarks":"100.00","publishedAt":"2026-03-15T10:00:00.000Z","resultId":"r1","schemaVersion":"1.0"}'
      );
    });
  });

  describe('3. Identical logical result data produces identical SHA-256 hash', () => {
    it('should calculate identical hash for identical logical result data', () => {
      const hash1 = calculateResultHash(baseResultData);
      const hash2 = calculateResultHash({ ...baseResultData });

      expect(hash1).toBe(hash2);
      expect(verifyResultHash(baseResultData, hash1)).toBe(true);
    });
  });

  describe('4. Changing marks changes the hash', () => {
    it('should generate a different hash when marksObtained changes', () => {
      const hashOriginal = calculateResultHash(baseResultData);
      const hashModified = calculateResultHash({
        ...baseResultData,
        marksObtained: 86.0,
      });

      expect(hashOriginal).not.toBe(hashModified);
      expect(verifyResultHash({ ...baseResultData, marksObtained: 86.0 }, hashOriginal)).toBe(false);
    });
  });

  describe('5. Changing grade changes the hash', () => {
    it('should generate a different hash when grade changes', () => {
      const hashOriginal = calculateResultHash(baseResultData);
      const hashModified = calculateResultHash({
        ...baseResultData,
        grade: 'B',
      });

      expect(hashOriginal).not.toBe(hashModified);
    });
  });

  describe('6. Changing maximumMarks changes the hash', () => {
    it('should generate a different hash when maximumMarks changes', () => {
      const hashOriginal = calculateResultHash(baseResultData);
      const hashModified = calculateResultHash({
        ...baseResultData,
        maximumMarks: 150,
      });

      expect(hashOriginal).not.toBe(hashModified);
    });
  });

  describe('7. Changing publishedAt changes the hash', () => {
    it('should generate a different hash when publishedAt changes', () => {
      const hashOriginal = calculateResultHash(baseResultData);
      const hashModified = calculateResultHash({
        ...baseResultData,
        publishedAt: '2026-03-16T12:00:00.000Z',
      });

      expect(hashOriginal).not.toBe(hashModified);
    });
  });

  describe('8. Decimal normalization consistency', () => {
    it('should normalize 85, 85.0, "85.00", and 85.000 to identical "85.00"', () => {
      expect(normalizeDecimal(85)).toBe('85.00');
      expect(normalizeDecimal(85.0)).toBe('85.00');
      expect(normalizeDecimal('85.00')).toBe('85.00');
      expect(normalizeDecimal(85.004)).toBe('85.00');
      expect(normalizeDecimal('85.5')).toBe('85.50');

      const hash1 = calculateResultHash({ ...baseResultData, marksObtained: 85 });
      const hash2 = calculateResultHash({ ...baseResultData, marksObtained: 85.0 });
      const hash3 = calculateResultHash({ ...baseResultData, marksObtained: '85.00' });

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should throw TypeError on non-numeric decimal values', () => {
      expect(() => normalizeDecimal('not-a-number')).toThrow(TypeError);
    });
  });

  describe('9. Exclusion of sensitive and personal data', () => {
    it('should exclude student names, emails, remarks, passwords, tokens, IP, user agent, and studentId from affecting hash', () => {
      const hashWithoutPII = calculateResultHash(baseResultData);

      const resultWithPII = {
        ...baseResultData,
        studentName: 'Alice Johnson',
        studentEmail: 'alice@example.com',
        studentId: 'c1d2e3f4-5678-90ab-cdef-1234567890ab',
        remarks: 'Exam conducted under strict supervision with no infractions.',
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        evaluatorId: 'evaluator-uuid-9999',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      };

      const hashWithPII = calculateResultHash(resultWithPII);

      expect(hashWithPII).toBe(hashWithoutPII);

      const payload = buildCanonicalResultPayload(resultWithPII);
      expect(payload).not.toHaveProperty('studentName');
      expect(payload).not.toHaveProperty('studentEmail');
      expect(payload).not.toHaveProperty('studentId');
      expect(payload).not.toHaveProperty('remarks');
      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('token');
      expect(payload).not.toHaveProperty('ipAddress');
      expect(payload).not.toHaveProperty('userAgent');
      expect(payload).not.toHaveProperty('evaluatorId');
    });
  });

  describe('10. Hash format specification', () => {
    it('should produce a lowercase 64-character hexadecimal SHA-256 string', () => {
      const hash = calculateResultHash(baseResultData);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it('should verify hash case-insensitively', () => {
      const hash = calculateResultHash(baseResultData);
      expect(verifyResultHash(baseResultData, hash.toUpperCase())).toBe(true);
      expect(verifyResultHash(baseResultData, hash.toLowerCase())).toBe(true);
      expect(verifyResultHash(baseResultData, 'invalid-hash')).toBe(false);
      expect(verifyResultHash(baseResultData, null)).toBe(false);
    });
  });

  describe('11. Null and optional fields contract', () => {
    it('should handle null publishedAt and null grade deterministically', () => {
      const resultWithNulls = {
        id: 'r1',
        examId: 'e1',
        marksObtained: 70,
        maximumMarks: 100,
        grade: null,
        publishedAt: null,
      };

      const payload = buildCanonicalResultPayload(resultWithNulls);
      expect(payload.grade).toBeNull();
      expect(payload.publishedAt).toBeNull();

      const serialized = serializeCanonicalPayload(payload);
      expect(serialized).toBe(
        '{"examId":"e1","grade":null,"marksObtained":"70.00","maximumMarks":"100.00","publishedAt":null,"resultId":"r1","schemaVersion":"1.0"}'
      );

      const hash1 = calculateResultHash(resultWithNulls);
      const hash2 = calculateResultHash(resultWithNulls);
      expect(hash1).toBe(hash2);
      expect(/^[a-f0-9]{64}$/.test(hash1)).toBe(true);
    });

    it('should default maximumMarks to 100.00 if undefined in input', () => {
      const resultNoMax = {
        id: 'r1',
        examId: 'e1',
        marksObtained: 90,
      };

      const payload = buildCanonicalResultPayload(resultNoMax);
      expect(payload.maximumMarks).toBe('100.00');
    });

    it('should handle Date instances for publishedAt correctly', () => {
      const dateObj = new Date('2026-03-15T10:00:00.000Z');
      const payload = buildCanonicalResultPayload({
        ...baseResultData,
        publishedAt: dateObj,
      });
      expect(payload.publishedAt).toBe('2026-03-15T10:00:00.000Z');
    });

    it('should normalize identifiers by trimming and lowercasing', () => {
      expect(normalizeIdentifier('  ABC-123-DEF  ')).toBe('abc-123-def');
      expect(normalizeIdentifier(null)).toBe('');
    });

    it('should normalize invalid dates to null', () => {
      expect(normalizeDate('invalid-date-string')).toBeNull();
      expect(normalizeDate(null)).toBeNull();
    });
  });

  describe('12. Existing HashingService behavior', () => {
    it('should ensure HashingService core functions remain unaltered and compatible', () => {
      const rawText = 'Phase 6A Hashing Integrity Test';
      const hash = HashingService.hashData(rawText);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
      expect(HashingService.verifyHash(rawText, hash)).toBe(true);
      expect(HashingService.verifyHash(rawText, 'mismatch')).toBe(false);
    });
  });
});
