'use strict';

const { sendSuccess, sendError, sendPaginated } = require('../src/utils/apiResponse');

function createMockRes() {
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
  return res;
}

describe('API Response Envelope Utilities', () => {
  describe('sendSuccess', () => {
    it('should format standard successful response envelope with default 200 status', () => {
      const res = createMockRes();
      sendSuccess(res, { message: 'Operation completed', data: { id: 1 } });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Operation completed',
        data: { id: 1 },
        error: null,
      });
    });

    it('should default data to empty object if null is passed', () => {
      const res = createMockRes();
      sendSuccess(res, { message: 'Deleted', data: null, statusCode: 200 });

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual({});
      expect(res.body.error).toBeNull();
    });
  });

  describe('sendError', () => {
    it('should format standard error response envelope with 400 default', () => {
      const res = createMockRes();
      sendError(res, {
        message: 'Invalid input',
        code: 'VALIDATION_ERROR',
        details: [{ field: 'email', message: 'Invalid format' }],
        statusCode: 422,
      });

      expect(res.statusCode).toBe(422);
      expect(res.body).toEqual({
        success: false,
        message: 'Invalid input',
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          details: [{ field: 'email', message: 'Invalid format' }],
        },
      });
    });
  });

  describe('sendPaginated', () => {
    it('should calculate pagination metadata correctly', () => {
      const res = createMockRes();
      sendPaginated(res, {
        message: 'Items fetched',
        items: ['item1', 'item2'],
        page: 2,
        limit: 10,
        totalItems: 25,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual(['item1', 'item2']);
      expect(res.body.data.pagination).toEqual({
        page: 2,
        limit: 10,
        totalItems: 25,
        totalPages: 3,
      });
      expect(res.body.error).toBeNull();
    });
  });
});
