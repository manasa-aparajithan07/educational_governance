'use strict';

const express = require('express');
const router = express.Router();
const ExamsController = require('./examsController');
const authMiddleware = require('../../middleware/authMiddleware');
const roleMiddleware = require('../../middleware/roleMiddleware');
const validationMiddleware = require('../../middleware/validationMiddleware');
const { ROLES } = require('../../utils/constants');
const {
  validateCreateExam,
  validateUpdateExam,
  validateUpdateExamStatus,
} = require('./examsValidators');

// All examination endpoints require authentication
router.use(authMiddleware);

// List examinations (Accessible to ADMIN, FACULTY, STUDENT)
router.get('/', ExamsController.list);

// Create examination (Restricted to ADMIN and FACULTY)
router.post(
  '/',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateCreateExam),
  ExamsController.create
);

// Get examination by ID (Accessible to ADMIN, FACULTY, STUDENT)
router.get('/:id', ExamsController.getById);

// Dedicated lifecycle status transition endpoint (Restricted to ADMIN and FACULTY)
router.patch(
  '/:id/status',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateUpdateExamStatus),
  ExamsController.updateStatus
);

// Update examination (Restricted to ADMIN and FACULTY)
router.put(
  '/:id',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateUpdateExam),
  ExamsController.update
);

router.patch(
  '/:id',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateUpdateExam),
  ExamsController.update
);

// Delete examination (Restricted to ADMIN and FACULTY, permitted for DRAFT/SCHEDULED)
router.delete(
  '/:id',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  ExamsController.delete
);

// Dedicated Question Paper endpoints for an examination (Phase 4A)
const QuestionPapersController = require('../questionPapers/questionPapersController');
const { uploadQuestionPaperMiddleware } = require('../questionPapers/uploadMiddleware');

router.post(
  '/:examId/question-paper',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  uploadQuestionPaperMiddleware,
  QuestionPapersController.upload
);

router.get(
  '/:examId/question-paper',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  QuestionPapersController.getByExamId
);

// Dedicated Results endpoints for an examination (Phase 5A & 5B)
const ResultsController = require('../results/resultsController');
const {
  validateCreateResult,
  validateBatchResult,
  validateBatchResultStatus,
} = require('../results/resultsValidators');

router.post(
  '/:examId/results',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateCreateResult),
  ResultsController.create
);

router.post(
  '/:examId/results/batch',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateBatchResult),
  ResultsController.createBatch
);

router.get(
  '/:examId/results',
  ResultsController.getByExamId
);

router.patch(
  '/:examId/results/status',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateBatchResultStatus),
  ResultsController.updateBatchStatus
);

module.exports = router;
