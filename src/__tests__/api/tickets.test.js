const request = require('supertest');
const app = require('../../index');
const { initializeDatabase } = require('../../config/database');
const jwt = require('jsonwebtoken');

describe('Tickets API', () => {
  let authToken;
  
  beforeAll(async () => {
    await initializeDatabase();
    // Create test auth token
    authToken = jwt.sign(
      { id: 'test-admin', role: 'admin' },
      process.env.JWT_SECRET || 'test-secret'
    );
  });

  describe('GET /api/tickets', () => {
    it('should return list of tickets', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.tickets)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/tickets');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/tickets', () => {
    it('should create a new ticket', async () => {
      const ticketData = {
        subject: 'Test Ticket',
        category: 'support',
        priority: 'medium',
        customerId: '00000000-0000-0000-0000-000000000000'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(ticketData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.subject).toBe(ticketData.subject);
    });
  });
});