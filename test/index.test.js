/* --------------------
 * livepack module
 * Tests
 * ------------------*/

'use strict';

// Modules
const livepack = require('livepack');

// Tests

describe('Package', () => {
	it('exports object', () => {
		expect(livepack).toBeObject();
	});

	it('exports serialize function', () => {
		expect(livepack.serialize).toBeFunction();
	});
});
