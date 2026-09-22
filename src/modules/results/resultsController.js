'use strict';

const ResultsService = require('./resultsService');
const { sendSuccess, sendPaginated } = require('../../utils/apiResponse');

class ResultsController {
  /**
   * Record a single result for an examination
   * POST /api/v1/exams/:examId/results
   */
  static async create(req, res, next) {
    try {
      const { examId } = req.params;
      const { studentId, marksObtained, remarks } = req.body;
      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      const result = await ResultsService.createResult({
        examId,
        studentId,
        marksObtained,
        remarks,
        user: req.user,
        userContext,
      });

      return sendSuccess(res, {
        message: 'Result recorded successfully',
        data: {
          result,
        },
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Record a batch of results for an examination
   * POST /api/v1/exams/:examId/results/batch
   */
  static async createBatch(req, res, next) {
    try {
      const { examId } = req.params;
      const results = Array.isArray(req.body)
        ? req.body
        : req.body && (req.body.results || req.body.items);

      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      const created = await ResultsService.createBatchResults({
        examId,
        results,
        user: req.user,
        userContext,
      });

      return sendSuccess(res, {
        message: 'Batch results recorded successfully',
        data: {
          results: created,
          count: created.length,
        },
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve paginated results for an examination
   * GET /api/v1/exams/:examId/results
   */
  static async getByExamId(req, res, next) {
    try {
      const { examId } = req.params;
      const { page, limit, submissionStatus, studentId } = req.query;
      const userContext = req.user
        ? {
            id: req.user.id,
            role: req.user.role,
            departmentId: req.user.departmentId,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          }
        : {};

      const resultsData = await ResultsService.getResultsByExamId({
        examId,
        page,
        limit,
        submissionStatus,
        studentId,
        user: req.user,
        userContext,
      });

      return sendPaginated(res, {
        message: 'Results retrieved successfully',
        items: resultsData.items,
        page: resultsData.page,
        limit: resultsData.limit,
        totalItems: resultsData.totalItems,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve a single result by ID
   * GET /api/v1/results/:id
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;
      const userContext = req.user
        ? {
            id: req.user.id,
            role: req.user.role,
            departmentId: req.user.departmentId,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          }
        : {};

      const result = await ResultsService.getResultById(id, userContext);

      return sendSuccess(res, {
        message: 'Result retrieved successfully',
        data: {
          result,
        },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Transition result lifecycle status
   * PATCH /api/v1/results/:id/status
   */
  static async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      const result = await ResultsService.transitionResultStatus({
        id,
        status,
        user: req.user,
        userContext,
      });

      return sendSuccess(res, {
        message: 'Result status updated successfully',
        data: {
          result,
        },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Batch transition result lifecycle status for an examination
   * PATCH /api/v1/exams/:examId/results/status
   */
  static async updateBatchStatus(req, res, next) {
    try {
      const { examId } = req.params;
      const { status } = req.body;
      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      const batchData = await ResultsService.transitionBatchResultStatus({
        examId,
        status,
        user: req.user,
        userContext,
      });

      return sendSuccess(res, {
        message: 'Batch result status updated successfully',
        data: {
          count: batchData.count,
          status: batchData.status,
          results: batchData.results,
        },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify canonical hash and blockchain anchor status for a result
   * GET /api/v1/results/:id/verify
   */
  static async verify(req, res, next) {
    try {
      const { id } = req.params;
      const expectedHash = req.query.expectedHash || req.query.hash || null;
      const userContext = req.user
        ? {
            id: req.user.id,
            role: req.user.role,
            departmentId: req.user.departmentId,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          }
        : {};

      const verificationData = await ResultsService.verifyResult(id, userContext, {
        expectedHash,
      });

      return sendSuccess(res, {
        message: verificationData.message || 'Result verification completed',
        data: verificationData,
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reconcile published examination results against blockchain transactions (Phase 6D)
   * GET /api/v1/results/reconciliation
   */
  static async reconcile(req, res, next) {
    try {
      const { examId, page, limit } = req.query;
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
      const offset = (pageNum - 1) * limitNum;

      const data = await ResultsService.reconcileResults(
        { examId, limit: limitNum, offset },
        req.user
      );

      return sendSuccess(res, {
        message: 'Published results blockchain reconciliation completed successfully',
        data,
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ResultsController;
