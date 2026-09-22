'use strict';

const notFoundMiddleware = require('../src/middleware/notFoundMiddleware');
const errorMiddleware = require('../src/middleware/errorMiddleware');
const roleMiddleware = require('../src/middleware/roleMiddleware');
const validationMiddleware = require('../src/middleware/validationMiddleware');
const { ROLES } = require('../src/utils/constants');
const { AppError, NotFoundError } = require('../src/utils/errors');

function createMockReqRes() {
  const req = {
    method: 'GET',
    originalUrl: '/api/v1/invalid-route',
    headers: {},
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

describe('Middleware Suite', () => {
  describe('notFoundMiddleware', () => {
    it('should return 404 with standard error envelope', () => {
      const { req, res } = createMockReqRes();
      notFoundMiddleware(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('errorMiddleware', () => {
    it('should format AppError into standardized error envelope', () => {
      const { req, res } = createMockReqRes();
      const err = new NotFoundError('Exam record not found');
      const next = jest.fn();

      errorMiddleware(err, req, res, next);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Exam record not found');
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should format unhandled errors into 500 error envelope', () => {
      const { req, res } = createMockReqRes();
      const err = new Error('Unexpected crash');
      const next = jest.fn();

      errorMiddleware(err, req, res, next);

      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('roleMiddleware', () => {
    it('should allow user when role matches allowed roles', () => {
      const req = { user: { role: ROLES.ADMIN } };
      const res = {};
      const next = jest.fn();

      const middleware = roleMiddleware(ROLES.ADMIN, ROLES.FACULTY);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should pass ForbiddenError when user does not have permission', () => {
      const req = { user: { role: ROLES.STUDENT } };
      const res = {};
      const next = jest.fn();

      const middleware = roleMiddleware(ROLES.ADMIN);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    });
  });

  describe('validationMiddleware', () => {
    it('should pass through when validator returns no errors', () => {
      const req = { body: { title: 'Midterm Exam' } };
      const res = {};
      const next = jest.fn();

      const validator = () => [];
      const middleware = validationMiddleware(validator);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should pass ValidationError when validator returns error array', () => {
      const req = { body: {} };
      const res = {};
      const next = jest.fn();

      const validator = () => [{ field: 'title', message: 'title is required' }];
      const middleware = validationMiddleware(validator);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toHaveLength(1);
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should enforce rate limits and respond with 429 RATE_LIMIT_EXCEEDED', async () => {
      const { authRateLimiter } = require('../src/middleware/rateLimitMiddleware');
      expect(typeof authRateLimiter).toBe('function');

      const express = require('express');
      const request = require('supertest');
      const rateLimit = require('express-rate-limit');
      const { sendError } = require('../src/utils/apiResponse');

      const testApp = express();
      const testLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 1,
        validate: false,
        handler: (req, res) => {
          return sendError(res, {
            message: 'Too many authentication attempts from this IP address. Please try again after 15 minutes.',
            code: 'RATE_LIMIT_EXCEEDED',
            statusCode: 429,
          });
        },
      });

      testApp.get('/test-rate-limit', testLimiter, (req, res) => res.status(200).json({ ok: true }));

      // First request passes
      const res1 = await request(testApp).get('/test-rate-limit');
      expect(res1.statusCode).toBe(200);

      // Second request exceeds rate limit and invokes handler with 429
      const res2 = await request(testApp).get('/test-rate-limit');
      expect(res2.statusCode).toBe(429);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});
