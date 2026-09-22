'use strict';

const path = require('path');
const fs = require('fs');
const { QuestionPaper, Exam, User } = require('../../database/models');
const fileStorageService = require('../../services/fileStorageService');
const HashingService = require('../../services/hashingService');
const AuditService = require('../../services/auditService');
const {
  ROLES,
  EXAM_STATUS,
  QUESTION_PAPER_VERIFICATION,
} = require('../../utils/constants');
const {
  AppError,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  ConflictError,
} = require('../../utils/errors');
const {
  validateQuestionPaperId,
  validateFilePresence,
} = require('./questionPapersValidators');
const { validateUuid } = require('../../validators/commonValidators');

class QuestionPapersService {
  /**
   * Enforce faculty ownership and department boundary governance
   * @param {Object} exam
   * @param {Object} userContext
   */
  static validateGovernance(exam, userContext = {}) {
    if (!userContext || !userContext.role) {
      return;
    }

    // ADMIN bypasses ownership and department restrictions
    if (userContext.role === ROLES.ADMIN) {
      return;
    }

    if (userContext.role === ROLES.FACULTY) {
      // 1. Faculty Ownership: exam.createdBy === userContext.id
      if (exam.createdBy !== userContext.id) {
        throw new ForbiddenError(
          'Faculty can only manage question papers for examinations they created'
        );
      }

      // 2. Department Boundary: exam.departmentId === userContext.departmentId
      if (
        !userContext.departmentId ||
        exam.departmentId !== userContext.departmentId
      ) {
        throw new ForbiddenError(
          'Faculty can only manage question papers within their assigned department'
        );
      }
    }
  }

  /**
   * Enforce exam immutability for question paper mutations (upload/delete)
   * @param {Object} exam
   * @param {string} action
   */
  static validateExamImmutability(exam, action = 'modify') {
    const IMMUTABLE_STATUSES = [EXAM_STATUS.COMPLETED, EXAM_STATUS.CANCELLED];
    if (IMMUTABLE_STATUSES.includes(exam.status)) {
      throw new AppError(
        `Cannot ${action} question paper for examination in '${exam.status}' status. Completed or cancelled examinations are immutable.`,
        400,
        'EXAM_IMMUTABLE'
      );
    }
  }

  /**
   * Upload and register a new question paper for an examination
   */
  static async uploadQuestionPaper({ examId, file, user, userContext = {} }) {
    if (!file) {
      throw new ValidationError('Question paper file is required', [
        { field: 'file', message: 'A valid PDF or DOCX file is required' },
      ]);
    }

    if (!examId || !validateUuid(examId)) {
      if (file && file.filename) {
        fileStorageService.deleteFile(file.filename);
      }
      throw new ValidationError('Invalid examination ID format', [
        { field: 'examId', message: 'examId must be a valid UUID' },
      ]);
    }

    // 1. Verify examination exists and is not soft-deleted
    const exam = await Exam.findByPk(examId);
    if (!exam) {
      if (file && file.filename) {
        fileStorageService.deleteFile(file.filename);
      }
      throw new NotFoundError(`Examination with ID '${examId}' not found`);
    }

    // 2. Pre-upload Exam Immutability Check (Reject COMPLETED or CANCELLED exams)
    try {
      this.validateExamImmutability(exam, 'upload');
    } catch (immutabilityError) {
      if (file && file.filename) {
        fileStorageService.deleteFile(file.filename);
      }
      throw immutabilityError;
    }

    // 3. Pre-upload Faculty Ownership & Department Boundary Checks
    const actingUser = {
      id: (userContext && userContext.id) || (user && user.id),
      role: (userContext && userContext.role) || (user && user.role),
      departmentId:
        (userContext && userContext.departmentId) || (user && user.departmentId),
    };
    try {
      this.validateGovernance(exam, actingUser);
    } catch (governanceError) {
      if (file && file.filename) {
        fileStorageService.deleteFile(file.filename);
      }
      throw governanceError;
    }

    // 4. Prevent accidental duplicate/overwrite of an existing paper
    const existingPaper = await QuestionPaper.findOne({
      where: { examId },
    });
    if (existingPaper) {
      if (file && file.filename) {
        fileStorageService.deleteFile(file.filename);
      }
      throw new ConflictError(
        `A question paper already exists for examination '${examId}'. Delete or replace the existing question paper before uploading a new one.`,
        'QUESTION_PAPER_ALREADY_EXISTS'
      );
    }

    // 3. Compute SHA-256 hash using the existing HashingService
    const fullDiskPath = fileStorageService.getStoragePath(file.filename);

    let sha256Hash;
    try {
      sha256Hash = await HashingService.hashFile(fullDiskPath);
    } catch (hashError) {
      fileStorageService.deleteFile(file.filename);
      throw hashError;
    }

    // 4. Sanitize original filename to prevent path traversal or unsafe characters
    const safeOriginalName = path
      .basename(file.originalname)
      .replace(/[\0\r\n]/g, '')
      .trim();

    // 5. Create QuestionPaper database record
    try {
      const questionPaper = await QuestionPaper.create({
        examId: exam.id,
        fileName: safeOriginalName,
        filePathOrStorageKey: file.filename,
        mimeType: file.mimetype,
        fileSize: file.size,
        sha256Hash,
        uploadedBy: user.id,
        uploadedAt: new Date(),
        verificationStatus: QUESTION_PAPER_VERIFICATION.NOT_VERIFIED,
      });

      // 6. Immutable Audit Logging
      await AuditService.logEvent({
        entityType: 'QuestionPaper',
        entityId: questionPaper.id,
        eventType: 'QUESTION_PAPER_UPLOADED',
        performedBy: user.id,
        performedByRole: user.role,
        description: `Question paper uploaded for exam ${exam.id}: ${safeOriginalName}`,
        recordData: {
          id: questionPaper.id,
          examId: exam.id,
          fileName: safeOriginalName,
          fileSize: questionPaper.fileSize,
          mimeType: questionPaper.mimeType,
          sha256Hash: questionPaper.sha256Hash,
        },
        ipAddress: userContext.ipAddress || null,
        userAgent: userContext.userAgent || null,
      });

      // Reload with associations
      return await this.getQuestionPaperById(questionPaper.id, userContext);
    } catch (dbError) {
      fileStorageService.deleteFile(file.filename);
      throw dbError;
    }
  }

  /**
   * Retrieve QuestionPaper metadata by ID
   */
  static async getQuestionPaperById(id, userContext = {}) {
    if (!validateQuestionPaperId(id)) {
      throw new NotFoundError(`Question paper with ID '${id}' not found`);
    }

    const paper = await QuestionPaper.findByPk(id, {
      include: [
        {
          model: Exam,
          as: 'exam',
          attributes: [
            'id',
            'examCode',
            'title',
            'status',
            'subjectId',
            'departmentId',
            'createdBy',
          ],
        },
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'fullName', 'email', 'role', 'facultyId'],
        },
      ],
    });

    if (!paper) {
      throw new NotFoundError(`Question paper with ID '${id}' not found`);
    }

    // Enforce faculty ownership & department boundary governance
    if (userContext && userContext.role && paper.exam) {
      this.validateGovernance(paper.exam, userContext);
    }

    return paper;
  }

  /**
   * Retrieve QuestionPaper metadata by Exam ID
   */
  static async getQuestionPaperByExamId(examId, userContext = {}) {
    if (!examId || !validateUuid(examId)) {
      throw new NotFoundError(`Examination with ID '${examId}' not found`);
    }

    const exam = await Exam.findByPk(examId);
    if (!exam) {
      throw new NotFoundError(`Examination with ID '${examId}' not found`);
    }

    // Enforce faculty ownership & department boundary governance on examination
    if (userContext && userContext.role) {
      this.validateGovernance(exam, userContext);
    }

    const paper = await QuestionPaper.findOne({
      where: { examId },
      include: [
        {
          model: Exam,
          as: 'exam',
          attributes: [
            'id',
            'examCode',
            'title',
            'status',
            'subjectId',
            'departmentId',
            'createdBy',
          ],
        },
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'fullName', 'email', 'role', 'facultyId'],
        },
      ],
    });

    if (!paper) {
      throw new NotFoundError(
        `Question paper for examination '${examId}' not found`
      );
    }

    return paper;
  }

  /**
   * Prepare QuestionPaper for download with audit logging
   */
  static async downloadQuestionPaper(id, userContext = {}) {
    const paper = await this.getQuestionPaperById(id, userContext);

    const filePath = fileStorageService.getStoragePath(
      paper.filePathOrStorageKey
    );
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Question paper file not found on storage');
    }

    // Audit logging for download
    await AuditService.logEvent({
      entityType: 'QuestionPaper',
      entityId: paper.id,
      eventType: 'QUESTION_PAPER_DOWNLOADED',
      performedBy: userContext.id || null,
      performedByRole: userContext.role || null,
      description: `Question paper downloaded: ${paper.fileName}`,
      recordData: {
        id: paper.id,
        examId: paper.examId,
        fileName: paper.fileName,
      },
      ipAddress: userContext.ipAddress || null,
      userAgent: userContext.userAgent || null,
    });

    return {
      paper,
      filePath,
    };
  }

  /**
   * Verify QuestionPaper integrity and detect tampering
   */
  static async verifyQuestionPaper(id, userContext = {}) {
    const paper = await this.getQuestionPaperById(id, userContext);

    const filePath = fileStorageService.getStoragePath(
      paper.filePathOrStorageKey
    );
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Question paper file not found on storage');
    }

    // 1. Calculate current SHA-256 hash using the existing HashingService
    const calculatedHash = await HashingService.hashFile(filePath);

    // 2. Compare with stored sha256Hash
    const isMatch =
      calculatedHash.toLowerCase() === paper.sha256Hash.toLowerCase();
    const newStatus = isMatch
      ? QUESTION_PAPER_VERIFICATION.VERIFIED
      : QUESTION_PAPER_VERIFICATION.TAMPER_DETECTED;

    // 3. Update verification status in database (never overwrite original stored hash)
    paper.verificationStatus = newStatus;
    await paper.save();

    // 4. Audit logging via existing AuditService
    const eventType = isMatch
      ? 'QUESTION_PAPER_VERIFIED'
      : 'QUESTION_PAPER_TAMPER_DETECTED';

    await AuditService.logEvent({
      entityType: 'QuestionPaper',
      entityId: paper.id,
      eventType,
      performedBy: userContext.id || null,
      performedByRole: userContext.role || null,
      description: isMatch
        ? `Question paper integrity verified for exam ${paper.examId}: hash matches stored hash`
        : `Tampering detected on question paper ${paper.id} for exam ${paper.examId}: hash mismatch`,
      recordData: {
        questionPaperId: paper.id,
        examId: paper.examId,
        storedHash: paper.sha256Hash,
        calculatedHash,
        verificationStatus: newStatus,
        isMatch,
        verifiedAt: new Date().toISOString(),
      },
      ipAddress: userContext.ipAddress || null,
      userAgent: userContext.userAgent || null,
    });

    return {
      questionPaper: paper,
      verificationStatus: newStatus,
      isMatch,
      storedHash: paper.sha256Hash,
      calculatedHash,
    };
  }

  /**
   * Soft-delete a question paper with audit logging
   */
  static async deleteQuestionPaper(id, userContext = {}) {
    const paper = await this.getQuestionPaperById(id, userContext);

    // Exam immutability check: Reject deletion on COMPLETED or CANCELLED exams
    if (paper.exam) {
      this.validateExamImmutability(paper.exam, 'delete');
    }

    await paper.destroy();

    // Audit logging for deletion
    await AuditService.logEvent({
      entityType: 'QuestionPaper',
      entityId: paper.id,
      eventType: 'QUESTION_PAPER_DELETED',
      performedBy: userContext.id || null,
      performedByRole: userContext.role || null,
      description: `Question paper soft-deleted: ${paper.fileName}`,
      recordData: {
        id: paper.id,
        examId: paper.examId,
      },
      ipAddress: userContext.ipAddress || null,
      userAgent: userContext.userAgent || null,
    });

    return true;
  }
}

module.exports = QuestionPapersService;
