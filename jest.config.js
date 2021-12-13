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
	testPathIgnorePatterns: ['/node_modules/', '.mocha.test.js']
};
