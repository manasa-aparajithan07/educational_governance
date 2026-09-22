'use strict';

const request = require('supertest');
const app = require('../src/app');
const { sequelize } = require('../src/database/models');

describe('Health & Foundation Endpoints', () => {
  afterAll(async () => {
    // Close connection after tests to prevent open handles
    await sequelize.close();
  });

  describe('GET /api/v1/health', () => {
    it('should return 200 and standard success envelope with system status', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('data');
      expect(res.body.error).toBeNull();

      const { data } = res.body;
      expect(data).toHaveProperty('status', 'UP');
      expect(data).toHaveProperty('service', 'education-governance-backend');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('uptimeSeconds');
      expect(data).toHaveProperty('timestamp');
      expect(data.database).toHaveProperty('status', 'CONNECTED');
      expect(data.blockchain).toHaveProperty('fabricEnabled');
    });
  });

  describe('GET /health (direct top-level)', () => {
    it('should return 200 and standard success envelope', async () => {
      const res = await request(app).get('/health');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
    });
  });

  describe('GET /api/v1 (root API metadata)', () => {
    it('should return 200 with API overview and available module roadmap', async () => {
      const res = await request(app).get('/api/v1');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('name', 'Education Governance Backend API');
      expect(res.body.data).toHaveProperty('phase');
      expect(res.body.data).toHaveProperty('availableModules');
      expect(Array.isArray(res.body.data.availableModules)).toBe(true);
    });
  });
});
