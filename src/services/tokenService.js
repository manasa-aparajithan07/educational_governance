'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');
const { RefreshToken, User } = require('../database/models');
const HashingService = require('./hashingService');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const { ACCOUNT_STATUS } = require('../utils/constants');
const logger = require('../utils/logger');

class TokenService {
  /**
   * Helper to parse time strings like '1h', '7d', '15m' to milliseconds
   */
  static parseExpiryToDate(expiryStr) {
    const now = Date.now();
    const match = /^(\d+)([smhd])$/.exec(expiryStr);
    if (!match) {
      // Default fallback 7 days
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    }
    const val = parseInt(match[1], 10);
    const unit = match[2];
    let ms = 0;
    switch (unit) {
      case 's': ms = val * 1000; break;
      case 'm': ms = val * 60 * 1000; break;
      case 'h': ms = val * 60 * 60 * 1000; break;
      case 'd': ms = val * 24 * 60 * 60 * 1000; break;
      default: ms = 7 * 24 * 60 * 60 * 1000;
    }
    return new Date(now + ms);
  }

  /**
   * Generates dual access and refresh tokens for an authenticated user
   * @param {Object} user - User Sequelize instance or plain object
   * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: string }>}
   */
  static async generateTokens(user, options = {}) {
    const accessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      accountStatus: user.accountStatus,
    };

    const accessToken = jwt.sign(accessPayload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn,
    });

    const refreshJti = uuidv4();
    const refreshPayload = {
      sub: user.id,
      jti: refreshJti,
      type: 'refresh',
    };

    const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    });

    const tokenHash = HashingService.hashData(refreshToken);
    const expiresAt = this.parseExpiryToDate(config.jwt.refreshExpiresIn);

    // Save refresh token in database
    await RefreshToken.create(
      {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
      options
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.accessExpiresIn,
    };
  }

  /**
   * Validates access token
   * @param {string} token
   * @returns {Object} decoded payload
   */
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, config.jwt.accessSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Access token has expired', 'TOKEN_EXPIRED');
      }
      if (err.name === 'JsonWebTokenError') {
        throw new UnauthorizedError('Invalid access token', 'INVALID_TOKEN');
      }
      throw new UnauthorizedError('Malformed or unverified token', 'TOKEN_ERROR');
    }
  }

  /**
   * Validates refresh token signature
   * @param {string} token
   * @returns {Object} decoded payload
   */
  static verifyRefreshTokenSignature(token) {
    try {
      return jwt.verify(token, config.jwt.refreshSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Refresh token has expired, please log in again', 'TOKEN_EXPIRED');
      }
      if (err.name === 'JsonWebTokenError') {
        throw new UnauthorizedError('Invalid refresh token', 'INVALID_TOKEN');
      }
      throw new UnauthorizedError('Malformed refresh token', 'TOKEN_ERROR');
    }
  }

  /**
   * Rotates refresh token: revokes old token and issues fresh token pair
   * @param {string} oldRefreshToken
   * @returns {Promise<{ accessToken: string, refreshToken: string, user: Object }>}
   */
  static async rotateRefreshToken(oldRefreshToken) {
    const decoded = this.verifyRefreshTokenSignature(oldRefreshToken);
    const tokenHash = HashingService.hashData(oldRefreshToken);

    const tokenRecord = await RefreshToken.findOne({
      where: { tokenHash },
    });

    if (!tokenRecord) {
      throw new UnauthorizedError('Refresh token unrecognized or revoked', 'INVALID_REFRESH_TOKEN');
    }

    if (tokenRecord.revokedAt) {
      // Possible token reuse detected: revoke all active tokens for this user as a safeguard
      await this.revokeAllUserTokens(tokenRecord.userId);
      logger.warn(`Token reuse detected for user ${tokenRecord.userId}. Revoking all sessions.`);
      throw new UnauthorizedError('Revoked token reuse detected. All sessions terminated for security.', 'TOKEN_REUSE_DETECTED');
    }

    if (new Date() > new Date(tokenRecord.expiresAt)) {
      throw new UnauthorizedError('Refresh token expired', 'TOKEN_EXPIRED');
    }

    // Revoke old refresh token
    tokenRecord.revokedAt = new Date();
    await tokenRecord.save();

    // Fetch user and verify active status
    const user = await User.findByPk(decoded.sub);
    if (!user) {
      throw new UnauthorizedError('User account not found', 'USER_NOT_FOUND');
    }

    if (user.accountStatus !== ACCOUNT_STATUS.ACTIVE) {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
    }

    const { sequelize } = require('../database/models');
    const tokens = await sequelize.transaction(async (t) => {
      // Revoke old refresh token
      tokenRecord.revokedAt = new Date();
      await tokenRecord.save({ transaction: t });

      // Issue new token pair atomically
      return await this.generateTokens(user, { transaction: t });
    });

    return {
      ...tokens,
      user,
    };
  }

  /**
   * Explicitly revokes a single refresh token (on user logout)
   * @param {string} refreshToken
   * @param {Object} options - Sequelize options including transaction
   * @returns {Promise<boolean>}
   */
  static async revokeRefreshToken(refreshToken, options = {}) {
    try {
      const tokenHash = HashingService.hashData(refreshToken);
      const [affectedRows] = await RefreshToken.update(
        { revokedAt: new Date() },
        { where: { tokenHash, revokedAt: null }, ...options }
      );
      return affectedRows > 0;
    } catch (err) {
      logger.error('Error revoking refresh token:', err);
      return false;
    }
  }

  /**
   * Revokes all active refresh tokens for a user (on password change, ban, or security logout)
   * @param {string} userId
   * @param {Object} options - Sequelize options including transaction
   * @returns {Promise<number>}
   */
  static async revokeAllUserTokens(userId, options = {}) {
    const [affectedRows] = await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: null }, ...options }
    );
    return affectedRows;
  }
}

module.exports = TokenService;
