'use strict';

const { ValidationError } = require('../utils/errors');

function validationMiddleware(validatorFn) {
  return (req, res, next) => {
    try {
      const errors = validatorFn(req);
      if (errors && errors.length > 0) {
        return next(new ValidationError('Validation failed', errors));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validationMiddleware;
