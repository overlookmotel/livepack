/* --------------------
 * livepack module
 * Tests
 * ------------------*/

'use strict';

// Modules
const serialize = require('livepack');

// Tests

describe('Package', () => {
	it('exports serialize function', () => {
		expect(serialize).toBeFunction();
	});
});
