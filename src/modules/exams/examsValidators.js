'use strict';

const { validateUuid } = require('../../validators/commonValidators');
const { EXAM_STATUS, EXAM_TYPE, LIFECYCLE_STATUSES } = require('../../utils/constants');

const ALLOWED_CREATION_STATUSES = [EXAM_STATUS.DRAFT, EXAM_STATUS.SCHEDULED];

function validateDateFormat(dateStr) {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const timestamp = Date.parse(dateStr);
  return !isNaN(timestamp);
}

function validateTimeFormat(timeStr) {
  if (typeof timeStr !== 'string') return false;
  return /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.test(timeStr.trim());
}

function validateCreateExam(req) {
  const errors = [];
  const {
    title,
    subjectId,
    departmentId,
    examDate,
    startTime,
    endTime,
    duration,
    maximumMarks,
    status,
    examCode,
    examType,
    createdBy,
  } = req.body || {};

  // Title validation
  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    errors.push({ field: 'title', message: 'Title is required and must be at least 3 characters long' });
  }

  // Subject ID validation
  if (!subjectId || typeof subjectId !== 'string' || !validateUuid(subjectId)) {
    errors.push({ field: 'subjectId', message: 'A valid subjectId (UUID) is required' });
  }

  // Department ID validation
  if (!departmentId || typeof departmentId !== 'string' || !validateUuid(departmentId)) {
    errors.push({ field: 'departmentId', message: 'A valid departmentId (UUID) is required' });
  }

  // Exam Date validation
  if (!examDate || !validateDateFormat(examDate)) {
    errors.push({ field: 'examDate', message: 'A valid examDate in YYYY-MM-DD format is required' });
  }

  // Start Time validation
  if (startTime !== undefined && startTime !== null && !validateTimeFormat(startTime)) {
    errors.push({ field: 'startTime', message: 'startTime must be a valid time in HH:mm or HH:mm:ss format' });
  }

  // End Time validation
  if (endTime !== undefined && endTime !== null && !validateTimeFormat(endTime)) {
    errors.push({ field: 'endTime', message: 'endTime must be a valid time in HH:mm or HH:mm:ss format' });
  }

  // Duration validation (must be positive integer in minutes)
  if (
    duration === undefined ||
    duration === null ||
    typeof duration !== 'number' ||
    !Number.isInteger(duration) ||
    duration <= 0
  ) {
    errors.push({ field: 'duration', message: 'Duration is required and must be a positive integer (in minutes)' });
  }

  // Maximum Marks validation (must be positive number)
  if (
    maximumMarks === undefined ||
    maximumMarks === null ||
    typeof maximumMarks !== 'number' ||
    maximumMarks <= 0
  ) {
    errors.push({ field: 'maximumMarks', message: 'Maximum marks is required and must be a positive number' });
  }

  // Status validation (restricted to initial creation statuses: DRAFT, SCHEDULED)
  if (status !== undefined && status !== null && !ALLOWED_CREATION_STATUSES.includes(status)) {
    errors.push({
      field: 'status',
      message: `Status must be one of: ${ALLOWED_CREATION_STATUSES.join(', ')}`,
    });
  }

  // Exam Code validation (if provided)
  if (examCode !== undefined && examCode !== null && (typeof examCode !== 'string' || examCode.trim().length < 2)) {
    errors.push({ field: 'examCode', message: 'Exam code must be at least 2 characters long if specified' });
  }

  // Exam Type validation (if provided)
  if (examType !== undefined && examType !== null && !Object.values(EXAM_TYPE).includes(examType)) {
    errors.push({
      field: 'examType',
      message: `Exam type must be one of: ${Object.values(EXAM_TYPE).join(', ')}`,
    });
  }

  // Creator validation (if explicitly passed in body)
  if (createdBy !== undefined && createdBy !== null && (typeof createdBy !== 'string' || !validateUuid(createdBy))) {
    errors.push({ field: 'createdBy', message: 'createdBy must be a valid user UUID' });
  }

  return errors;
}

function validateUpdateExam(req) {
  const errors = [];
  const {
    title,
    subjectId,
    departmentId,
    examDate,
    startTime,
    endTime,
    duration,
    maximumMarks,
    status,
    examCode,
    examType,
    createdBy,
  } = req.body || {};

  if (title !== undefined && (typeof title !== 'string' || title.trim().length < 3)) {
    errors.push({ field: 'title', message: 'Title must be at least 3 characters long' });
  }

  if (subjectId !== undefined && (typeof subjectId !== 'string' || !validateUuid(subjectId))) {
    errors.push({ field: 'subjectId', message: 'subjectId must be a valid UUID' });
  }

  if (departmentId !== undefined && (typeof departmentId !== 'string' || !validateUuid(departmentId))) {
    errors.push({ field: 'departmentId', message: 'departmentId must be a valid UUID' });
  }

  if (examDate !== undefined && !validateDateFormat(examDate)) {
    errors.push({ field: 'examDate', message: 'examDate must be a valid date in YYYY-MM-DD format' });
  }

  if (startTime !== undefined && startTime !== null && !validateTimeFormat(startTime)) {
    errors.push({ field: 'startTime', message: 'startTime must be a valid time in HH:mm or HH:mm:ss format' });
  }

  if (endTime !== undefined && endTime !== null && !validateTimeFormat(endTime)) {
    errors.push({ field: 'endTime', message: 'endTime must be a valid time in HH:mm or HH:mm:ss format' });
  }

  if (
    duration !== undefined &&
    (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0)
  ) {
    errors.push({ field: 'duration', message: 'Duration must be a positive integer (in minutes)' });
  }

  if (
    maximumMarks !== undefined &&
    (typeof maximumMarks !== 'number' || maximumMarks <= 0)
  ) {
    errors.push({ field: 'maximumMarks', message: 'Maximum marks must be a positive number' });
  }

  if (status !== undefined) {
    errors.push({
      field: 'status',
      message: 'Examination status cannot be updated via generic update. Use PATCH /api/v1/exams/:id/status instead',
    });
  }

  if (examCode !== undefined && (typeof examCode !== 'string' || examCode.trim().length < 2)) {
    errors.push({ field: 'examCode', message: 'Exam code must be at least 2 characters long' });
  }

  if (examType !== undefined && examType !== null && !Object.values(EXAM_TYPE).includes(examType)) {
    errors.push({
      field: 'examType',
      message: `Exam type must be one of: ${Object.values(EXAM_TYPE).join(', ')}`,
    });
  }

  if (createdBy !== undefined) {
    errors.push({ field: 'createdBy', message: 'Exam creator cannot be modified' });
  }

  return errors;
}

/**
 * Validate examination lifecycle state transition request
 */
function validateUpdateExamStatus(req) {
  const errors = [];
  const { status } = req.body || {};

  if (!status || typeof status !== 'string' || status.trim().length === 0) {
    errors.push({ field: 'status', message: 'Target status is required' });
  } else if (!LIFECYCLE_STATUSES.includes(status.trim())) {
    errors.push({
      field: 'status',
      message: `Invalid status '${status}'. Supported lifecycle statuses: ${LIFECYCLE_STATUSES.join(', ')}`,
    });
  }

  return errors;
}

module.exports = {
  ALLOWED_CREATION_STATUSES,
  LIFECYCLE_STATUSES,
  validateDateFormat,
  validateTimeFormat,
  validateCreateExam,
  validateUpdateExam,
  validateUpdateExamStatus,
};
