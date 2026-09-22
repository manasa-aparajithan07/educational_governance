'use strict';

/**
 * Standardized API Response Utilities
 */
function sendSuccess(res, { message = 'Operation completed successfully', data = {}, statusCode = 200 }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data: data === null ? {} : data,
    error: null,
  });
}

function sendError(res, { message = 'Operation failed', code = 'OPERATION_FAILED', details = null, statusCode = 400 }) {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error: {
      code,
      details,
    },
  });
}

function sendPaginated(res, {
  message = 'Records retrieved successfully',
  items = [],
  page = 1,
  limit = 10,
  totalItems = 0,
  statusCode = 200,
}) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const total = parseInt(totalItems, 10) || 0;
  const totalPages = Math.ceil(total / limitNum) || 0;

  return res.status(statusCode).json({
    success: true,
    message,
    data: {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems: total,
        totalPages,
      },
    },
    error: null,
  });
}

module.exports = {
  sendSuccess,
  sendError,
  sendPaginated,
};
