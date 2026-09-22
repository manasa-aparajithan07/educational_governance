'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const { sendError } = require('../utils/apiResponse');

/**
 * Rate limiter middleware for authentication routes (login, register, password change)
 * Prevents brute-force attacks and credential stuffing
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.env === 'test' ? 1000 : 30, // 30 requests per 15 minutes in dev/prod, generous in tests
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return sendError(res, {
      message: 'Too many authentication attempts from this IP address. Please try again after 15 minutes.',
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
    });
  },
});

module.exports = {
  authRateLimiter,
};
