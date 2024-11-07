module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};