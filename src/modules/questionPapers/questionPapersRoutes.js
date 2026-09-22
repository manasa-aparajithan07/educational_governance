'use strict';

const express = require('express');
const router = express.Router();
const QuestionPapersController = require('./questionPapersController');
const authMiddleware = require('../../middleware/authMiddleware');
const roleMiddleware = require('../../middleware/roleMiddleware');
const { ROLES } = require('../../utils/constants');

// All question paper endpoints require authentication and ADMIN/FACULTY privileges
router.use(authMiddleware);
router.use(roleMiddleware(ROLES.ADMIN, ROLES.FACULTY));

// Retrieve QuestionPaper metadata by ID
router.get('/:id', QuestionPapersController.getById);

// Download QuestionPaper file by ID
router.get('/:id/download', QuestionPapersController.download);

// Verify QuestionPaper integrity and detect tampering (Phase 4B)
router.post('/:id/verify', QuestionPapersController.verify);

// Soft-delete QuestionPaper by ID
router.delete('/:id', QuestionPapersController.delete);

module.exports = router;
