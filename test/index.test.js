/* --------------------
 * livepack module
 * Tests
 * ------------------*/

'use strict';

// Modules
const serialize = require('livepack');

// Tests

describe('package', () => {
	it('exports serialize function', () => {
		expect(serialize).toBeFunction();
	});
});
