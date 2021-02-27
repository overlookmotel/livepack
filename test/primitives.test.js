/* --------------------
 * livepack module
 * Tests for primitives
 * ------------------*/

'use strict';

// Imports
const {itSerializesEqual} = require('./support/index.js');

// Tests

describe('Strings', () => {
	itSerializesEqual('non-empty string', () => 'abc', '"abc"');
	itSerializesEqual('empty string', () => '', '""');
});

describe('booleans', () => {
	itSerializesEqual('true', () => true, 'true');
	itSerializesEqual('false', () => false, 'false');
});

describe('numbers', () => {
	describe('positive integers', () => {
		itSerializesEqual('1', () => 1, '1');
		itSerializesEqual('123', () => 123, '123');
	});

	describe('negative integers', () => {
		itSerializesEqual('-1', () => -1, '-1');
		itSerializesEqual('-123', () => -123, '-123');
	});

	itSerializesEqual('zero', () => 0, '0');

	itSerializesEqual('minus zero', () => -0, '-0');

	describe('positive floats', () => {
		itSerializesEqual('0.1', () => 0.1, '0.1');
		itSerializesEqual('123.0001', () => 123.0001, '123.0001');
	});

	describe('negative floats', () => {
		itSerializesEqual('0.1', () => -0.1, '-0.1');
		itSerializesEqual('-123.0001', () => -123.0001, '-123.0001');
	});

	describe('infinity', () => {
		itSerializesEqual('serializes correctly', () => 1 / 0, 'Infinity');

		itSerializesEqual('treated as a global var', {
			in: () => ({x: 1 / 0, y: 1 / 0}),
			out: '(()=>{const a=Infinity;return{x:a,y:a}})()'
		});
	});

	describe('negative Infinity', () => {
		itSerializesEqual('serializes correctly', () => -1 / 0, '-Infinity');

		itSerializesEqual('treated as a global var', {
			in: () => ({x: -1 / 0, y: -1 / 0}),
			out: '(()=>{const a=-Infinity;return{x:a,y:a}})()'
		});
	});

	describe('NaN', () => { // eslint-disable-line jest/lowercase-name
		itSerializesEqual('serializes correctly', () => undefined * 1, 'NaN');

		itSerializesEqual('treated as a global var', {
			in: () => ({x: undefined * 1, y: undefined * 1}),
			out: '(()=>{const a=NaN;return{x:a,y:a}})()'
		});
	});
});

/* eslint-disable node/no-unsupported-features/es-builtins */
describe('BigInts', () => {
	itSerializesEqual('zero', {
		in: () => BigInt(0),
		out: '0n',
		validate: bigInt => expect(bigInt).toBe(BigInt(0))
	});

	itSerializesEqual('small', {
		in: () => BigInt(100),
		out: '100n',
		validate: bigInt => expect(bigInt).toBe(BigInt(100))
	});

	itSerializesEqual('negative', {
		in: () => BigInt(-100),
		out: '-100n',
		validate: bigInt => expect(bigInt).toBe(BigInt(-100))
	});

	itSerializesEqual('huge', {
		in: () => BigInt('100000000000000000000'),
		out: '100000000000000000000n',
		validate: bigInt => expect(bigInt).toBe(BigInt('100000000000000000000'))
	});
});
/* eslint-enable node/no-unsupported-features/es-builtins */

itSerializesEqual('null', () => null, 'null');

describe('undefined', () => {
	itSerializesEqual('serializes as `void 0`', {
		in: () => undefined,
		out: 'void 0',
		validate: undef => expect(undef).toBeUndefined()
	});

	itSerializesEqual('is de-duplicated if used multiple times', {
		in: () => ({x: undefined, y: undefined}),
		out: '(()=>{const a=void 0;return{x:a,y:a}})()',
		validate(obj) {
			expect(obj.x).toBeUndefined();
			expect(obj.y).toBeUndefined();
		}
	});
});
