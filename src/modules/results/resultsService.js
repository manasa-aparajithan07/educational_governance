'use strict';

const { Op } = require('sequelize');
const {
  Result,
  Exam,
  User,
  ExamFacultyAssignment,
  BlockchainTransaction,
  sequelize,
} = require('../../database/models');
const {
  ROLES,
  EXAM_STATUS,
  RESULT_STATUS,
  VALID_RESULT_TRANSITIONS,
  BLOCKCHAIN_TX_STATUS,
} = require('../../utils/constants');
const {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} = require('../../utils/errors');
const { validateUuid } = require('../../validators/commonValidators');
const { calculatePercentage, calculateGrade } = require('./gradingUtils');
const AuditService = require('../../services/auditService');
const BlockchainService = require('../../services/blockchainService');

// Map result status to corresponding audit event
const STATUS_AUDIT_EVENT_MAP = Object.freeze({
  [RESULT_STATUS.SUBMITTED]: 'RESULT_SUBMITTED',
  [RESULT_STATUS.UNDER_REVIEW]: 'RESULT_UNDER_REVIEW',
  [RESULT_STATUS.VERIFIED]: 'RESULT_VERIFIED',
  [RESULT_STATUS.REJECTED]: 'RESULT_REJECTED',
  [RESULT_STATUS.PUBLISHED]: 'RESULT_PUBLISHED',
  [RESULT_STATUS.DRAFT]: 'RESULT_STATUS_TRANSITION',
});

// Eligible exam statuses for marks evaluation in Phase 5A
const ALLOWED_EVALUATION_STATUSES = [EXAM_STATUS.ONGOING, EXAM_STATUS.COMPLETED];

class ResultsService {
  /**
   * Helper to verify an examination exists and is in an eligible evaluation status
   * @param {string} examId
   * @returns {Promise<Exam>}
   */
  static async verifyExamEligibility(examId) {
    if (!examId || !validateUuid(examId)) {
      throw new NotFoundError(`Examination with ID '${examId}' not found`);
    }

    const exam = await Exam.findByPk(examId);
    if (!exam) {
      throw new NotFoundError(`Examination with ID '${examId}' not found`);
    }

    if (!ALLOWED_EVALUATION_STATUSES.includes(exam.status)) {
      throw new AppError(
        `Evaluation is not allowed for examination in '${exam.status}' status. Marks can only be entered for examinations in ONGOING or COMPLETED status.`,
        400,
        'INVALID_EXAM_STATUS'
      );
    }

    return exam;
  }

  /**
   * Enforce exam governance, ownership, evaluator assignment & department boundary
   * @param {Object} exam
   * @param {Object} userContext
   */
  static async validateGovernance(exam, userContext = {}) {
    if (!userContext) {
      return;
    }

    const userRole = userContext.role || (userContext.user && userContext.user.role);
    const userId = userContext.id || (userContext.user && userContext.user.id);
    const userDeptId = userContext.departmentId || (userContext.user && userContext.user.departmentId);

    // If no role context is provided, do not restrict (for internal/system operations)
    if (!userRole) {
      return;
    }

    // 1. ADMIN bypasses all ownership and department restrictions
    if (userRole === ROLES.ADMIN) {
      return;
    }

    // 2. STUDENT must not use faculty governance to gain management access
    if (userRole === ROLES.STUDENT) {
      throw new ForbiddenError('Students are not authorized to manage examination results');
    }

    // 3. FACULTY authorization rules
    if (userRole === ROLES.FACULTY) {
      // a. Department Boundary: exam.departmentId must equal user.departmentId
      if (!userDeptId || exam.departmentId !== userDeptId) {
        throw new ForbiddenError(
          'Faculty can only manage results within their assigned department'
        );
      }

      // b. Faculty must be either:
      //    i) exam creator (exam.createdBy === user.id), OR
      //    ii) assigned as EVALUATOR in ExamFacultyAssignment
      if (exam.createdBy === userId) {
        return;
      }

      const evaluatorAssignment = await ExamFacultyAssignment.findOne({
        where: {
          examId: exam.id,
          facultyId: userId,
          assignmentRole: 'EVALUATOR',
        },
      });

      if (evaluatorAssignment) {
        return;
      }

      // Neither creator nor EVALUATOR
      throw new ForbiddenError(
        'Faculty can only manage results for examinations they created or are assigned as an evaluator'
      );
    }

    // Any other role is unauthorized
    throw new ForbiddenError('Unauthorized role for result operations');
  }

  /**
   * Record a single evaluation result for an examinee
   * POST /api/v1/exams/:examId/results
   */
  static async createResult({
    examId,
    studentId,
    marksObtained,
    remarks = null,
    user,
    userContext = {},
  }) {
    // 1. Verify exam existence and eligible status (ONGOING, COMPLETED)
    const exam = await this.verifyExamEligibility(examId);

    // 2. Enforce governance (Phase 5C)
    const effectiveContext =
      userContext && userContext.role
        ? userContext
        : {
            ...userContext,
            role: user && user.role,
            id: user && user.id,
            departmentId: user && user.departmentId,
          };
    await this.validateGovernance(exam, effectiveContext);

    // 2. Verify student exists and has role STUDENT
    if (!studentId || !validateUuid(studentId)) {
      throw new ValidationError('Invalid student ID format', [
        { field: 'studentId', message: 'studentId must be a valid UUID' },
      ]);
    }

    const student = await User.findByPk(studentId);
    if (!student) {
      throw new NotFoundError(`Student with ID '${studentId}' not found`);
    }

    if (student.role !== ROLES.STUDENT) {
      throw new ValidationError('Target user must be a registered student', [
        {
          field: 'studentId',
          message: `User with ID '${studentId}' is not a student (role: ${student.role})`,
        },
      ]);
    }

    // 3. Validate marks bounds against authorative exam.maximumMarks
    const numMarks = Number(marksObtained);
    if (isNaN(numMarks) || numMarks < 0) {
      throw new ValidationError('marksObtained must be a non-negative number', [
        {
          field: 'marksObtained',
          message: 'marksObtained must be greater than or equal to 0',
        },
      ]);
    }

    if (numMarks > Number(exam.maximumMarks)) {
      throw new ValidationError(
        `Marks obtained cannot exceed examination maximum marks of ${exam.maximumMarks}`,
        [
          {
            field: 'marksObtained',
            message: `Marks obtained (${numMarks}) cannot exceed maximum marks (${exam.maximumMarks})`,
          },
        ]
      );
    }

    // 4. Duplicate result prevention (check for existing non-deleted result)
    const existingResult = await Result.findOne({
      where: {
        examId: exam.id,
        studentId: student.id,
      },
    });

    if (existingResult) {
      throw new ConflictError(
        `A result already exists for student '${student.id}' in examination '${exam.id}'. Duplicate results are not permitted.`,
        'DUPLICATE_RESULT'
      );
    }

    // 5. Calculate percentage & grade using isolated grading utilities
    const percentage = calculatePercentage(numMarks, exam.maximumMarks);
    const grade = calculateGrade(percentage);

    const facultyId =
      (userContext && userContext.id) || (user && user.id);

    // 6. Create Result record in database
    const result = await Result.create({
      examId: exam.id,
      studentId: student.id,
      facultyId,
      marksObtained: numMarks,
      maximumMarks: exam.maximumMarks,
      grade,
      remarks: remarks ? remarks.trim() : null,
      submissionStatus: RESULT_STATUS.DRAFT,
      submittedAt: null,
    });

    // 7. Audit Logging: Record RESULT_CREATED event with cryptographic hash
    await AuditService.logEvent({
      entityType: 'Result',
      entityId: result.id,
      eventType: 'RESULT_CREATED',
      performedBy: facultyId,
      performedByRole:
        (userContext && userContext.role) || (user && user.role),
      description: `Result recorded for student ${student.fullName} (${student.id}) in exam ${exam.examCode}: ${numMarks}/${exam.maximumMarks} (${grade})`,
      recordData: {
        id: result.id,
        examId: exam.id,
        studentId: student.id,
        facultyId,
        marksObtained: numMarks,
        maximumMarks: exam.maximumMarks,
        percentage,
        grade,
        submissionStatus: result.submissionStatus,
      },
      ipAddress: (userContext && userContext.ipAddress) || null,
      userAgent: (userContext && userContext.userAgent) || null,
    });

    // 8. Return enriched result
    return await this.getResultById(result.id);
  }

  /**
   * Record batch evaluation results transactionally
   * POST /api/v1/exams/:examId/results/batch
   */
  static async createBatchResults({
    examId,
    results,
    user,
    userContext = {},
  }) {
    // 1. Verify exam existence and eligible status (ONGOING, COMPLETED)
    const exam = await this.verifyExamEligibility(examId);

    // 2. Enforce governance (Phase 5C)
    const effectiveContext =
      userContext && userContext.role
        ? userContext
        : {
            ...userContext,
            role: user && user.role,
            id: user && user.id,
            departmentId: user && user.departmentId,
          };
    await this.validateGovernance(exam, effectiveContext);

    const items = Array.isArray(results)
      ? results
      : results && (results.results || results.items);

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Batch payload must contain a non-empty array of results', [
        { field: 'results', message: 'No result items provided in batch payload' },
      ]);
    }

    // 2. Validate studentId uniqueness within batch payload
    const studentIds = items.map((item) => item.studentId);
    const uniqueIds = new Set(studentIds);
    if (uniqueIds.size !== studentIds.length) {
      throw new ConflictError(
        'Batch payload contains duplicate entries for the same student',
        'DUPLICATE_STUDENT_IN_BATCH'
      );
    }

    // 3. Pre-validate marks bounds for all items in batch
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const numMarks = Number(item.marksObtained);
      if (isNaN(numMarks) || numMarks < 0) {
        throw new ValidationError(`Invalid marks for student at index ${i}`, [
          {
            field: `results[${i}].marksObtained`,
            message: 'marksObtained must be greater than or equal to 0',
          },
        ]);
      }
      if (numMarks > Number(exam.maximumMarks)) {
        throw new ValidationError(
          `Marks obtained for student '${item.studentId}' cannot exceed examination maximum marks of ${exam.maximumMarks}`,
          [
            {
              field: `results[${i}].marksObtained`,
              message: `Marks obtained (${numMarks}) cannot exceed maximum marks (${exam.maximumMarks})`,
            },
          ]
        );
      }
    }

    // 4. Verify all students exist and have role STUDENT
    const students = await User.findAll({
      where: { id: studentIds },
    });
    const studentMap = new Map(students.map((s) => [s.id, s]));

    for (let i = 0; i < items.length; i++) {
      const sId = items[i].studentId;
      const student = studentMap.get(sId);
      if (!student) {
        throw new NotFoundError(`Student with ID '${sId}' not found`);
      }
      if (student.role !== ROLES.STUDENT) {
        throw new ValidationError('Target user must be a registered student', [
          {
            field: `results[${i}].studentId`,
            message: `User with ID '${sId}' is not a student (role: ${student.role})`,
          },
        ]);
      }
    }

    // 5. Verify no existing results in database for this exam + any of the students
    const existing = await Result.findAll({
      where: {
        examId: exam.id,
        studentId: studentIds,
      },
    });

    if (existing.length > 0) {
      const dupIds = existing.map((e) => e.studentId);
      throw new ConflictError(
        `Result already exists for student(s): ${dupIds.join(', ')} in examination '${exam.id}'`,
        'DUPLICATE_RESULT'
      );
    }

    const facultyId =
      (userContext && userContext.id) || (user && user.id);

    // 6. Execute batch insertion inside an atomic transaction
    const createdRecords = await sequelize.transaction(async (t) => {
      const list = [];
      for (const item of items) {
        const numMarks = Number(item.marksObtained);
        const percentage = calculatePercentage(numMarks, exam.maximumMarks);
        const grade = calculateGrade(percentage);

        const record = await Result.create(
          {
            examId: exam.id,
            studentId: item.studentId,
            facultyId,
            marksObtained: numMarks,
            maximumMarks: exam.maximumMarks,
            grade,
            remarks: item.remarks ? item.remarks.trim() : null,
            submissionStatus: RESULT_STATUS.DRAFT,
            submittedAt: null,
          },
          { transaction: t }
        );

        list.push({
          record,
          student: studentMap.get(item.studentId),
          percentage,
          grade,
        });
      }
      return list;
    });

    // 7. Audit log each created result post-transaction commit
    for (const { record, student, percentage, grade } of createdRecords) {
      await AuditService.logEvent({
        entityType: 'Result',
        entityId: record.id,
        eventType: 'RESULT_CREATED',
        performedBy: facultyId,
        performedByRole:
          (userContext && userContext.role) || (user && user.role),
        description: `Batch result recorded for student ${student.fullName} (${student.id}) in exam ${exam.examCode}: ${record.marksObtained}/${exam.maximumMarks} (${grade})`,
        recordData: {
          id: record.id,
          examId: exam.id,
          studentId: student.id,
          facultyId,
          marksObtained: record.marksObtained,
          maximumMarks: exam.maximumMarks,
          percentage,
          grade,
          submissionStatus: record.submissionStatus,
        },
        ipAddress: (userContext && userContext.ipAddress) || null,
        userAgent: (userContext && userContext.userAgent) || null,
      });
    }

    // 8. Return enriched result objects
    return await Promise.all(
      createdRecords.map(({ record }) => this.getResultById(record.id))
    );
  }

  /**
   * Retrieve a single result by ID with associations and percentage
   * GET /api/v1/results/:id
   */
  static async getResultById(id, userContext = null) {
    if (!id || !validateUuid(id)) {
      throw new NotFoundError(`Result with ID '${id}' not found`);
    }

    const result = await Result.findByPk(id, {
      include: [
        {
          model: Exam,
          as: 'exam',
          attributes: [
            'id',
            'examCode',
            'title',
            'status',
            'maximumMarks',
            'subjectId',
            'departmentId',
            'createdBy',
          ],
        },
        {
          model: User,
          as: 'student',
          attributes: ['id', 'fullName', 'email', 'studentId', 'department'],
        },
        {
          model: User,
          as: 'faculty',
          attributes: ['id', 'fullName', 'email', 'facultyId'],
        },
      ],
    });

    if (!result) {
      throw new NotFoundError(`Result with ID '${id}' not found`);
    }

    // User context authorization & student privacy scoping (Phase 5C)
    const userId = userContext && (userContext.id || (userContext.user && userContext.user.id));
    const userRole = userContext && (userContext.role || (userContext.user && userContext.user.role));

    if (userRole === ROLES.STUDENT) {
      if (result.studentId !== userId || result.submissionStatus !== RESULT_STATUS.PUBLISHED) {
        throw new NotFoundError(`Result with ID '${id}' not found`);
      }
    } else if (userRole === ROLES.FACULTY) {
      await this.validateGovernance(result.exam, userContext);
    }
    // ADMIN has unrestricted administrative access

    const plain = result.toJSON ? result.toJSON() : { ...result };
    const maxMarks =
      plain.maximumMarks || (plain.exam && plain.exam.maximumMarks) || 100;
    plain.percentage = calculatePercentage(plain.marksObtained, maxMarks);

    return plain;
  }

  /**
   * Retrieve paginated results for an examination
   * GET /api/v1/exams/:examId/results
   */
  static async getResultsByExamId({
    examId,
    page = 1,
    limit = 10,
    submissionStatus = null,
    studentId = null,
    user,
    userContext = {},
  }) {
    if (!examId || !validateUuid(examId)) {
      throw new NotFoundError(`Examination with ID '${examId}' not found`);
    }

    const exam = await Exam.findByPk(examId);
    if (!exam) {
      throw new NotFoundError(`Examination with ID '${examId}' not found`);
    }

    const userRole = (userContext && userContext.role) || (user && user.role);
    const userId = (userContext && userContext.id) || (user && user.id);

    let effectiveSubmissionStatus = submissionStatus;
    let effectiveStudentId = studentId;

    if (userRole === ROLES.STUDENT) {
      // Force/constrain to student's own PUBLISHED result(s)
      effectiveSubmissionStatus = RESULT_STATUS.PUBLISHED;
      effectiveStudentId = userId;
    } else if (userRole === ROLES.FACULTY) {
      const effectiveContext =
        userContext && userContext.role
          ? userContext
          : {
              ...userContext,
              role: userRole,
              id: userId,
              departmentId:
                (userContext && userContext.departmentId) ||
                (user && user.departmentId),
            };
      await this.validateGovernance(exam, effectiveContext);
    }
    // ADMIN has unrestricted administrative access

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    const where = { examId: exam.id };
    if (effectiveSubmissionStatus) {
      where.submissionStatus = effectiveSubmissionStatus;
    }
    if (effectiveStudentId) {
      where.studentId = effectiveStudentId;
    }

    const { count, rows } = await Result.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Exam,
          as: 'exam',
          attributes: [
            'id',
            'examCode',
            'title',
            'status',
            'maximumMarks',
          ],
        },
        {
          model: User,
          as: 'student',
          attributes: ['id', 'fullName', 'email', 'studentId', 'department'],
        },
        {
          model: User,
          as: 'faculty',
          attributes: ['id', 'fullName', 'email', 'facultyId'],
        },
      ],
    });

    const enrichedItems = rows.map((r) => {
      const plain = r.toJSON ? r.toJSON() : { ...r };
      plain.percentage = calculatePercentage(
        plain.marksObtained,
        plain.maximumMarks || exam.maximumMarks
      );
      return plain;
    });

    return {
      items: enrichedItems,
      totalItems: count,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(count / limitNum),
    };
  }

  /**
   * Transition result lifecycle status
   * PATCH /api/v1/results/:id/status
   */
  static async transitionResultStatus({
    id,
    status: targetStatus,
    user,
    userContext = {},
  }) {
    if (!id || !validateUuid(id)) {
      throw new NotFoundError(`Result with ID '${id}' not found`);
    }

    const result = await Result.findByPk(id);
    if (!result) {
      throw new NotFoundError(`Result with ID '${id}' not found`);
    }

    // Resolve exam and enforce governance (Phase 5C)
    const exam = await Exam.findByPk(result.examId);
    if (!exam) {
      throw new NotFoundError(`Examination with ID '${result.examId}' not found`);
    }

    const effectiveContext =
      userContext && userContext.role
        ? userContext
        : {
            ...userContext,
            role: user && user.role,
            id: user && user.id,
            departmentId: user && user.departmentId,
          };
    await this.validateGovernance(exam, effectiveContext);

    if (!targetStatus || typeof targetStatus !== 'string' || targetStatus.trim().length === 0) {
      throw new ValidationError('Target status is required', [
        { field: 'status', message: 'Target status is required' },
      ]);
    }

    const currentStatus = result.submissionStatus;
    const requestedStatus = targetStatus.trim();

    // 1. Reject same-status transition
    if (requestedStatus === currentStatus) {
      throw new AppError(
        `Result is already in '${currentStatus}' status. Transitioning to the same status is not allowed.`,
        400,
        'SAME_STATUS_TRANSITION'
      );
    }

    // 2. Validate supported status
    if (!Object.values(RESULT_STATUS).includes(requestedStatus)) {
      throw new ValidationError(`Invalid status '${requestedStatus}'`, [
        {
          field: 'status',
          message: `Status must be one of: ${Object.values(RESULT_STATUS).join(', ')}`,
        },
      ]);
    }

    // 3. Validate state machine transition legality
    const allowedTargets = VALID_RESULT_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes(requestedStatus)) {
      throw new AppError(
        `Invalid status transition from '${currentStatus}' to '${requestedStatus}'. Permitted transitions: ${
          allowedTargets.length > 0 ? allowedTargets.join(', ') : 'none (terminal state)'
        }`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // 4. Role-based authorization for specific transitions
    const userRole = (userContext && userContext.role) || (user && user.role);
    const userId = (userContext && userContext.id) || (user && user.id);

    if (requestedStatus === RESULT_STATUS.PUBLISHED && userRole !== ROLES.ADMIN) {
      throw new ForbiddenError('Only administrators are authorized to officially publish examination results');
    }

    // 5. Update timestamp & verifier fields based on transition
    const now = new Date();
    if (requestedStatus === RESULT_STATUS.SUBMITTED) {
      result.submittedAt = now;
    } else if (requestedStatus === RESULT_STATUS.VERIFIED) {
      result.verifiedBy = userId;
      result.verifiedAt = now;
    } else if (requestedStatus === RESULT_STATUS.PUBLISHED) {
      result.publishedAt = now;
    }

    // 6. Update status & persist
    result.submissionStatus = requestedStatus;
    await result.save();

    // 7. Cryptographic audit logging
    const eventType = STATUS_AUDIT_EVENT_MAP[requestedStatus] || 'RESULT_STATUS_TRANSITION';
    await AuditService.logEvent({
      entityType: 'Result',
      entityId: result.id,
      eventType,
      performedBy: userId,
      performedByRole: userRole,
      description: `Result status transitioned from ${currentStatus} to ${requestedStatus} for student ${result.studentId} in exam ${result.examId}`,
      recordData: {
        id: result.id,
        examId: result.examId,
        studentId: result.studentId,
        previousStatus: currentStatus,
        newStatus: requestedStatus,
        submittedAt: result.submittedAt,
        verifiedBy: result.verifiedBy,
        verifiedAt: result.verifiedAt,
        publishedAt: result.publishedAt,
        transitionedAt: now.toISOString(),
      },
      ipAddress: (userContext && userContext.ipAddress) || null,
      userAgent: (userContext && userContext.userAgent) || null,
    });

    // 7b. Safe post-publication blockchain hook (non-blocking, fail-safe in disabled mode)
    if (requestedStatus === RESULT_STATUS.PUBLISHED) {
      try {
        await BlockchainService.anchorResult(result);
      } catch (_) {
        // Non-blocking: publication must never fail due to blockchain errors or disabled state
      }
    }

    // 8. Return enriched result
    return await this.getResultById(result.id);
  }

  /**
   * Batch transition result lifecycle status for an examination
   * PATCH /api/v1/exams/:examId/results/status
   */
  static async transitionBatchResultStatus({
    examId,
    status: targetStatus,
    user,
    userContext = {},
  }) {
    if (!examId || !validateUuid(examId)) {
      throw new NotFoundError(`Examination with ID '${examId}' not found`);
    }

    const exam = await Exam.findByPk(examId);
    if (!exam) {
      throw new NotFoundError(`Examination with ID '${examId}' not found`);
    }

    // Enforce governance (Phase 5C)
    const effectiveContext =
      userContext && userContext.role
        ? userContext
        : {
            ...userContext,
            role: user && user.role,
            id: user && user.id,
            departmentId: user && user.departmentId,
          };
    await this.validateGovernance(exam, effectiveContext);

    if (!targetStatus || typeof targetStatus !== 'string' || targetStatus.trim().length === 0) {
      throw new ValidationError('Target status is required', [
        { field: 'status', message: 'Target status is required' },
      ]);
    }

    const requestedStatus = targetStatus.trim();
    if (!Object.values(RESULT_STATUS).includes(requestedStatus)) {
      throw new ValidationError(`Invalid status '${requestedStatus}'`, [
        {
          field: 'status',
          message: `Status must be one of: ${Object.values(RESULT_STATUS).join(', ')}`,
        },
      ]);
    }

    const userRole = (userContext && userContext.role) || (user && user.role);
    const userId = (userContext && userContext.id) || (user && user.id);

    if (requestedStatus === RESULT_STATUS.PUBLISHED && userRole !== ROLES.ADMIN) {
      throw new ForbiddenError('Only administrators are authorized to officially publish examination results');
    }

    // Retrieve all results for this examination
    const results = await Result.findAll({
      where: { examId: exam.id },
    });

    if (!results || results.length === 0) {
      throw new NotFoundError(`No results found for examination '${exam.examCode}'`);
    }

    // Validate transition eligibility for all items in batch
    for (const result of results) {
      const current = result.submissionStatus;
      if (current === requestedStatus) {
        throw new AppError(
          `Result '${result.id}' is already in '${current}' status. Transitioning to the same status is not allowed.`,
          400,
          'SAME_STATUS_TRANSITION'
        );
      }
      const allowed = VALID_RESULT_TRANSITIONS[current] || [];
      if (!allowed.includes(requestedStatus)) {
        throw new AppError(
          `Invalid status transition from '${current}' to '${requestedStatus}' for result '${result.id}'. Permitted transitions: ${
            allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'
          }`,
          400,
          'INVALID_STATUS_TRANSITION'
        );
      }
    }

    // Execute atomic transaction
    const now = new Date();
    const updatedRecords = await sequelize.transaction(async (t) => {
      const list = [];
      for (const result of results) {
        const previousStatus = result.submissionStatus;
        result.submissionStatus = requestedStatus;

        if (requestedStatus === RESULT_STATUS.SUBMITTED) {
          result.submittedAt = now;
        } else if (requestedStatus === RESULT_STATUS.VERIFIED) {
          result.verifiedBy = userId;
          result.verifiedAt = now;
        } else if (requestedStatus === RESULT_STATUS.PUBLISHED) {
          result.publishedAt = now;
        }

        await result.save({ transaction: t });
        list.push({ result, previousStatus });
      }
      return list;
    });

    // Audit log post-commit
    const eventType = STATUS_AUDIT_EVENT_MAP[requestedStatus] || 'RESULT_STATUS_TRANSITION';
    for (const { result, previousStatus } of updatedRecords) {
      await AuditService.logEvent({
        entityType: 'Result',
        entityId: result.id,
        eventType,
        performedBy: userId,
        performedByRole: userRole,
        description: `Batch result status transitioned from ${previousStatus} to ${requestedStatus} for exam ${exam.examCode}`,
        recordData: {
          id: result.id,
          examId: exam.id,
          studentId: result.studentId,
          previousStatus,
          newStatus: requestedStatus,
          submittedAt: result.submittedAt,
          verifiedBy: result.verifiedBy,
          verifiedAt: result.verifiedAt,
          publishedAt: result.publishedAt,
          transitionedAt: now.toISOString(),
        },
        ipAddress: (userContext && userContext.ipAddress) || null,
        userAgent: (userContext && userContext.userAgent) || null,
      });
    }

    // Safe post-publication blockchain hook for batch (non-blocking, fail-safe in disabled mode)
    if (requestedStatus === RESULT_STATUS.PUBLISHED) {
      for (const { result } of updatedRecords) {
        try {
          await BlockchainService.anchorResult(result);
        } catch (_) {
          // Non-blocking: publication must never fail due to blockchain errors or disabled state
        }
      }
    }

    return {
      count: updatedRecords.length,
      status: requestedStatus,
      results: await Promise.all(
        updatedRecords.map(({ result }) => this.getResultById(result.id))
      ),
    };
  }

  /**
   * Secure, authenticated result hash verification (Phase 6C)
   * Recalculates canonical SHA-256 hash using resultHashUtils, compares against
   * expected payload hash / anchored transaction, and returns role-appropriate metadata.
   *
   * @param {string} id - Result UUID
   * @param {Object} userContext - Authenticated user context
   * @param {Object} [options] - Verification options
   * @param {string|null} [options.expectedHash] - Optional expected hash from query
   * @returns {Promise<Object>} Verification outcome object
   */
  static async verifyResult(id, userContext = {}, options = {}) {
    // 1. Retrieve result with full governance, ownership & student privacy scoping (Phase 5C)
    // Throws NotFoundError if invalid UUID or not found.
    // Throws NotFoundError for STUDENT if not owner or not PUBLISHED.
    // Throws ForbiddenError for FACULTY if department boundary or not evaluator/creator.
    const result = await this.getResultById(id, userContext);

    // 2. Query local BlockchainTransaction record if result is anchored
    let blockchainTx = null;
    if (result.blockchainTransactionId) {
      blockchainTx = await BlockchainTransaction.findOne({
        where: {
          [Op.or]: [
            { txHash: result.blockchainTransactionId },
            { id: result.blockchainTransactionId },
          ],
        },
      });
    }

    // 3. Compute canonical SHA-256 hash from authoritative database record attributes
    const calculatedHash = BlockchainService.calculateResultHash(result);

    // 4. Determine trusted anchor hash vs caller-supplied hash
    const isFabricEnabled = BlockchainService.isFabricEnabled();
    const trustedPayloadHash =
      blockchainTx && blockchainTx.payloadHash
        ? String(blockchainTx.payloadHash).trim().toLowerCase()
        : null;
    const callerExpectedHash = options.expectedHash
      ? String(options.expectedHash).trim().toLowerCase()
      : null;

    let isMatch = false;
    let verified = false;
    let tamperDetected = false;
    let status = 'DISABLED';
    let message = '';
    let effectiveExpectedHash = null;

    if (trustedPayloadHash) {
      // Result IS ANCHORED to a trusted blockchain transaction:
      // Authoritative comparison reference is ALWAYS the trusted payloadHash.
      effectiveExpectedHash = trustedPayloadHash;
      const anchorMatchesCalculated =
        calculatedHash.toLowerCase() === trustedPayloadHash;

      if (!anchorMatchesCalculated) {
        // Tampered record! Database record does not match trusted blockchain anchor.
        tamperDetected = true;
        isMatch = false;
        verified = false;
        status = 'MISMATCH';
        message =
          'Tamper detected: Result canonical hash does not match trusted blockchain anchor.';
      } else if (
        callerExpectedHash &&
        callerExpectedHash !== trustedPayloadHash
      ) {
        // Caller provided an expectedHash that conflicts with trusted anchor
        tamperDetected = false;
        isMatch = false;
        verified = false;
        status = 'MISMATCH';
        message =
          'Caller-supplied expected hash conflicts with trusted blockchain anchor.';
      } else {
        // Verified! Database record matches trusted blockchain anchor
        tamperDetected = false;
        isMatch = true;
        verified = true;
        status = 'VERIFIED';
        message = callerExpectedHash
          ? 'Result canonical hash matches trusted blockchain anchor and caller expected hash.'
          : 'Result canonical hash matches trusted blockchain anchor.';
      }
    } else {
      // Result is UNANCHORED (no trusted blockchain transaction exists)
      effectiveExpectedHash = callerExpectedHash || null;

      if (callerExpectedHash) {
        if (calculatedHash.toLowerCase() === callerExpectedHash) {
          // Caller hash matches calculated DB hash, but CANNOT be marked VERIFIED because unanchored
          isMatch = true;
          verified = false;
          tamperDetected = false;
          status = isFabricEnabled ? 'NOT_ANCHORED' : 'DISABLED';
          message = isFabricEnabled
            ? 'Result is not anchored to blockchain network. Canonical hash matches caller expected hash, but cannot be verified without a trusted anchor.'
            : 'Hyperledger Fabric is disabled (FABRIC_ENABLED=false) and result is not anchored. Hash matches caller input, but cannot be cryptographically verified without a trusted blockchain anchor.';
        } else {
          // Caller hash does not match calculated hash
          isMatch = false;
          verified = false;
          tamperDetected = false;
          status = 'MISMATCH';
          message = 'Result canonical hash does not match caller expected hash.';
        }
      } else {
        // No caller hash and no trusted anchor
        isMatch = false;
        verified = false;
        tamperDetected = false;
        status = isFabricEnabled ? 'NOT_ANCHORED' : 'DISABLED';
        message = isFabricEnabled
          ? 'Result is not anchored to the blockchain network.'
          : 'Hyperledger Fabric is disabled (FABRIC_ENABLED=false). Canonical hash calculated, but no trusted blockchain anchor exists for verification.';
      }
    }

    // 5. Blockchain status & Fabric disabled-mode safety
    const isCommitted =
      blockchainTx &&
      blockchainTx.status === BLOCKCHAIN_TX_STATUS.COMMITTED;

    let blockchainStatus = 'DISABLED';
    let blockchainMessage =
      'Hyperledger Fabric is disabled (FABRIC_ENABLED=false). No transaction was submitted or committed to the blockchain ledger.';

    if (isFabricEnabled) {
      if (blockchainTx) {
        blockchainStatus = blockchainTx.status;
        blockchainMessage = isCommitted
          ? 'Transaction confirmed and committed to Hyperledger Fabric blockchain ledger.'
          : `Blockchain transaction is in '${blockchainTx.status}' state.`;
      } else {
        blockchainStatus = 'NOT_ANCHORED';
        blockchainMessage = 'Result is not anchored to the blockchain network.';
      }
    } else if (blockchainTx) {
      blockchainStatus = blockchainTx.status;
      blockchainMessage = `Hyperledger Fabric is disabled (FABRIC_ENABLED=false). Local transaction record exists with status '${blockchainTx.status}', but is not submitted or committed on-chain.`;
    }

    // 6. Return strictly sanitized, role-appropriate, PII-free response
    return {
      resultId: result.id,
      examId: result.examId,
      submissionStatus: result.submissionStatus,
      canonicalPayload: BlockchainService.buildCanonicalResultPayload(result),
      calculatedHash,
      expectedHash: effectiveExpectedHash,
      isMatch,
      verified,
      tamperDetected,
      status,
      message,
      blockchain: {
        enabled: isFabricEnabled,
        status: blockchainStatus,
        transactionId: blockchainTx ? blockchainTx.id : null,
        txHash: blockchainTx
          ? blockchainTx.txHash
          : result.blockchainTransactionId || null,
        payloadHash: blockchainTx ? blockchainTx.payloadHash : null,
        blockNumber: blockchainTx ? blockchainTx.blockNumber : null,
        committed: Boolean(isCommitted && isFabricEnabled),
        message: blockchainMessage,
      },
    };
  }

  /**
   * Admin-only reconciliation of published examination results against blockchain transactions (Phase 6D).
   *
   * @param {Object} options
   * @param {string|null} [options.examId]
   * @param {number} [options.limit]
   * @param {number} [options.offset]
   * @param {Object} userContext
   * @returns {Promise<Object>} Reconciliation report
   */
  static async reconcileResults(options = {}, userContext = null) {
    const role =
      (userContext && userContext.role) ||
      (userContext && userContext.user && userContext.user.role);
    if (role !== ROLES.ADMIN) {
      throw new ForbiddenError(
        'Access denied. Only administrators are authorized to perform blockchain reconciliation.',
        'FORBIDDEN'
      );
    }

    return await BlockchainService.reconcilePublishedResults(options);
  }
}

module.exports = ResultsService;
