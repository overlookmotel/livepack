/* --------------------
 * livepack module
 * Tests for other built-ins
 * ------------------*/

/* eslint-disable jest/no-identical-title */

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

describeWithAllOptions('Dates', ({expectSerializedEqual}) => {
	it('without extra props', () => {
		const input = new Date('01/01/2020 12:00:00');
		expectSerializedEqual(input, 'new Date(1577880000000)', (date) => {
			expect(date).toBeValidDate();
		});
	});

	it('with extra props', () => {
		const input = new Date('01/01/2020 12:00:00');
		input.x = 'bar';
		expectSerializedEqual(input, 'Object.assign(new Date(1577880000000),{x:"bar"})', (date) => {
			expect(date).toBeValidDate();
			expect(date.x).toBe('bar');
		});
	});
});
