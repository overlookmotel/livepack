/* --------------------
 * livepack module
 * Jest config
 * ------------------*/

'use strict';

// Imports
const babelPlugin = require('./babel.js');

// Exports

module.exports = {
	testEnvironment: 'node',
	coverageDirectory: 'coverage',
	collectCoverageFrom: ['index.js', 'lib/**/*.js'],
	setupFilesAfterEnv: ['jest-extended', 'jest-expect-arguments'],
	transform: {
		'\\.js$': ['babel-jest', {
			plugins: [babelPlugin],
			generatorOpts: {retainLines: true, compact: false}
		}]
	}
};
