'use strict';

const BlockchainService = require('../../services/blockchainService');

/**
 * Blockchain Module
 * Phase 6B: Blockchain Service Abstraction & Disabled-Mode Handling
 * Phase 7 & 8: Hyperledger Fabric Chaincode & Gateway Integration (PLANNED)
 */
module.exports = {
  name: 'blockchain',
  status: 'PHASE_6B_SERVICE_ABSTRACTION',
  service: BlockchainService,
};
