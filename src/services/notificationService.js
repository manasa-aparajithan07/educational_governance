'use strict';

const logger = require('../utils/logger');

class NotificationService {
  static async notify({ recipientId, title, message, metadata = {} }) {
    logger.info(`[Notification] To: ${recipientId} | Title: ${title} | Message: ${message}`);
    return {
      sent: true,
      timestamp: new Date().toISOString(),
      recipientId,
    };
  }
}

module.exports = NotificationService;
