'use strict';

const express = require('express');
const router = express.Router();
const config = require('../config/env');
const { sequelize } = require('../database/models');
const { sendSuccess } = require('../utils/apiResponse');

const authModule = require('../modules/auth');
const usersModule = require('../modules/users');
const examsModule = require('../modules/exams');
const questionPapersModule = require('../modules/questionPapers');
const resultsModule = require('../modules/results');
const departmentsRoutes = require('./departmentsRoutes');
const BlockchainService = require('../services/blockchainService');

/**
 * Health check endpoint
 * GET /api/v1/health
 */
router.get('/health', async (req, res, next) => {
  try {
    let dbStatus = 'CONNECTED';
    try {
      await sequelize.authenticate();
    } catch (err) {
      dbStatus = 'DISCONNECTED';
    }

    const fabricReadiness = BlockchainService.checkFabricReadiness();

    const healthData = {
      status: dbStatus === 'CONNECTED' ? 'UP' : 'DEGRADED',
      service: 'education-governance-backend',
      version: '1.0.0',
      environment: config.env,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        dialect: sequelize.getDialect(),
      },
      blockchain: {
        fabricEnabled: config.fabric.enabled,
        channel: config.fabric.channelName,
        chaincode: config.fabric.chaincodeName,
        readiness: fabricReadiness,
      },
    };

    return sendSuccess(res, {
      message: 'System is operational',
      data: healthData,
      statusCode: dbStatus === 'CONNECTED' ? 200 : 503,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Root API metadata overview endpoint
 * GET /api/v1
 */
router.get('/', (req, res) => {
  return sendSuccess(res, {
    message: 'A Blockchain-Based Framework for Transparent Educational Governance API',
    data: {
      name: 'Education Governance Backend API',
      version: '1.0.0',
      phase: 'Phase 2: Authentication & User Management (RBAC)',
      status: 'Active',
      documentation: {
        baseApiUrl: `http://localhost:${config.port}${config.apiPrefix}`,
        healthEndpoint: `${config.apiPrefix}/health`,
      },
      availableModules: [
        { name: 'Core Foundation & Database', status: 'COMPLETED' },
        { name: 'Authentication & User Management', status: 'COMPLETED' },
        { name: 'Examination Management', status: 'PHASE_3A_FOUNDATION' },
        { name: 'Question Paper Storage & Verification', status: 'PENDING_PHASE_4' },
        { name: 'Result Management & Verification', status: 'PHASE_5B_COMPLETED' },
        { name: 'Grievance Redressal & History', status: 'PENDING_PHASE_6' },
        { name: 'Hyperledger Fabric Chaincode & Gateway', status: 'PENDING_PHASE_7_8' },
        { name: 'Unified Immutable Audit Trail', status: 'PENDING_PHASE_8' },
      ],
    },
  });
});

/**
 * Mount Feature Routers
 */
router.use('/auth', authModule.routes);
router.use('/users', usersModule.routes);
router.use('/exams', examsModule.routes);
router.use('/question-papers', questionPapersModule.routes);
router.use('/departments', departmentsRoutes);
router.use('/results', resultsModule.routes);

module.exports = router;
