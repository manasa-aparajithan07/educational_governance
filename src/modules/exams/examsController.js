'use strict';

const ExamsService = require('./examsService');
const { sendSuccess, sendPaginated } = require('../../utils/apiResponse');

class ExamsController {
  /**
   * POST /api/v1/exams
   */
  static async create(req, res, next) {
    try {
      const exam = await ExamsService.createExam({
        ...req.body,
        performedBy: req.user.id,
        userRole: req.user.role,
        userDepartmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.headers ? req.headers['user-agent'] : null,
      });

      return sendSuccess(res, {
        message: 'Examination created successfully',
        data: { exam },
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/exams
   */
  static async list(req, res, next) {
    try {
      const { page, limit, status, departmentId, subjectId, examDate, search } = req.query;
      const result = await ExamsService.listExams(
        {
          page,
          limit,
          status,
          departmentId,
          subjectId,
          examDate,
          search,
        },
        {
          id: req.user.id,
          role: req.user.role,
          departmentId: req.user.departmentId,
        }
      );

      return sendPaginated(res, {
        message: 'Examinations retrieved successfully',
        items: result.items,
        page: result.page,
        limit: result.limit,
        totalItems: result.totalItems,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/exams/:id
   */
  static async getById(req, res, next) {
    try {
      const exam = await ExamsService.getExamById(req.params.id, {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
      });

      return sendSuccess(res, {
        message: 'Examination retrieved successfully',
        data: { exam },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/exams/:id & PATCH /api/v1/exams/:id
   */
  static async update(req, res, next) {
    try {
      const exam = await ExamsService.updateExam(req.params.id, req.body, {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.headers ? req.headers['user-agent'] : null,
      });

      return sendSuccess(res, {
        message: 'Examination updated successfully',
        data: { exam },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/exams/:id
   */
  static async delete(req, res, next) {
    try {
      const result = await ExamsService.deleteExam(req.params.id, {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.headers ? req.headers['user-agent'] : null,
      });

      return sendSuccess(res, {
        message: result.message,
        data: {},
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/exams/:id/status
   */
  static async updateStatus(req, res, next) {
    try {
      const { status } = req.body;
      const result = await ExamsService.transitionExamStatus(req.params.id, status, {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.headers ? req.headers['user-agent'] : null,
      });

      return sendSuccess(res, {
        message: `Examination status transitioned from ${result.previousStatus} to ${result.newStatus} successfully`,
        data: {
          exam: result.exam,
          lifecycle: {
            previousStatus: result.previousStatus,
            currentStatus: result.newStatus,
            transitionedAt: new Date().toISOString(),
          },
        },
        statusCode: 200,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ExamsController;
