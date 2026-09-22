'use strict';

const fs = require('fs');
const { Op } = require('sequelize');
const fabricConfig = require('../config/fabricConfig');
const { BlockchainTransaction, Result } = require('../database/models');
const logger = require('../utils/logger');
const {
  buildCanonicalResultPayload,
  calculateResultHash,
  verifyResultHash: verifyCanonicalHash,
  SCHEMA_VERSION,
} = require('../modules/results/resultHashUtils');

/**
 * BlockchainService
 *
 * Provider-independent blockchain abstraction service.
 * Supports Phase 6B Hyperledger Fabric disabled mode safely:
 * - When FABRIC_ENABLED=false:
 *   - No network calls or Fabric SDK connections are initiated.
 *   - Returns explicit disabled-mode responses.
 *   - Preserves deterministic canonical result hashing (SHA-256).
 *   - Prevents generation of fake transaction hashes.
 *   - Prevents persistence of uncommitted / fake BlockchainTransaction records.
 *   - Excludes all PII and plaintext student identifiers.
 */
class BlockchainService {
  /**
   * Checks whether Hyperledger Fabric integration is enabled
   * @returns {boolean}
   */
  static isFabricEnabled() {
    return Boolean(fabricConfig && fabricConfig.enabled);
  }

  /**
   * Anchors a Result record to the blockchain.
   * In Fabric-disabled mode (FABRIC_ENABLED=false):
   * - Computes and preserves the canonical payload hash.
   * - Does not connect to Fabric or attempt network calls.
   * - Does not generate fake transaction hashes.
   * - Does not mark status as COMMITTED.
   * - Does not persist misleading BlockchainTransaction records.
   * - Returns an explicit disabled response object.
   *
   * @param {Object} resultInput - Result model instance or plain data object
   * @returns {Promise<Object>} Anchoring operation result
   */
  static async anchorResult(resultInput) {
    if (!resultInput) {
      throw new Error('Result payload is required for blockchain anchoring');
    }

    // 1. Build canonical payload & compute authoritative SHA-256 hash (Phase 6A)
    // Excludes PII, remarks, tokens, credentials, and plaintext studentId.
    const canonicalPayload = buildCanonicalResultPayload(resultInput);
    const payloadHash = calculateResultHash(resultInput);

    // 2. Disabled-mode handling (FABRIC_ENABLED=false)
    if (!this.isFabricEnabled()) {
      logger.debug(
        `Blockchain anchoring skipped for result '${canonicalPayload.resultId}': Hyperledger Fabric is disabled.`
      );

      // Return explicit disabled-mode response without database persistence
      return {
        anchored: false,
        status: 'DISABLED',
        enabled: false,
        message:
          'Hyperledger Fabric blockchain anchoring is currently disabled (FABRIC_ENABLED=false). No transaction was submitted or committed to the ledger.',
        payloadHash,
        canonicalPayload,
        transactionId: null,
        txHash: null,
        blockNumber: null,
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Live Fabric Gateway integration (Deferred to Phase 8)
    // Strictly unreachable while FABRIC_ENABLED=false.
    throw new Error(
      'Live Hyperledger Fabric anchoring is not configured in this environment.'
    );
  }

  /**
   * Retrieves transaction status from local records or the blockchain network.
   * In Fabric-disabled mode:
   * - Checks local database for existing transaction records without network calls.
   * - Returns an explicit disabled response if not found locally.
   *
   * @param {string} transactionId - Transaction hash or record UUID
   * @returns {Promise<Object>} Status object
   */
  static async getTransactionStatus(transactionId) {
    if (
      !transactionId ||
      typeof transactionId !== 'string' ||
      transactionId.trim().length === 0
    ) {
      return {
        found: false,
        status: 'NOT_FOUND',
        enabled: this.isFabricEnabled(),
        message: 'A valid transaction ID or hash is required',
        transactionId: null,
        tx: null,
      };
    }

    const cleanId = transactionId.trim();

    // Check local database for any pre-existing transaction records
    let localTx = null;
    try {
      localTx = await BlockchainTransaction.findOne({
        where: {
          [Op.or]: [{ txHash: cleanId }, { id: cleanId }],
        },
      });
    } catch (_) {
      try {
        localTx = await BlockchainTransaction.findOne({
          where: { txHash: cleanId },
        });
      } catch (_) {}
    }

    if (localTx) {
      const txData = localTx.toJSON ? localTx.toJSON() : localTx;
      return {
        found: true,
        status: localTx.status,
        enabled: this.isFabricEnabled(),
        txHash: localTx.txHash,
        transactionId: localTx.id,
        payloadHash: localTx.payloadHash,
        channelName: localTx.channelName,
        chaincodeName: localTx.chaincodeName,
        functionName: localTx.functionName,
        blockNumber: localTx.blockNumber,
        message: 'Transaction found in local database.',
        tx: txData,
      };
    }

    if (!this.isFabricEnabled()) {
      return {
        found: false,
        status: 'DISABLED',
        enabled: false,
        transactionId: cleanId,
        message:
          'Hyperledger Fabric is disabled (FABRIC_ENABLED=false). Transaction lookup on the blockchain ledger is not available.',
        tx: null,
      };
    }

    return {
      found: false,
      status: 'NOT_FOUND',
      enabled: true,
      transactionId: cleanId,
      message: 'Transaction not found on ledger.',
      tx: null,
    };
  }

  /**
   * Verifies the canonical SHA-256 hash of a result against an expected hash or stored anchor.
   * Supports:
   * - Direct payload object + expectedHash string
   * - Result UUID reference string + expectedHash string
   * - Wrapped payload object containing { payload/result, expectedHash }
   *
   * @param {Object|string} payloadOrReference - Result payload object or Result UUID
   * @param {string|null} expectedHash - Expected 64-character SHA-256 hash
   * @returns {Promise<Object>} Verification result
   */
  static async verifyResultHash(payloadOrReference, expectedHash = null) {
    if (!payloadOrReference) {
      return {
        verified: false,
        isMatch: false,
        status: 'INVALID_INPUT',
        enabled: this.isFabricEnabled(),
        error: 'Payload or reference is required for verification',
        calculatedHash: null,
        expectedHash: null,
      };
    }

    let target = payloadOrReference;
    let expected = expectedHash;

    // Support object wrapper: { payload, expectedHash } or { result, expectedHash }
    if (
      !expected &&
      typeof payloadOrReference === 'object' &&
      payloadOrReference !== null
    ) {
      expected =
        payloadOrReference.expectedHash ||
        payloadOrReference.hash ||
        payloadOrReference.payloadHash ||
        payloadOrReference.sha256Hash ||
        null;

      if (payloadOrReference.result || payloadOrReference.payload) {
        target = payloadOrReference.result || payloadOrReference.payload;
      }
    }

    // Support UUID string reference (resultId lookup in database)
    if (typeof target === 'string') {
      const resultRecord = await Result.findByPk(target.trim());
      if (!resultRecord) {
        return {
          verified: false,
          isMatch: false,
          status: 'NOT_FOUND',
          enabled: this.isFabricEnabled(),
          error: `Result with ID '${target}' not found`,
          calculatedHash: null,
          expectedHash: expected ? String(expected).trim().toLowerCase() : null,
        };
      }
      target = resultRecord;
    }

    // Calculate canonical SHA-256 hash
    let calculatedHash;
    try {
      calculatedHash = calculateResultHash(target);
    } catch (err) {
      return {
        verified: false,
        isMatch: false,
        status: 'CALCULATION_ERROR',
        enabled: this.isFabricEnabled(),
        error: err.message,
        calculatedHash: null,
        expectedHash: expected ? String(expected).trim().toLowerCase() : null,
      };
    }

    // Check if target has a local blockchainTransaction anchor
    let anchorHash = null;
    if (target && target.blockchainTransactionId) {
      const tx = await BlockchainTransaction.findOne({
        where: {
          [Op.or]: [
            { txHash: target.blockchainTransactionId },
            { id: target.blockchainTransactionId },
          ],
        },
      });
      if (tx && tx.payloadHash) {
        anchorHash = String(tx.payloadHash).trim().toLowerCase();
      }
    }

    if (anchorHash) {
      // Authoritative anchor exists
      const cleanExpected = expected ? String(expected).trim().toLowerCase() : null;
      if (cleanExpected && cleanExpected !== anchorHash) {
        return {
          verified: false,
          isMatch: false,
          status: 'MISMATCH',
          enabled: this.isFabricEnabled(),
          calculatedHash,
          expectedHash: anchorHash,
          message: 'Expected hash conflicts with stored blockchain anchor.',
        };
      }

      const isMatch = calculatedHash.toLowerCase() === anchorHash;
      return {
        verified: isMatch,
        isMatch,
        status: isMatch ? 'VERIFIED' : 'MISMATCH',
        enabled: this.isFabricEnabled(),
        calculatedHash,
        expectedHash: anchorHash,
        message: isMatch
          ? 'Result canonical hash matches trusted blockchain anchor.'
          : 'Tamper detected: Result canonical hash does not match trusted blockchain anchor.',
      };
    }

    // If still no expected hash is available for unanchored target:
    if (!expected) {
      return {
        verified: false,
        isMatch: false,
        status: this.isFabricEnabled() ? 'NO_EXPECTED_HASH' : 'DISABLED',
        enabled: this.isFabricEnabled(),
        message: this.isFabricEnabled()
          ? 'No expected hash or on-chain transaction reference available for verification.'
          : 'Hyperledger Fabric is disabled (FABRIC_ENABLED=false). Canonical hash calculated, but no expected hash was provided for comparison.',
        calculatedHash,
        expectedHash: null,
      };
    }

    const cleanExpected = String(expected).trim().toLowerCase();
    const isMatch = calculatedHash.toLowerCase() === cleanExpected;

    return {
      verified: isMatch,
      isMatch,
      status: isMatch ? 'VERIFIED' : 'MISMATCH',
      enabled: this.isFabricEnabled(),
      calculatedHash,
      expectedHash: cleanExpected,
      message: isMatch
        ? 'Result canonical hash matches expected hash.'
        : 'Result canonical hash does not match expected hash.',
    };
  }

  /**
   * Helper to build canonical result payload
   * @param {Object} resultInput
   * @returns {Object}
   */
  static buildCanonicalResultPayload(resultInput) {
    return buildCanonicalResultPayload(resultInput);
  }

  /**
   * Helper to compute canonical SHA-256 hash
   * @param {Object} resultInput
   * @returns {string}
   */
  static calculateResultHash(resultInput) {
    return calculateResultHash(resultInput);
  }

  /**
   * Non-network readiness check for Hyperledger Fabric integration (Phase 6D).
   * Validates local configuration and cryptographic material readability when enabled.
   * Never makes live network calls, never leaks private keys or credentials, and preserves
   * explicit disabled-mode semantics when FABRIC_ENABLED=false.
   *
   * @param {Object} [overrideConfig=null] - Optional configuration override (useful for testing)
   * @returns {Object} Readiness status object
   */
  static checkFabricReadiness(overrideConfig = null) {
    const cfg = overrideConfig || fabricConfig || {};
    const enabled = Boolean(cfg.enabled);

    if (!enabled) {
      return {
        status: 'DISABLED',
        ready: false,
        enabled: false,
        message:
          'Hyperledger Fabric is disabled (FABRIC_ENABLED=false). No blockchain connection will be attempted.',
        components: {
          configuration: false,
          cryptoMaterial: false,
        },
      };
    }

    // When FABRIC_ENABLED=true: validate local configuration completeness
    const hasChannel = Boolean(cfg.channelName && String(cfg.channelName).trim());
    const hasChaincode = Boolean(cfg.chaincodeName && String(cfg.chaincodeName).trim());
    const hasPeerEndpoint = Boolean(cfg.peerEndpoint && String(cfg.peerEndpoint).trim());
    const hasMspId = Boolean(cfg.mspId && String(cfg.mspId).trim());

    // Check connection profile path
    let profileExists = false;
    if (cfg.connectionProfilePath && typeof cfg.connectionProfilePath === 'string') {
      try {
        profileExists = fs.existsSync(cfg.connectionProfilePath);
      } catch (_) {
        profileExists = false;
      }
    }

    const configurationValid =
      hasChannel && hasChaincode && hasPeerEndpoint && hasMspId && profileExists;

    if (!configurationValid) {
      return {
        status: 'CONFIG_MISSING',
        ready: false,
        enabled: true,
        message:
          'Hyperledger Fabric configuration is incomplete: channel, chaincode, MSP, peer endpoint, or connection profile is missing.',
        components: {
          configuration: false,
          cryptoMaterial: false,
        },
      };
    }

    // Validate crypto material existence & readability without reading private keys into memory
    let certExists = false;
    let keyExists = false;

    if (cfg.certPath && typeof cfg.certPath === 'string') {
      try {
        certExists = fs.existsSync(cfg.certPath);
      } catch (_) {
        certExists = false;
      }
    }

    if (cfg.privateKeyPath && typeof cfg.privateKeyPath === 'string') {
      try {
        keyExists = fs.existsSync(cfg.privateKeyPath);
      } catch (_) {
        keyExists = false;
      }
    }

    const cryptoValid = certExists && keyExists;

    if (!cryptoValid) {
      return {
        status: 'CRYPTO_MATERIAL_MISSING',
        ready: false,
        enabled: true,
        message:
          'Hyperledger Fabric cryptographic material is missing or unreadable on disk.',
        components: {
          configuration: true,
          cryptoMaterial: false,
        },
      };
    }

    return {
      status: 'CONFIG_READY',
      ready: true,
      enabled: true,
      message:
        'Hyperledger Fabric local configuration and cryptographic materials are present and readable. Live network connection is not established.',
      components: {
        configuration: true,
        cryptoMaterial: true,
      },
    };
  }

  /**
   * Provider-independent reconciliation of PUBLISHED results (Phase 6D).
   * Identifies unanchored or inconsistent published results without modifying, deleting,
   * publishing, or creating any blockchain or database records.
   *
   * Classifications:
   * - DISABLED_UNANCHORED: Fabric disabled and intentionally unanchored in local storage.
   * - MISSING_TRANSACTION: Fabric enabled but result has no blockchain transaction reference.
   * - UNRESOLVED_REFERENCE: Result contains transaction reference, but no matching BlockchainTransaction record exists.
   * - PAYLOAD_HASH_MISMATCH: Stored transaction payloadHash does not match current canonical result hash.
   * - ANCHORED_COMMITTED: Result canonical hash matches committed blockchain transaction record.
   * - ANCHORED_PENDING: Result canonical hash matches transaction record in PENDING state.
   * - TRANSACTION_FAILED: Referenced transaction record is in FAILED state.
   * - ANCHORED_CONSISTENT: Result canonical hash matches transaction record anchor.
   *
   * @param {Object} [options]
   * @param {string|null} [options.examId] - Optional filter by examination UUID
   * @param {number} [options.limit=50] - Result limit (max 100)
   * @param {number} [options.offset=0] - Result offset
   * @returns {Promise<Object>} Reconciliation report
   */
  static async reconcilePublishedResults({ examId = null, limit = 50, offset = 0 } = {}) {
    const { RESULT_STATUS, BLOCKCHAIN_TX_STATUS } = require('../utils/constants');
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const where = {
      submissionStatus: RESULT_STATUS.PUBLISHED,
    };
    if (examId) {
      where.examId = examId;
    }

    const { count, rows } = await Result.findAndCountAll({
      where,
      limit: safeLimit,
      offset: safeOffset,
      order: [
        ['publishedAt', 'DESC'],
        ['id', 'ASC'],
      ],
    });

    const isEnabled = this.isFabricEnabled();
    const items = [];
    const summary = {
      totalPublished: count,
      reconciledCount: rows.length,
      fabricEnabled: isEnabled,
      disabledUnanchored: 0,
      missingTransaction: 0,
      unresolvedReference: 0,
      payloadHashMismatch: 0,
      transactionFailed: 0,
      consistent: 0,
    };

    for (const result of rows) {
      const calculatedHash = calculateResultHash(result);
      const txRef = result.blockchainTransactionId
        ? String(result.blockchainTransactionId).trim()
        : null;

      let classification;
      let detail;
      let txRecord = null;

      if (!txRef) {
        if (!isEnabled) {
          classification = 'DISABLED_UNANCHORED';
          detail =
            'Hyperledger Fabric is disabled (FABRIC_ENABLED=false). Result is intentionally unanchored in local storage.';
          summary.disabledUnanchored++;
        } else {
          classification = 'MISSING_TRANSACTION';
          detail =
            'Hyperledger Fabric is enabled, but this published result has no linked blockchain transaction reference.';
          summary.missingTransaction++;
        }
      } else {
        const tx = await BlockchainTransaction.findOne({
          where: {
            [Op.or]: [{ txHash: txRef }, { id: txRef }],
          },
        });

        if (!tx) {
          classification = 'UNRESOLVED_REFERENCE';
          detail =
            'Transaction reference exists on result but does not correspond to any registered blockchain transaction record.';
          summary.unresolvedReference++;
        } else {
          txRecord = {
            id: tx.id,
            txHash: tx.txHash,
            payloadHash: tx.payloadHash,
            status: tx.status,
            blockNumber: tx.blockNumber,
          };

          const storedPayloadHash = tx.payloadHash
            ? String(tx.payloadHash).trim().toLowerCase()
            : null;

          if (!storedPayloadHash || storedPayloadHash !== calculatedHash.toLowerCase()) {
            classification = 'PAYLOAD_HASH_MISMATCH';
            detail =
              'Payload hash mismatch: canonical hash computed from current database record does not match trusted transaction payloadHash.';
            summary.payloadHashMismatch++;
          } else if (tx.status === BLOCKCHAIN_TX_STATUS.FAILED) {
            classification = 'TRANSACTION_FAILED';
            detail = 'Referenced blockchain transaction is marked FAILED.';
            summary.transactionFailed++;
          } else if (tx.status === BLOCKCHAIN_TX_STATUS.COMMITTED) {
            classification = 'ANCHORED_COMMITTED';
            detail = 'Result canonical hash matches committed blockchain transaction anchor.';
            summary.consistent++;
          } else if (tx.status === BLOCKCHAIN_TX_STATUS.PENDING) {
            classification = 'ANCHORED_PENDING';
            detail = 'Result canonical hash matches local transaction anchor in PENDING state.';
            summary.consistent++;
          } else {
            classification = 'ANCHORED_CONSISTENT';
            detail = 'Result canonical hash matches local transaction anchor.';
            summary.consistent++;
          }
        }
      }

      items.push({
        resultId: result.id,
        examId: result.examId,
        submissionStatus: result.submissionStatus,
        publishedAt: result.publishedAt,
        calculatedHash,
        blockchainTransactionId: txRef,
        classification,
        detail,
        tx: txRecord,
      });
    }

    const discrepancies = items.filter(
      (item) =>
        item.classification === 'MISSING_TRANSACTION' ||
        item.classification === 'UNRESOLVED_REFERENCE' ||
        item.classification === 'PAYLOAD_HASH_MISMATCH' ||
        item.classification === 'TRANSACTION_FAILED'
    );

    return {
      summary,
      discrepancies,
      items,
      pagination: {
        page: Math.floor(safeOffset / safeLimit) + 1,
        limit: safeLimit,
        totalItems: count,
        totalPages: Math.ceil(count / safeLimit),
      },
    };
  }
}

module.exports = BlockchainService;
