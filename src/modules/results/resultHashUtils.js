'use strict';

const HashingService = require('../../services/hashingService');

const SCHEMA_VERSION = '1.0';

/**
 * Normalizes decimal marks to a fixed 2-decimal place string representation
 * @param {number|string} val
 * @returns {string}
 */
function normalizeDecimal(val) {
  const num = Number(val);
  if (isNaN(num)) {
    throw new TypeError(`Cannot normalize invalid numeric value: '${val}'`);
  }
  return num.toFixed(2);
}

/**
 * Normalizes ISO date strings or Date objects to UTC representation
 * @param {Date|string|null} dateVal
 * @returns {string|null}
 */
function normalizeDate(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Normalizes a UUID or string identifier to lowercase trimmed string
 * @param {string} id
 * @returns {string}
 */
function normalizeIdentifier(id) {
  if (!id) return '';
  return String(id).trim().toLowerCase();
}

/**
 * Extract raw data object from Sequelize model instance or plain object
 * @param {Object} result
 * @returns {Object}
 */
function toPlainObject(result) {
  if (!result) return {};
  if (typeof result.toJSON === 'function') {
    return result.toJSON();
  }
  return { ...result };
}

/**
 * Builds a deterministic canonical payload for a Result record
 * Extracts strictly immutable, anchor-relevant attributes in deterministic order.
 *
 * Fields included:
 * - resultId
 * - examId
 * - marksObtained
 * - maximumMarks
 * - grade
 * - publishedAt
 * - schemaVersion
 *
 * Excluded to prevent PII leaks & non-determinism:
 * - Student full name, email, remarks, passwords, tokens, IP address, user agent.
 * - Plaintext student identifiers (deferred to agreed pseudonym/reference design).
 *
 * @param {Object} resultInput - Result model instance or plain object
 * @returns {Object} Deterministic canonical payload object
 */
function buildCanonicalResultPayload(resultInput) {
  const raw = toPlainObject(resultInput);

  const resultId = normalizeIdentifier(raw.id || raw.resultId);
  const examId = normalizeIdentifier(raw.examId);

  if (!resultId || !examId) {
    throw new Error('Result payload missing required identifiers (resultId, examId)');
  }

  const marksObtained = normalizeDecimal(raw.marksObtained);
  const maximumMarks = normalizeDecimal(raw.maximumMarks !== undefined ? raw.maximumMarks : 100);
  const grade = raw.grade ? String(raw.grade).trim().toUpperCase() : null;
  const publishedAt = normalizeDate(raw.publishedAt);

  return {
    examId,
    grade,
    marksObtained,
    maximumMarks,
    publishedAt,
    resultId,
    schemaVersion: SCHEMA_VERSION,
  };
}

/**
 * Serializes canonical payload to a deterministic JSON string with sorted keys
 * @param {Object} payload
 * @returns {string} Deterministic JSON string
 */
function serializeCanonicalPayload(payload) {
  const sortedKeys = Object.keys(payload).sort();
  const orderedObj = {};
  for (const key of sortedKeys) {
    orderedObj[key] = payload[key] === undefined ? null : payload[key];
  }
  return JSON.stringify(orderedObj);
}

/**
 * Generates the authoritative SHA-256 canonical hash for a Result
 * @param {Object} resultInput - Result instance or plain object
 * @returns {string} 64-character lowercase SHA-256 hexadecimal hash
 */
function calculateResultHash(resultInput) {
  const canonicalPayload = buildCanonicalResultPayload(resultInput);
  const serialized = serializeCanonicalPayload(canonicalPayload);
  return HashingService.hashData(serialized);
}

/**
 * Verifies if a Result matches an expected blockchain or anchor hash
 * @param {Object} resultInput - Result instance or plain object
 * @param {string} expectedHash - 64-character SHA-256 hash
 * @returns {boolean} True if data matches hash exactly, false otherwise
 */
function verifyResultHash(resultInput, expectedHash) {
  if (!expectedHash || typeof expectedHash !== 'string') {
    return false;
  }
  try {
    const actualHash = calculateResultHash(resultInput);
    return actualHash.toLowerCase() === expectedHash.trim().toLowerCase();
  } catch (_) {
    return false;
  }
}

module.exports = {
  SCHEMA_VERSION,
  normalizeDecimal,
  normalizeDate,
  normalizeIdentifier,
  buildCanonicalResultPayload,
  serializeCanonicalPayload,
  calculateResultHash,
  verifyResultHash,
};
