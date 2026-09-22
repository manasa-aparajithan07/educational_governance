'use strict';

const { AuditLog } = require('../database/models');
const logger = require('../utils/logger');
const HashingService = require('./hashingService');

class AuditService {
  static sanitizeRecordData(data) {
    if (!data) return null;
    if (typeof data === 'string') return data;
    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    const sensitiveKeys = [
      'password',
      'passwordHash',
      'refreshToken',
      'accessToken',
      'token',
      'secret',
      'privateKey',
      'currentPassword',
      'newPassword',
    ];
    for (const key of sensitiveKeys) {
      delete sanitized[key];
    }
    return sanitized;
  }

  /**
   * Records an immutable audit log entry
   */
  static async logEvent({
    entityType,
    entityId = null,
    eventType,
    performedBy = null,
    performedByRole = null,
    description = null,
    recordData = null,
    blockchainTransactionId = null,
    ipAddress = null,
    userAgent = null,
  }) {
    try {
      let recordHash = null;
      if (recordData) {
        const sanitized = this.sanitizeRecordData(recordData);
        const serialized = typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
        recordHash = HashingService.hashData(serialized);
      }

      const log = await AuditLog.create({
        entityType,
        entityId: entityId ? String(entityId) : null,
        eventType,
        performedBy,
        performedByRole,
        description,
        recordHash,
        blockchainTransactionId,
        ipAddress,
        userAgent,
      });

      return log;
    } catch (error) {
      logger.error('Failed to create audit log entry:', error);
      // Non-blocking in dev, but logged
      return null;
    }
  }
}

module.exports = AuditService;
