/* --------------------
 * livepack module
 * Tests for other built-ins
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('RegExps', ({expectSerializedEqual}) => {
	it('with no flags', () => {
		expectSerializedEqual(/^foo$/, '/^foo$/', expectToBeRegex);
	});

	it('with flags', () => {
		expectSerializedEqual(/^foo$/gu, '/^foo$/gu', expectToBeRegex);
	});

	it('with escaped chars', () => {
		expectSerializedEqual(/^(foo)\.bar\/qu[xy]$/, '/^(foo)\\.bar\\/qu[xy]$/', expectToBeRegex);
	});

	it('with extra props', () => {
		const input = /^foo$/;
		input.x = 'bar';
		expectSerializedEqual(input, null, (regex) => {
			expectToBeRegex(regex);
			expect(regex.x).toBe('bar');
		});
	});
});

function expectToBeRegex(val) {
	expect(Object.getPrototypeOf(val)).toBe(RegExp.prototype);
}
