/* --------------------
 * livepack module
 * Jest config
 * ------------------*/

'use strict';

// Exports

module.exports = {
	testEnvironment: 'node',
	coverageDirectory: 'coverage',
	coverageProvider: 'v8',
	collectCoverageFrom: ['*.js', '!.eslintrc.js', '!jest.config.js', 'lib/**/*.js'],
	setupFilesAfterEnv: [
		'jest-extended/all',
		'jest-expect-arguments',
		'<rootDir>/test/support/expect.js'
	],
	transform: {
		'\\.js$': '<rootDir>/test/support/transform.js'
	},
	testPathIgnorePatterns: ['/node_modules/', '.mocha.test.js'],
	// Jest by default uses a number of workers equal to number of CPU cores minus 1.
	// Github Actions runners provide 2 cores and running with 2 workers is faster than 1.
	...(process.env.CI && {maxWorkers: '100%'})
};
