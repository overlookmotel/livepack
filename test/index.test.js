/* --------------------
 * livepack module
 * Tests
 * ------------------*/

'use strict';

// Modules
const livepack = require('livepack');

// Init
require('./support/index.js');

// Tests

describe('tests', () => {
	it.skip('all', () => { // eslint-disable-line jest/no-disabled-tests
		expect(livepack).not.toBeUndefined();
	});
});
