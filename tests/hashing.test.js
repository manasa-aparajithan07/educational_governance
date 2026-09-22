'use strict';

const fs = require('fs');
const path = require('path');
const HashingService = require('../src/services/hashingService');

describe('Hashing Service', () => {
  it('should generate a 64-character SHA-256 hexadecimal hash', () => {
    const data = 'Educational Governance Blockchain';
    const hash = HashingService.hashData(data);

    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64);
    expect(/^[a-f0-9]{64}$/i.test(hash)).toBe(true);
  });

  it('should verify matching hash accurately', () => {
    const data = 'Exam Paper Content';
    const expectedHash = HashingService.hashData(data);

    expect(HashingService.verifyHash(data, expectedHash)).toBe(true);
    expect(HashingService.verifyHash(data, 'wronghash12345')).toBe(false);
  });

  it('should hash file contents on disk using SHA-256 stream', async () => {
    const tempFilePath = path.join(__dirname, 'temp-test-hash.txt');
    fs.writeFileSync(tempFilePath, 'Immutable Exam Record Sample Data');

    try {
      const fileHash = await HashingService.hashFile(tempFilePath);
      const expectedHash = HashingService.hashData('Immutable Exam Record Sample Data');

      expect(fileHash).toBe(expectedHash);
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  });
});
