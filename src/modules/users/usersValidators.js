'use strict';

const { validateEmail } = require('../../validators/commonValidators');
const { ROLES, ACCOUNT_STATUS } = require('../../utils/constants');
const { validatePasswordStrength } = require('../auth/authValidators');

function validateCreateUser(req) {
  const errors = [];
  const { fullName, email, password, role, accountStatus } = req.body || {};

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    errors.push({ field: 'fullName', message: 'Full name is required and must be at least 2 characters long' });
  }

  if (!email || typeof email !== 'string' || !validateEmail(email.trim())) {
    errors.push({ field: 'email', message: 'A valid email address is required' });
  }

  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (!validatePasswordStrength(password)) {
    errors.push({
      field: 'password',
      message: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character',
    });
  }

  if (role && !Object.values(ROLES).includes(role)) {
    errors.push({ field: 'role', message: `Role must be one of: ${Object.values(ROLES).join(', ')}` });
  }

  if (accountStatus && !Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
    errors.push({ field: 'accountStatus', message: `Account status must be one of: ${Object.values(ACCOUNT_STATUS).join(', ')}` });
  }

  return errors;
}

function validateUpdateUser(req) {
  const errors = [];
  const { fullName, role, accountStatus } = req.body || {};

  if (fullName !== undefined && (typeof fullName !== 'string' || fullName.trim().length < 2)) {
    errors.push({ field: 'fullName', message: 'Full name must be at least 2 characters long' });
  }

  if (role !== undefined && !Object.values(ROLES).includes(role)) {
    errors.push({ field: 'role', message: `Role must be one of: ${Object.values(ROLES).join(', ')}` });
  }

  if (accountStatus !== undefined && !Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
    errors.push({ field: 'accountStatus', message: `Account status must be one of: ${Object.values(ACCOUNT_STATUS).join(', ')}` });
  }

  return errors;
}

module.exports = {
  validateCreateUser,
  validateUpdateUser,
};
