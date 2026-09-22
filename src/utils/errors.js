'use strict';

class AppError extends Error {
  constructor(message = 'Operation failed', statusCode = 400, code = 'OPERATION_FAILED', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access', codeOrDetails = null, details = null) {
    let code = 'UNAUTHORIZED';
    let errDetails = details;
    if (typeof codeOrDetails === 'string') {
      code = codeOrDetails;
    } else if (codeOrDetails !== null) {
      errDetails = codeOrDetails;
    }
    super(message, 401, code, errDetails);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden: insufficient permissions', codeOrDetails = null, details = null) {
    let code = 'FORBIDDEN';
    let errDetails = details;
    if (typeof codeOrDetails === 'string') {
      code = codeOrDetails;
    } else if (codeOrDetails !== null) {
      errDetails = codeOrDetails;
    }
    super(message, 403, code, errDetails);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict with existing resource', codeOrDetails = null, details = null) {
    let code = 'CONFLICT';
    let errDetails = details;
    if (typeof codeOrDetails === 'string') {
      code = codeOrDetails;
    } else if (codeOrDetails !== null) {
      errDetails = codeOrDetails;
    }
    super(message, 409, code, errDetails);
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
};
