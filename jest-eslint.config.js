/* --------------------
 * livepack module
 * Jest ESLint runner config
 * ------------------*/

'use strict';

// Exports

module.exports = {
	testEnvironment: 'node',
	runner: 'jest-runner-eslint',
	testMatch: ['<rootDir>/**/*.(js|cjs|mjs|jsx)'],
	// Jest by default uses a number of workers equal to number of CPU cores minus 1.
	// Github Actions runners provide 2 cores and running with 2 workers is faster than 1.
	...(process.env.CI && {maxWorkers: '100%'})
};
