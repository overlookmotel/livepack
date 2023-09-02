/* --------------------
 * livepack
 * Custom test sequencer for Jest ESLint
 * ------------------*/

'use strict';

// Modules
const fs = require('fs'),
	Sequencer = require('@jest/test-sequencer').default;

// Exports

// Custom sequencer to ensure the largest files are run first.
// `jest-runner-eslint` doesn't seem to sequence automatically.
// https://github.com/jest-community/jest-runner-eslint/issues/204
// TODO: Remove this workaround once above issue is fixed.

module.exports = class CustomSequencer extends Sequencer {
	sort(tests) {
		tests = super.sort(tests);
		const testsWithFileSizes = tests.map(test => ({test, size: fs.statSync(test.path).size}));
		testsWithFileSizes.sort((t1, t2) => (t1.size > t2.size ? -1 : t1.size < t2.size ? 1 : 0));
		return testsWithFileSizes.map(({test}) => test);
	}
};
