'use strict';

const { validateUuid } = require('../../validators/commonValidators');
const { RESULT_STATUS } = require('../../utils/constants');

/**
 * Validate numeric marks value and decimal precision (DECIMAL(6,2))
 * @param {*} val
 * @param {string} fieldName
 * @returns {Array} Array of validation error objects
 */
function validateMarks(val, fieldName = 'marksObtained') {
  const errors = [];
  if (val === undefined || val === null || val === '') {
    errors.push({ field: fieldName, message: `${fieldName} is required` });
    return errors;
  }

  const num = Number(val);
  if (isNaN(num) || typeof val === 'boolean') {
    errors.push({ field: fieldName, message: `${fieldName} must be numeric` });
    return errors;
  }

  if (num < 0) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be greater than or equal to 0`,
    });
    return errors;
  }

  const str = String(val).trim();
  if (str.includes('.') && str.split('.')[1].length > 2) {
    errors.push({
      field: fieldName,
      message: `${fieldName} cannot have more than 2 decimal places (DECIMAL(6,2))`,
    });
  }

  return errors;
}

/**
 * Validator for single result creation
 * POST /api/v1/exams/:examId/results
 */
function validateCreateResult(req) {
  const errors = [];
  const { examId } = req.params || {};
  const { studentId, marksObtained, remarks } = req.body || {};

  // 1. Validate examId from route params
  if (!examId || !validateUuid(examId)) {
    errors.push({ field: 'examId', message: 'examId must be a valid UUID' });
  }

  // 2. Validate studentId
  if (!studentId || typeof studentId !== 'string' || !validateUuid(studentId)) {
    errors.push({
      field: 'studentId',
      message: 'studentId is required and must be a valid UUID',
    });
  }

  // 3. Validate marksObtained
  const marksErrors = validateMarks(marksObtained, 'marksObtained');
  errors.push(...marksErrors);

  // 4. Validate remarks (optional)
  if (remarks !== undefined && remarks !== null && typeof remarks !== 'string') {
    errors.push({ field: 'remarks', message: 'remarks must be a string if provided' });
  }

  return errors;
}

/**
 * Validator for batch result entry
 * POST /api/v1/exams/:examId/results/batch
 */
function validateBatchResult(req) {
  const errors = [];
  const { examId } = req.params || {};
  const items = Array.isArray(req.body)
    ? req.body
    : req.body && (req.body.results || req.body.items);

  // 1. Validate examId
  if (!examId || !validateUuid(examId)) {
    errors.push({ field: 'examId', message: 'examId must be a valid UUID' });
  }

  // 2. Validate batch payload array
  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.push({
      field: 'results',
      message: 'Batch payload must contain a non-empty array of results (in "results" or "items")',
    });
    return errors;
  }

  // 3. Validate items and check for duplicates within the batch
  const seenStudents = new Set();
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push({
        field: `results[${index}]`,
        message: 'Each result entry must be an object',
      });
      return;
    }

    // studentId validation
    if (!item.studentId || typeof item.studentId !== 'string' || !validateUuid(item.studentId)) {
      errors.push({
        field: `results[${index}].studentId`,
        message: 'A valid studentId (UUID) is required',
      });
    } else {
      if (seenStudents.has(item.studentId)) {
        errors.push({
          field: `results[${index}].studentId`,
          message: `Duplicate studentId '${item.studentId}' in batch payload`,
        });
      }
      seenStudents.add(item.studentId);
    }

    // marksObtained validation
    const itemMarksErrors = validateMarks(
      item.marksObtained,
      `results[${index}].marksObtained`
    );
    errors.push(...itemMarksErrors);

    // remarks validation
    if (
      item.remarks !== undefined &&
      item.remarks !== null &&
      typeof item.remarks !== 'string'
    ) {
      errors.push({
        field: `results[${index}].remarks`,
        message: `results[${index}].remarks must be a string if provided`,
      });
    }
  });

  return errors;
}

/**
 * Validator for result status transition
 * PATCH /api/v1/results/:id/status
 */
function validateUpdateResultStatus(req) {
  const errors = [];
  const { id } = req.params || {};
  const { status } = req.body || {};

  if (!id || !validateUuid(id)) {
    errors.push({ field: 'id', message: 'id must be a valid UUID' });
  }

  if (!status || typeof status !== 'string' || status.trim().length === 0) {
    errors.push({ field: 'status', message: 'Target status is required' });
  } else if (!Object.values(RESULT_STATUS).includes(status.trim())) {
    errors.push({
      field: 'status',
      message: `Status must be one of: ${Object.values(RESULT_STATUS).join(', ')}`,
    });
  }

  return errors;
}

/**
 * Validator for batch result status transition
 * PATCH /api/v1/exams/:examId/results/status
 */
function validateBatchResultStatus(req) {
  const errors = [];
  const { examId } = req.params || {};
  const { status } = req.body || {};

  if (!examId || !validateUuid(examId)) {
    errors.push({ field: 'examId', message: 'examId must be a valid UUID' });
  }

  if (!status || typeof status !== 'string' || status.trim().length === 0) {
    errors.push({ field: 'status', message: 'Target status is required' });
  } else if (!Object.values(RESULT_STATUS).includes(status.trim())) {
    errors.push({
      field: 'status',
      message: `Status must be one of: ${Object.values(RESULT_STATUS).join(', ')}`,
    });
  }

  return errors;
}

/**
 * Validator for result hash verification query parameters
 * GET /api/v1/results/:id/verify
 */
function validateVerifyResult(req) {
  const errors = [];
  const query = req.query || {};

  // Check expectedHash query param
  if (query.expectedHash !== undefined) {
    if (Array.isArray(query.expectedHash)) {
      errors.push({
        field: 'expectedHash',
        message: 'expectedHash must be a single string, multiple values provided',
      });
    } else if (
      typeof query.expectedHash !== 'string' ||
      !/^[a-fA-F0-9]{64}$/.test(query.expectedHash.trim())
    ) {
      errors.push({
        field: 'expectedHash',
        message: 'expectedHash must be a valid 64-character hexadecimal SHA-256 hash',
      });
    }
  }

  // Check hash alias query param
  if (query.hash !== undefined) {
    if (Array.isArray(query.hash)) {
      errors.push({
        field: 'hash',
        message: 'hash must be a single string, multiple values provided',
      });
    } else if (
      typeof query.hash !== 'string' ||
      !/^[a-fA-F0-9]{64}$/.test(query.hash.trim())
    ) {
      errors.push({
        field: 'hash',
        message: 'hash must be a valid 64-character hexadecimal SHA-256 hash',
      });
    }
  }

  return errors;
}

module.exports = {
  validateCreateResult,
  validateBatchResult,
  validateMarks,
  validateUpdateResultStatus,
  validateBatchResultStatus,
  validateVerifyResult,
};

