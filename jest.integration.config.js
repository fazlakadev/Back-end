module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  transformIgnorePatterns: ['node_modules/(?!(@scure|@otplib|@noble)/)'],
  testTimeout: 60000,
};
