'use strict';

const ResultsService = require('./resultsService');
const ResultsController = require('./resultsController');
const resultsRoutes = require('./resultsRoutes');
const resultsValidators = require('./resultsValidators');
const gradingUtils = require('./gradingUtils');
const resultHashUtils = require('./resultHashUtils');

/**
 * Results Module
 * Phase 5: Evaluation & Results Management
 * Phase 6: Blockchain Integration Preparation
 */
module.exports = {
  name: 'results',
  service: ResultsService,
  controller: ResultsController,
  routes: resultsRoutes,
  validators: resultsValidators,
  gradingUtils,
  resultHashUtils,
};
