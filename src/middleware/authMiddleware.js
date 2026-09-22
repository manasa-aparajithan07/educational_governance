'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const { User } = require('../database/models');
const { ACCOUNT_STATUS } = require('../utils/constants');
const TokenService = require('../services/tokenService');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization header missing or malformed');
    }

    const token = authHeader.split(' ')[1];
    const decoded = TokenService.verifyAccessToken(token);

    const user = await User.findByPk(decoded.sub);
    if (!user) {
      throw new UnauthorizedError('User account not found', 'USER_NOT_FOUND');
    }

    if (user.accountStatus !== ACCOUNT_STATUS.ACTIVE) {
      throw new ForbiddenError('Account is not active', 'ACCOUNT_INACTIVE');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authMiddleware;
