'use strict';

const logger = require('../utils/logger');
const { sendError } = require('../utils/apiResponse');
const { AppError } = require('../utils/errors');

function errorMiddleware(err, req, res, next) {
  logger.error(`[Error] ${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  if (err instanceof AppError) {
    return sendError(res, {
      message: err.message,
      code: err.code,
      details: err.details,
      statusCode: err.statusCode,
    });
  }

  // Handle Sequelize validation errors
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const details = (err.errors || []).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return sendError(res, {
      message: 'Database validation failed',
      code: 'VALIDATION_ERROR',
      details,
      statusCode: 422,
    });
  }

  // Default internal server error
  return sendError(res, {
    message: 'An internal server error occurred',
    code: 'INTERNAL_SERVER_ERROR',
    details: process.env.NODE_ENV === 'development' ? err.message : null,
    statusCode: 500,
  });
}

module.exports = errorMiddleware;
