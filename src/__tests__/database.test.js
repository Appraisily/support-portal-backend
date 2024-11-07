const { initializeDatabase } = require('../config/database');
const secretManager = require('../utils/secretManager');

describe('Database Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize database with correct config', async () => {
    const sequelize = await initializeDatabase();
    expect(sequelize).toBeDefined();
    expect(secretManager.getSecret).toHaveBeenCalledWith('DB_USER');
    expect(secretManager.getSecret).toHaveBeenCalledWith('DB_PASSWORD');
    expect(secretManager.getSecret).toHaveBeenCalledWith('DB_NAME');
  });
});