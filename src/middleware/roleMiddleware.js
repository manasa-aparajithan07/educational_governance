'use strict';

const { ForbiddenError } = require('../utils/errors');
const AuditService = require('../services/auditService');

function roleMiddleware(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('User context not established'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      AuditService.logEvent({
        entityType: 'AccessControl',
        entityId: req.user.id,
        eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        performedBy: req.user.id,
        performedByRole: req.user.role,
        description: `Unauthorized access attempt to ${req.method} ${req.originalUrl}. Required roles: ${allowedRoles.join(', ')}`,
        ipAddress: req.ip,
        userAgent: req.headers ? req.headers['user-agent'] : null,
      }).catch(() => {});

      return next(
        new ForbiddenError(
          `Access denied. Role '${req.user.role}' is not authorized to access this resource.`,
          { permittedRoles: allowedRoles }
        )
      );
    }

    next();
  };
}

module.exports = roleMiddleware;
