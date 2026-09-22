'use strict';

const { validateUuid } = require('../../validators/commonValidators');
const { ValidationError } = require('../../utils/errors');

/**
 * Validates question paper ID parameter
 */
function validateQuestionPaperId(id) {
  if (!id || typeof id !== 'string' || !validateUuid(id)) {
    return false;
  }
  return true;
}

/**
 * Validates multipart file upload requirement
 */
function validateFilePresence(req) {
  if (!req.file) {
    throw new ValidationError('Question paper file is required', [
      {
        field: 'file',
        message: 'A valid PDF or DOCX file is required in multipart field "file"',
      },
    ]);
  }
}

module.exports = {
  validateQuestionPaperId,
  validateFilePresence,
};
