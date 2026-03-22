// path: jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: [
    'src/core/**/*.ts',
    'src/jobs/**/*.ts',
    'src/notify/**/*.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',

  moduleNameMapper: {
    '^satellite\\.js$': '<rootDir>/test/mocks/satellite.js',
  },

  coverageThreshold: {
    global: {
      statements: 40,
      branches: 25,
      functions: 40,
      lines: 45,
    },
  },

  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

export default config;