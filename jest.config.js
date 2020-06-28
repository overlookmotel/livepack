/* --------------------
 * livepack module
 * Jest config
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join;

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
			plugins: [
				[babelPlugin, {
					trackerPath: pathJoin(__dirname, 'tracker.js')
				}]
			],
			generatorOpts: {retainLines: true, compact: false}
		}]
	}
};
