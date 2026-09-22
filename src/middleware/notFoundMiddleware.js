'use strict';

const { sendError } = require('../utils/apiResponse');

function notFoundMiddleware(req, res, next) {
  return sendError(res, {
    message: `Cannot ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
    details: `The requested endpoint '${req.originalUrl}' does not exist on this server.`,
    statusCode: 404,
  });
}

module.exports = notFoundMiddleware;
