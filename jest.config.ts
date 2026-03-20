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
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // satellite.js をローカルモックへマッピング
  moduleNameMapper: {
    '^satellite\\.js$': '<rootDir>/test/mocks/satellite.js',
  },
};

export default config;