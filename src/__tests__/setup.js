const dotenv = require('dotenv');
const path = require('path');

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

// Mock Secret Manager
jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    accessSecretVersion: jest.fn().mockResolvedValue([
      { payload: { data: Buffer.from('test-value') } }
    ])
  }))
}));

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.CLOUD_SQL_CONNECTION_NAME = 'test-connection';
process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';