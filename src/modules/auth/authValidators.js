'use strict';

const { validateEmail } = require('../../validators/commonValidators');

function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 8) return false;
  // Must contain uppercase, lowercase, number, and special character
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  return hasUpper && hasLower && hasNumber && hasSpecial;
}

const { ROLES } = require('../../utils/constants');

function validateRegister(req) {
  const errors = [];
  const { fullName, email, password, studentId, department, role } = req.body || {};

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    errors.push({
      field: 'fullName',
      message: 'Full name is required and must be at least 2 characters long',
    });
  }

  if (!email || typeof email !== 'string' || !validateEmail(email.trim())) {
    errors.push({
      field: 'email',
      message: 'A valid email address is required',
    });
  }

  if (!password || typeof password !== 'string') {
    errors.push({
      field: 'password',
      message: 'Password is required',
    });
  } else if (!validatePasswordStrength(password)) {
    errors.push({
      field: 'password',
      message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    });
  }

  // Enforce role restriction for public registration
  if (role !== undefined) {
    if (role !== ROLES.STUDENT) {
      errors.push({
        field: 'role',
        message: 'Public registration is only permitted for STUDENT accounts. Administrative and faculty accounts must be created by an administrator.',
      });
    }
  }

  if (studentId !== undefined && (typeof studentId !== 'string' || studentId.trim().length === 0)) {
    errors.push({
      field: 'studentId',
      message: 'Student ID must be a non-empty string',
    });
  }

  if (department !== undefined && typeof department !== 'string') {
    errors.push({
      field: 'department',
      message: 'Department must be a string',
    });
  }

  return errors;
}

function validateLogin(req) {
  const errors = [];
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !validateEmail(email.trim())) {
    errors.push({
      field: 'email',
      message: 'Valid email is required',
    });
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.push({
      field: 'password',
      message: 'Password is required',
    });
  }

  return errors;
}

function validateChangePassword(req) {
  const errors = [];
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || typeof currentPassword !== 'string') {
    errors.push({
      field: 'currentPassword',
      message: 'Current password is required',
    });
  }

  if (!newPassword || typeof newPassword !== 'string') {
    errors.push({
      field: 'newPassword',
      message: 'New password is required',
    });
  } else if (!validatePasswordStrength(newPassword)) {
    errors.push({
      field: 'newPassword',
      message: 'New password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    });
  } else if (currentPassword && currentPassword === newPassword) {
    errors.push({
      field: 'newPassword',
      message: 'New password cannot be the same as current password',
    });
  }

  return errors;
}

function validateRefreshToken(req) {
  const errors = [];
  const { refreshToken } = req.body || {};

  if (!refreshToken || typeof refreshToken !== 'string') {
    errors.push({
      field: 'refreshToken',
      message: 'Refresh token string is required',
    });
  }

  return errors;
}

function validateUpdateProfile(req) {
  const errors = [];
  const { fullName, department, role, email, accountStatus, password, passwordHash } = req.body || {};

  if (role !== undefined) {
    errors.push({
      field: 'role',
      message: 'Modifying role through profile update is not permitted',
    });
  }

  if (accountStatus !== undefined) {
    errors.push({
      field: 'accountStatus',
      message: 'Modifying account status through profile update is not permitted',
    });
  }

  if (email !== undefined) {
    errors.push({
      field: 'email',
      message: 'Modifying email address through profile update is not permitted',
    });
  }

  if (password !== undefined || passwordHash !== undefined) {
    errors.push({
      field: 'password',
      message: 'Password cannot be updated through this endpoint. Please use /change-password.',
    });
  }

  if (fullName !== undefined) {
    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      errors.push({
        field: 'fullName',
        message: 'Full name must be at least 2 characters long',
      });
    }
  }

  if (department !== undefined) {
    if (typeof department !== 'string' || department.trim().length === 0) {
      errors.push({
        field: 'department',
        message: 'Department must be a non-empty string',
      });
    }
  }

  return errors;
}

module.exports = {
  validatePasswordStrength,
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateRefreshToken,
  validateUpdateProfile,
};
