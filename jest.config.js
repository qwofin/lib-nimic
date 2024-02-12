/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  // preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  transform: {
    '\\.[jt]s?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    '(.+)\\.js': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
}
