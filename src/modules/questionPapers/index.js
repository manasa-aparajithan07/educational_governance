'use strict';

const questionPapersRoutes = require('./questionPapersRoutes');
const questionPapersController = require('./questionPapersController');
const questionPapersService = require('./questionPapersService');
const { uploadQuestionPaperMiddleware } = require('./uploadMiddleware');

module.exports = {
  routes: questionPapersRoutes,
  controller: questionPapersController,
  service: questionPapersService,
  uploadMiddleware: uploadQuestionPaperMiddleware,
};
