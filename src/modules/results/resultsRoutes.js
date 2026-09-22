'use strict';

const express = require('express');
const router = express.Router();
const ResultsController = require('./resultsController');
const authMiddleware = require('../../middleware/authMiddleware');
const roleMiddleware = require('../../middleware/roleMiddleware');
const validationMiddleware = require('../../middleware/validationMiddleware');
const { ROLES } = require('../../utils/constants');
const {
  validateCreateResult,
  validateBatchResult,
  validateUpdateResultStatus,
  validateBatchResultStatus,
  validateVerifyResult,
} = require('./resultsValidators');

// All result endpoints require authentication
router.use(authMiddleware);

// Verify Result canonical hash (Phase 6C)
router.get(
  '/:id/verify',
  validationMiddleware(validateVerifyResult),
  ResultsController.verify
);

// Admin-only blockchain reconciliation of published results (Phase 6D)
router.get(
  '/reconciliation',
  roleMiddleware(ROLES.ADMIN),
  ResultsController.reconcile
);

// Retrieve Result by ID (Phase 5A)
router.get('/:id', ResultsController.getById);

// Single Result status transition (Phase 5B)
router.patch(
  '/:id/status',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateUpdateResultStatus),
  ResultsController.updateStatus
);

// Direct /results/exam/:examId routes for convenience
router.get('/exam/:examId', ResultsController.getByExamId);

router.post(
  '/exam/:examId',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateCreateResult),
  ResultsController.create
);

router.post(
  '/exam/:examId/batch',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateBatchResult),
  ResultsController.createBatch
);

router.patch(
  '/exam/:examId/status',
  roleMiddleware(ROLES.ADMIN, ROLES.FACULTY),
  validationMiddleware(validateBatchResultStatus),
  ResultsController.updateBatchStatus
);

module.exports = router;
