'use strict';

const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const logger = require('../utils/logger');

class FileStorageService {
  constructor() {
    this.uploadDir = config.upload.dir;
    this.ensureUploadDir();
  }

  ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      logger.info(`Created upload directory at: ${this.uploadDir}`);
    }
  }

  getStoragePath(storageKey) {
    // Prevent directory traversal attacks
    const safeKey = path.basename(storageKey);
    return path.join(this.uploadDir, safeKey);
  }

  fileExists(storageKey) {
    const filePath = this.getStoragePath(storageKey);
    return fs.existsSync(filePath);
  }

  deleteFile(storageKey) {
    const filePath = this.getStoragePath(storageKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}

module.exports = new FileStorageService();
