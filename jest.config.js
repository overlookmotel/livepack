/* --------------------
 * livepack module
 * Jest config
 * ------------------*/

'use strict';

// Exports

module.exports = {
	testEnvironment: 'node',
	runner: '<rootDir>/test/support/runner.mjs',
	coverageDirectory: 'coverage',
	coverageProvider: 'v8',
	collectCoverageFrom: ['*.js', '!.eslintrc.js', '!jest.config.js', 'lib/**/*.js'],
	setupFilesAfterEnv: [
		'@overlookmotel/jest-extended/all',
		'jest-expect-arguments',
		'<rootDir>/test/support/expect.js',
		'<rootDir>/test/support/register.js'
	],
	testSequencer: '<rootDir>/test/support/sequencer.js',
	// Jest by default uses a number of workers equal to number of CPU cores minus 1.
	// Github Actions runners provide 2 cores and running with 2 workers is faster than 1.
	...(process.env.CI && {maxWorkers: '100%'})
};
