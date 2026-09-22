'use strict';

const { Op } = require('sequelize');
const {
  Exam,
  Subject,
  Department,
  User,
} = require('../../database/models');
const {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} = require('../../utils/errors');
const {
  ROLES,
  EXAM_STATUS,
  EXAM_TYPE,
  LIFECYCLE_STATUSES,
  VALID_EXAM_TRANSITIONS,
} = require('../../utils/constants');
const { validateUuid } = require('../../validators/commonValidators');
const AuditService = require('../../services/auditService');

function calculateEndTime(startTimeStr, durationMinutes) {
  if (!startTimeStr || !durationMinutes) return null;
  const parts = startTimeStr.split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;
}

class ExamsService {
  /**
   * Create a new Examination
   */
  static async createExam({
    title,
    description = null,
    examCode = null,
    subjectId,
    departmentId,
    examDate,
    startTime = null,
    endTime = null,
    duration,
    maximumMarks = 100,
    status = EXAM_STATUS.DRAFT,
    examType = EXAM_TYPE.END_SEMESTER,
    academicYear = null,
    semester = null,
    performedBy,
    ipAddress = null,
    userAgent = null,
  }) {
    // 1. Verify creator
    const creator = await User.findByPk(performedBy);
    if (!creator) {
      throw new ValidationError('Invalid creator reference', [
        { field: 'createdBy', message: 'Creator user does not exist' },
      ]);
    }

    // 2. Verify subject
    const subject = await Subject.findByPk(subjectId);
    if (!subject) {
      throw new ValidationError('Invalid subject reference', [
        { field: 'subjectId', message: `Subject with ID '${subjectId}' does not exist` },
      ]);
    }

    // 3. Verify department
    const department = await Department.findByPk(departmentId);
    if (!department) {
      throw new ValidationError('Invalid department reference', [
        { field: 'departmentId', message: `Department with ID '${departmentId}' does not exist` },
      ]);
    }

    // 4. Verify subject belongs to department
    if (subject.departmentId !== department.id) {
      throw new ValidationError('Subject does not belong to the specified department', [
        { field: 'departmentId', message: 'Subject and Department mismatch' },
      ]);
    }

    // 5. Department boundary enforcement: FACULTY can only create exams within their assigned department
    if (creator.role === ROLES.FACULTY) {
      if (!creator.departmentId || creator.departmentId !== department.id) {
        throw new ForbiddenError('Faculty can only create examinations within their assigned department');
      }
    }

    // 5. Handle examCode
    let finalExamCode;
    if (examCode && typeof examCode === 'string' && examCode.trim().length > 0) {
      const trimmedCode = examCode.trim();
      const existingExam = await Exam.findOne({ where: { examCode: trimmedCode } });
      if (existingExam) {
        throw new ConflictError(
          `Examination with code '${trimmedCode}' already exists`,
          'EXAM_CODE_EXISTS'
        );
      }
      finalExamCode = trimmedCode;
    } else {
      // Auto-generate clean unique examCode
      const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
      const timePart = Date.now().toString().slice(-4);
      finalExamCode = `EXAM-${subject.code}-${timePart}-${randomSuffix}`;
    }

    // 6. Calculate endTime if omitted
    const effectiveStartTime = startTime || '09:30:00';
    const effectiveEndTime = endTime || calculateEndTime(effectiveStartTime, duration) || '12:30:00';

    // 7. Create Examination record
    const newExam = await Exam.create({
      title: title.trim(),
      description: description ? description.trim() : null,
      examCode: finalExamCode,
      subjectId: subject.id,
      departmentId: department.id,
      subjectCode: subject.code,
      subjectName: subject.name,
      examDate,
      startTime: effectiveStartTime,
      endTime: effectiveEndTime,
      duration,
      maximumMarks,
      status: status || EXAM_STATUS.DRAFT,
      examType: examType || EXAM_TYPE.END_SEMESTER,
      academicYear: academicYear || new Date().getFullYear().toString(),
      semester: semester || 'ODD',
      createdBy: creator.id,
    });

    // 8. Audit trail logging
    await AuditService.logEvent({
      entityType: 'Exam',
      entityId: newExam.id,
      eventType: 'EXAM_CREATED',
      performedBy: creator.id,
      performedByRole: creator.role,
      description: `Examination created: ${newExam.examCode} (${newExam.title})`,
      recordData: {
        id: newExam.id,
        examCode: newExam.examCode,
        title: newExam.title,
        status: newExam.status,
        subjectId: newExam.subjectId,
        departmentId: newExam.departmentId,
        duration: newExam.duration,
        maximumMarks: newExam.maximumMarks,
      },
      ipAddress,
      userAgent,
    });

    // 9. Return loaded record with associations
    return await this.getExamById(newExam.id);
  }

  /**
   * Get single examination by ID
   */
  static async getExamById(id, userContext = {}) {
    if (!id || !validateUuid(id)) {
      throw new NotFoundError(`Examination with ID '${id}' not found`);
    }

    const exam = await Exam.findByPk(id, {
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'code', 'name', 'credits', 'departmentId'],
        },
        {
          model: Department,
          as: 'department',
          attributes: ['id', 'name', 'code'],
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'fullName', 'email', 'role', 'facultyId'],
        },
      ],
    });

    if (!exam) {
      throw new NotFoundError(`Examination with ID '${id}' not found`);
    }

    // Student Visibility: Students cannot view DRAFT examinations
    if (userContext.role === ROLES.STUDENT && exam.status === EXAM_STATUS.DRAFT) {
      throw new NotFoundError(`Examination with ID '${id}' not found`);
    }

    return exam;
  }

  /**
   * List examinations with filtering and pagination
   */
  static async listExams(
    {
      page = 1,
      limit = 10,
      status = null,
      departmentId = null,
      subjectId = null,
      examDate = null,
      search = null,
    },
    userContext = {}
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const where = {};

    // Student Visibility: Students cannot view DRAFT examinations
    if (userContext.role === ROLES.STUDENT) {
      if (status === EXAM_STATUS.DRAFT) {
        where.status = { [Op.in]: [] };
      } else if (status) {
        where.status = status;
      } else {
        where.status = { [Op.ne]: EXAM_STATUS.DRAFT };
      }
    } else {
      if (status) {
        where.status = status;
      }
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (examDate) {
      where.examDate = examDate;
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      where[Op.or] = [
        { title: { [Op.like]: searchPattern } },
        { examCode: { [Op.like]: searchPattern } },
      ];
    }

    const { count, rows } = await Exam.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [
        ['examDate', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'code', 'name', 'credits'],
        },
        {
          model: Department,
          as: 'department',
          attributes: ['id', 'name', 'code'],
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'fullName', 'email', 'role'],
        },
      ],
    });

    return {
      items: rows,
      totalItems: count,
      page: pageNum,
      limit: limitNum,
    };
  }

  /**
   * Update examination
   */
  static async updateExam(id, updateData, userContext = {}) {
    if (!id || !validateUuid(id)) {
      throw new NotFoundError(`Examination with ID '${id}' not found`);
    }

    const exam = await Exam.findByPk(id);
    if (!exam) {
      throw new NotFoundError(`Examination with ID '${id}' not found`);
    }

    // Role verification: Admin or Faculty
    if (
      userContext.role !== ROLES.ADMIN &&
      userContext.role !== ROLES.FACULTY
    ) {
      throw new ForbiddenError('Only administrators and faculty can update examinations');
    }

    // Immutability: Reject generic updates to COMPLETED or CANCELLED exams
    const IMMUTABLE_STATUSES = [EXAM_STATUS.COMPLETED, EXAM_STATUS.CANCELLED];
    if (IMMUTABLE_STATUSES.includes(exam.status)) {
      throw new AppError(
        `Cannot update examination in '${exam.status}' status. Completed or cancelled examinations are immutable.`,
        400,
        'EXAM_IMMUTABLE'
      );
    }

    // Faculty Ownership & Department Boundary checks
    if (userContext.role === ROLES.FACULTY) {
      if (exam.createdBy !== userContext.id) {
        throw new ForbiddenError('Faculty can only modify examinations they created');
      }
      if (!userContext.departmentId || exam.departmentId !== userContext.departmentId) {
        throw new ForbiddenError('Faculty can only manage examinations within their assigned department');
      }
      if (updateData.departmentId && updateData.departmentId !== userContext.departmentId) {
        throw new ForbiddenError('Faculty cannot move an examination outside their assigned department');
      }
    }

    // Exam code conflict check
    if (updateData.examCode && updateData.examCode.trim() !== exam.examCode) {
      const existing = await Exam.findOne({ where: { examCode: updateData.examCode.trim() } });
      if (existing && existing.id !== exam.id) {
        throw new ConflictError(
          `Examination with code '${updateData.examCode.trim()}' already exists`,
          'EXAM_CODE_EXISTS'
        );
      }
      exam.examCode = updateData.examCode.trim();
    }

    // Subject verification
    if (updateData.subjectId && updateData.subjectId !== exam.subjectId) {
      const subject = await Subject.findByPk(updateData.subjectId);
      if (!subject) {
        throw new ValidationError('Invalid subject reference', [
          { field: 'subjectId', message: `Subject with ID '${updateData.subjectId}' does not exist` },
        ]);
      }
      exam.subjectId = subject.id;
      exam.subjectCode = subject.code;
      exam.subjectName = subject.name;
    }

    // Department verification
    if (updateData.departmentId && updateData.departmentId !== exam.departmentId) {
      const dept = await Department.findByPk(updateData.departmentId);
      if (!dept) {
        throw new ValidationError('Invalid department reference', [
          { field: 'departmentId', message: `Department with ID '${updateData.departmentId}' does not exist` },
        ]);
      }
      exam.departmentId = dept.id;
    }

    // Check subject-department consistency if either changed
    if (updateData.subjectId || updateData.departmentId) {
      const currentSubject = await Subject.findByPk(exam.subjectId);
      if (currentSubject && currentSubject.departmentId !== exam.departmentId) {
        throw new ValidationError('Subject does not belong to the specified department', [
          { field: 'departmentId', message: 'Subject and Department mismatch' },
        ]);
      }
    }

    // Apply allowed scalar updates
    if (updateData.title !== undefined) exam.title = updateData.title.trim();
    if (updateData.description !== undefined) exam.description = updateData.description ? updateData.description.trim() : null;
    if (updateData.examDate !== undefined) exam.examDate = updateData.examDate;
    if (updateData.startTime !== undefined) exam.startTime = updateData.startTime;
    if (updateData.duration !== undefined) exam.duration = updateData.duration;
    if (updateData.maximumMarks !== undefined) exam.maximumMarks = updateData.maximumMarks;
    if (updateData.examType !== undefined) exam.examType = updateData.examType;
    if (updateData.status !== undefined) {
      throw new ValidationError('Examination status cannot be updated via generic update. Use PATCH /api/v1/exams/:id/status instead', [
        {
          field: 'status',
          message: 'Examination status cannot be updated via generic update. Use PATCH /api/v1/exams/:id/status instead',
        },
      ]);
    }
    if (updateData.academicYear !== undefined) exam.academicYear = updateData.academicYear;
    if (updateData.semester !== undefined) exam.semester = updateData.semester;

    // Recalculate endTime if needed
    if (updateData.endTime !== undefined) {
      exam.endTime = updateData.endTime;
    } else if (updateData.startTime || updateData.duration) {
      exam.endTime = calculateEndTime(exam.startTime, exam.duration) || exam.endTime;
    }

    await exam.save();

    // Audit logging
    await AuditService.logEvent({
      entityType: 'Exam',
      entityId: exam.id,
      eventType: 'EXAM_UPDATED',
      performedBy: userContext.id,
      performedByRole: userContext.role,
      description: `Examination updated: ${exam.examCode} (${exam.title})`,
      recordData: {
        id: exam.id,
        examCode: exam.examCode,
        title: exam.title,
        status: exam.status,
      },
      ipAddress: userContext.ipAddress,
      userAgent: userContext.userAgent,
    });

    return await this.getExamById(exam.id);
  }

  /**
   * Delete examination (Soft deletion)
   */
  static async deleteExam(id, userContext = {}) {
    if (!id || !validateUuid(id)) {
      throw new NotFoundError(`Examination with ID '${id}' not found`);
    }

    const exam = await Exam.findByPk(id);
    if (!exam) {
      throw new NotFoundError(`Examination with ID '${id}' not found`);
    }

    // Role check
    if (
      userContext.role !== ROLES.ADMIN &&
      userContext.role !== ROLES.FACULTY
    ) {
      throw new ForbiddenError('Only administrators and faculty can delete examinations');
    }

    // Faculty Ownership & Department Boundary checks
    if (userContext.role === ROLES.FACULTY) {
      if (exam.createdBy !== userContext.id) {
        throw new ForbiddenError('Faculty can only delete examinations they created');
      }
      if (!userContext.departmentId || exam.departmentId !== userContext.departmentId) {
        throw new ForbiddenError('Faculty can only delete examinations within their assigned department');
      }
    }

    // Phase 3A Safe Deletion Rule:
    // Only examinations in initial states (DRAFT, SCHEDULED) can be deleted
    const DELETABLE_STATUSES = [EXAM_STATUS.DRAFT, EXAM_STATUS.SCHEDULED];
    if (!DELETABLE_STATUSES.includes(exam.status)) {
      throw new AppError(
        `Cannot delete examination in '${exam.status}' status. Only DRAFT or SCHEDULED exams can be deleted.`,
        400,
        'EXAM_NOT_DELETABLE'
      );
    }

    await exam.destroy();

    // Audit logging
    await AuditService.logEvent({
      entityType: 'Exam',
      entityId: exam.id,
      eventType: 'EXAM_DELETED',
      performedBy: userContext.id,
      performedByRole: userContext.role,
      description: `Examination deleted: ${exam.examCode} (${exam.title})`,
      recordData: { id: exam.id, examCode: exam.examCode },
      ipAddress: userContext.ipAddress,
      userAgent: userContext.userAgent,
    });

    return { message: 'Examination deleted successfully' };
  }

  /**
   * Transition examination lifecycle status
   */
  static async transitionExamStatus(id, targetStatus, userContext = {}) {
    if (!id || !validateUuid(id)) {
      throw new NotFoundError(`Examination with ID '${id}' not found`);
    }

    const exam = await Exam.findByPk(id);
    if (!exam) {
      throw new NotFoundError(`Examination with ID '${id}' not found`);
    }

    // Role verification: Admin or Faculty
    if (
      userContext.role !== ROLES.ADMIN &&
      userContext.role !== ROLES.FACULTY
    ) {
      throw new ForbiddenError('Only administrators and faculty can transition examination status');
    }

    // Faculty Ownership & Department Boundary checks
    if (userContext.role === ROLES.FACULTY) {
      if (exam.createdBy !== userContext.id) {
        throw new ForbiddenError('Faculty can only transition status for examinations they created');
      }
      if (!userContext.departmentId || exam.departmentId !== userContext.departmentId) {
        throw new ForbiddenError('Faculty can only transition examinations within their assigned department');
      }
    }

    if (!targetStatus || typeof targetStatus !== 'string' || targetStatus.trim().length === 0) {
      throw new ValidationError('Target status is required', [
        { field: 'status', message: 'Target status is required' },
      ]);
    }

    const currentStatus = exam.status;
    const requestedStatus = targetStatus.trim();

    // Reject same-status transition
    if (requestedStatus === currentStatus) {
      throw new AppError(
        `Examination is already in '${currentStatus}' status. Transitioning to the same status is not allowed.`,
        400,
        'SAME_STATUS_TRANSITION'
      );
    }

    // Validate supported lifecycle status
    if (!LIFECYCLE_STATUSES.includes(requestedStatus)) {
      throw new ValidationError(`Invalid status '${requestedStatus}'`, [
        {
          field: 'status',
          message: `Status must be one of: ${LIFECYCLE_STATUSES.join(', ')}`,
        },
      ]);
    }

    // Determine whether transition is allowed
    const allowedTargets = VALID_EXAM_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes(requestedStatus)) {
      throw new AppError(
        `Invalid status transition from '${currentStatus}' to '${requestedStatus}'. Permitted transitions: ${
          allowedTargets.length > 0 ? allowedTargets.join(', ') : 'none (terminal state)'
        }`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Execute status transition
    exam.status = requestedStatus;
    await exam.save();

    // Audit logging for state transition
    await AuditService.logEvent({
      entityType: 'Exam',
      entityId: exam.id,
      eventType: 'EXAM_STATUS_TRANSITION',
      performedBy: userContext.id,
      performedByRole: userContext.role,
      description: `Examination status transitioned from ${currentStatus} to ${requestedStatus} for exam: ${exam.examCode} (${exam.title})`,
      recordData: {
        id: exam.id,
        examCode: exam.examCode,
        title: exam.title,
        previousStatus: currentStatus,
        newStatus: requestedStatus,
        transitionedAt: new Date().toISOString(),
      },
      ipAddress: userContext.ipAddress,
      userAgent: userContext.userAgent,
    });

    const updatedExam = await this.getExamById(exam.id);

    return {
      exam: updatedExam,
      previousStatus: currentStatus,
      newStatus: requestedStatus,
    };
  }
}

module.exports = ExamsService;
