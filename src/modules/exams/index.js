'use strict';

const examsRoutes = require('./examsRoutes');
const ExamsController = require('./examsController');
const ExamsService = require('./examsService');
const examsValidators = require('./examsValidators');

module.exports = {
  name: 'exams',
  status: 'PHASE_3A_FOUNDATION',
  routes: examsRoutes,
  controller: ExamsController,
  service: ExamsService,
  validators: examsValidators,
};
