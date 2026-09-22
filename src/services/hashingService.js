'use strict';

const crypto = require('crypto');
const fs = require('fs');

class HashingService {
  /**
   * Generates SHA-256 hash for a given string or Buffer
   * @param {string|Buffer} data
   * @returns {string} 64-character hexadecimal SHA-256 hash
   */
  static hashData(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generates SHA-256 hash for a file on disk
   * @param {string} filePath
   * @returns {Promise<string>}
   */
  static hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Verifies if given data matches an expected hash
   * @param {string|Buffer} data
   * @param {string} expectedHash
   * @returns {boolean}
   */
  static verifyHash(data, expectedHash) {
    const actual = this.hashData(data);
    return actual.toLowerCase() === expectedHash.toLowerCase();
  }
}

module.exports = HashingService;
