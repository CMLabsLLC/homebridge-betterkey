/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/.test-dist/test'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: ['<rootDir>/.test-dist/src/**/*.js', '!**/index.js'],
};
