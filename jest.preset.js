const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  timeout: 60000,
};
