'use strict';

const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/env');
const fileStorageService = require('../../services/fileStorageService');
const { Exam, QuestionPaper } = require('../../database/models');
const { validateUuid } = require('../../validators/commonValidators');
const { ROLES, EXAM_STATUS } = require('../../utils/constants');
const {
  AppError,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  ConflictError,
} = require('../../utils/errors');

// Allowed extensions and MIME types for question paper uploads
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/x-pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/docx',
  'application/msword',
  'application/octet-stream',
];

// Configure safe disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fileStorageService.ensureUploadDir();
    cb(null, fileStorageService.uploadDir);
  },
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.includes(rawExt) ? rawExt : '.bin';
    const storageKey = `${uuidv4()}${safeExt}`;
    cb(null, storageKey);
  },
});

// File filter enforcing strict format validation
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
  const isAllowedMime = ALLOWED_MIME_TYPES.includes(mime);

  if (!isAllowedExt || !isAllowedMime) {
    return cb(
      new ValidationError(
        'Invalid file type. Only PDF (.pdf) and Word (.docx) files are allowed.',
        [
          {
            field: 'file',
            message: 'Only PDF (.pdf) and Word (.docx) files are supported',
          },
        ]
      )
    );
  }

  cb(null, true);
};

// Multer upload instance
const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxSizeBytes,
  },
  fileFilter,
});

/**
 * Middleware handling Question Paper upload with pre-validation and safe error handling
 */
async function uploadQuestionPaperMiddleware(req, res, next) {
  try {
    const { examId } = req.params;

    // 1. Validate examId format
    if (!examId || !validateUuid(examId)) {
      return next(
        new ValidationError('Invalid examination ID format', [
          { field: 'examId', message: 'examId must be a valid UUID' },
        ])
      );
    }

    // 2. Verify exam exists and is not deleted
    const exam = await Exam.findByPk(examId);
    if (!exam) {
      return next(new NotFoundError(`Examination with ID '${examId}' not found`));
    }

    // Attach exam to request for downstream controller efficiency
    req.exam = exam;

    // 3. Pre-upload Exam Immutability Check: Reject COMPLETED or CANCELLED exams
    const IMMUTABLE_STATUSES = [EXAM_STATUS.COMPLETED, EXAM_STATUS.CANCELLED];
    if (IMMUTABLE_STATUSES.includes(exam.status)) {
      return next(
        new AppError(
          `Cannot upload question paper for examination in '${exam.status}' status. Completed or cancelled examinations are immutable.`,
          400,
          'EXAM_IMMUTABLE'
        )
      );
    }

    // 4. Pre-upload Faculty Ownership & Department Boundary Checks
    if (req.user && req.user.role === ROLES.FACULTY) {
      if (exam.createdBy !== req.user.id) {
        return next(
          new ForbiddenError(
            'Faculty can only manage question papers for examinations they created'
          )
        );
      }
      if (!req.user.departmentId || exam.departmentId !== req.user.departmentId) {
        return next(
          new ForbiddenError(
            'Faculty can only manage question papers within their assigned department'
          )
        );
      }
    }

    // 5. Prevent accidental duplicate/overwrite of an existing paper
    const existingPaper = await QuestionPaper.findOne({
      where: { examId },
    });
    if (existingPaper) {
      return next(
        new ConflictError(
          `A question paper already exists for examination '${examId}'. Delete or replace the existing question paper before uploading a new one.`,
          'QUESTION_PAPER_ALREADY_EXISTS'
        )
      );
    }

    // 4. Process file upload via Multer
    upload.single('file')(req, res, (err) => {
      if (err) {
        // Clean up any partially uploaded file
        if (req.file && req.file.filename) {
          fileStorageService.deleteFile(req.file.filename);
        }

        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            const maxMb = Math.round(config.upload.maxSizeBytes / (1024 * 1024));
            return next(
              new ValidationError(
                `File size exceeds the allowed limit of ${maxMb}MB`,
                [
                  {
                    field: 'file',
                    message: `File size exceeds maximum allowed limit of ${config.upload.maxSizeBytes} bytes (${maxMb}MB)`,
                  },
                ]
              )
            );
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(
              new ValidationError(
                'Unexpected field in upload. Upload file using field name "file".',
                [
                  {
                    field: err.field || 'file',
                    message: 'Expected multipart field name is "file"',
                  },
                ]
              )
            );
          }
          return next(
            new ValidationError(err.message, [
              { field: 'file', message: err.message },
            ])
          );
        }

        return next(err);
      }

      next();
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadQuestionPaperMiddleware,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
};
