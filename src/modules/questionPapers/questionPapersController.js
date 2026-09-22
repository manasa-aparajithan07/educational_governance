'use strict';

const fs = require('fs');
const QuestionPapersService = require('./questionPapersService');
const { sendSuccess } = require('../../utils/apiResponse');

class QuestionPapersController {
  /**
   * Upload question paper for an examination
   * POST /api/v1/exams/:examId/question-paper
   */
  static async upload(req, res, next) {
    try {
      const { examId } = req.params;
      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      const questionPaper = await QuestionPapersService.uploadQuestionPaper({
        examId,
        file: req.file,
        user: req.user,
        userContext,
      });

      return sendSuccess(res, {
        message: 'Question paper uploaded successfully',
        data: {
          questionPaper,
        },
        statusCode: 201,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve question paper metadata by ID
   * GET /api/v1/question-papers/:id
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;
      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };
      const questionPaper = await QuestionPapersService.getQuestionPaperById(
        id,
        userContext
      );

      return sendSuccess(res, {
        message: 'Question paper retrieved successfully',
        data: {
          questionPaper,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve question paper metadata by examination ID
   * GET /api/v1/exams/:examId/question-paper
   */
  static async getByExamId(req, res, next) {
    try {
      const { examId } = req.params;
      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };
      const questionPaper =
        await QuestionPapersService.getQuestionPaperByExamId(
          examId,
          userContext
        );

      return sendSuccess(res, {
        message: 'Question paper retrieved successfully',
        data: {
          questionPaper,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Securely stream question paper file for download
   * GET /api/v1/question-papers/:id/download
   */
  static async download(req, res, next) {
    try {
      const { id } = req.params;
      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      const { paper, filePath } =
        await QuestionPapersService.downloadQuestionPaper(id, userContext);

      res.setHeader(
        'Content-Type',
        paper.mimeType || 'application/octet-stream'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(paper.fileName)}"`
      );
      if (paper.fileSize) {
        res.setHeader('Content-Length', paper.fileSize);
      }

      const fileStream = fs.createReadStream(filePath);
      fileStream.on('error', (err) => {
        if (!res.headersSent) {
          next(err);
        }
      });
      fileStream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify question paper integrity and detect tampering
   * POST /api/v1/question-papers/:id/verify
   */
  static async verify(req, res, next) {
    try {
      const { id } = req.params;
      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      const result = await QuestionPapersService.verifyQuestionPaper(
        id,
        userContext
      );

      return sendSuccess(res, {
        message: result.isMatch
          ? 'Question paper integrity verified successfully'
          : 'Question paper integrity check failed: Tamper detected',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Soft-delete question paper
   * DELETE /api/v1/question-papers/:id
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userContext = {
        id: req.user.id,
        role: req.user.role,
        departmentId: req.user.departmentId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      await QuestionPapersService.deleteQuestionPaper(id, userContext);

      return sendSuccess(res, {
        message: 'Question paper deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = QuestionPapersController;
