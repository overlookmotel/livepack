/* --------------------
 * livepack module
 * Tests for primitives
 * ------------------*/

'use strict';

// Imports
const {expectSerializedEqual} = require('./support/index.js');

// Tests

describe('strings', () => {
	it('non-empty string', () => {
		expectSerializedEqual('abc', '"abc"');
	});

	it('empty string', () => {
		expectSerializedEqual('', '""');
	});
});

describe('booleans', () => {
	it('true', () => {
		expectSerializedEqual(true, 'true');
	});

	it('false', () => {
		expectSerializedEqual(false, 'false');
	});
});

describe('numbers', () => {
	it('positive integers', () => {
		expectSerializedEqual(1, '1');
		expectSerializedEqual(123, '123');
	});

	it('negative integers', () => {
		expectSerializedEqual(-1, '-1');
		expectSerializedEqual(-123, '-123');
	});

	it('zero', () => {
		expectSerializedEqual(0, '0');
	});

	it('minus zero', () => {
		expectSerializedEqual(-0, '-0');
	});

	it('positive floats', () => {
		expectSerializedEqual(0.1, '0.1');
		expectSerializedEqual(123.0001, '123.0001');
	});

	it('negative floats', () => {
		expectSerializedEqual(-0.1, '-0.1');
		expectSerializedEqual(-123.0001, '-123.0001');
	});

	it('infinity', () => {
		expectSerializedEqual(1 / 0, 'Infinity');
	});

	it('negative infinity', () => {
		expectSerializedEqual(-1 / 0, '-Infinity');
	});

	it('NaN', () => { // eslint-disable-line jest/lowercase-name
		expectSerializedEqual(undefined * 1, 'NaN');
	});
});

it('null', () => {
	expectSerializedEqual(null, 'null');
});

it('undefined', () => {
	expectSerializedEqual(undefined, 'void 0');
});
