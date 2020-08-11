/* --------------------
 * livepack module
 * Jest config
 * ------------------*/

'use strict';

// Exports

module.exports = {
	testEnvironment: 'node',
	coverageDirectory: 'coverage',
	collectCoverageFrom: ['index.js', 'lib/**/*.js'],
	setupFilesAfterEnv: [
		'jest-extended',
		'jest-expect-arguments',
		'<rootDir>/test/support/expect.js'
	],
	transform: {
		'\\.js$': '<rootDir>/test/support/transform.js'
	}
};
