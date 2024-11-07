// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';

// Mock Secret Manager
jest.mock('./src/utils/secretManager', () => ({
  ensureInitialized: jest.fn().mockResolvedValue(true),
  getSecret: jest.fn().mockImplementation((secretName) => {
    const secrets = {
      'DB_USER': 'test_user',
      'DB_PASSWORD': 'test_password',
      'DB_NAME': 'test_db',
      'DB_HOST': 'localhost',
      'DB_PORT': '5432',
      'CLOUD_SQL_CONNECTION_NAME': 'test-connection',
      'jwt-secret': 'test-jwt-secret'
    };
    return Promise.resolve(secrets[secretName]);
  })
}));

// Mock Logger
jest.mock('./src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));