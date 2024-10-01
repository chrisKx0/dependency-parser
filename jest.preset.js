const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  timeout: 1000 * 60 * 60, // 1 hour for now TODO decrease
  // transform: {
  //   '^.+\\.(ts|js)$': ['ts-jest', { diagnostics: false }],
  // },
  // transformIgnorePatterns: ['node_modules/(?!(@actions/core)/)'],
};
