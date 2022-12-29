/* --------------------
 * livepack
 * Custom test sequencer
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	Sequencer = require('@jest/test-sequencer').default;

// Exports

const SPLIT_ASYNC_TEST_PATH = pathJoin(__dirname, '../splitAsync.test.js');

// Custom sequencer to ensure `splitAsync.test.js` runs last.
// Without this, random tests in other test files which run in same worker thread
// as `splitAsync.test.js` fail for mysterious reasons.
// https://github.com/overlookmotel/livepack/issues/470#issuecomment-1367032147
module.exports = class CustomSequencer extends Sequencer {
	sort(tests) {
		tests = super.sort(tests);
		return tests.sort((testA, testB) => {
			if (testA.path === SPLIT_ASYNC_TEST_PATH) return 1;
			if (testB.path === SPLIT_ASYNC_TEST_PATH) return -1;
			return 0;
		});
	}
};
