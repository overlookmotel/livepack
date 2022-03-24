/* --------------------
 * livepack module
 * Tests for primitives
 * ------------------*/

'use strict';

// Imports
const {itSerializesEqual} = require('./support/index.js');

// Tests

describe('Strings', () => {
	itSerializesEqual('non-empty string', {in: () => 'abc', out: '"abc"'});
	itSerializesEqual('empty string', {in: () => '', out: '""'});
});

describe('booleans', () => {
	itSerializesEqual('true', {in: () => true, out: 'true'});
	itSerializesEqual('false', {in: () => false, out: 'false'});
});

describe('numbers', () => {
	describe('positive integers', () => {
		itSerializesEqual('1', {in: () => 1, out: '1'});
		itSerializesEqual('123', {in: () => 123, out: '123'});
	});

	describe('negative integers', () => {
		itSerializesEqual('-1', {in: () => -1, out: '-1'});
		itSerializesEqual('-123', {in: () => -123, out: '-123'});
	});

	itSerializesEqual('zero', {
		in: () => 0,
		out: '0',
		validate(zero) {
			expect(Object.is(zero, 0)).toBeTrue();
		}
	});

	itSerializesEqual('minus zero', {
		in: () => -0,
		out: '-0',
		validate(minusZero) {
			expect(Object.is(minusZero, -0)).toBeTrue();
		}
	});

	describe('positive floats', () => {
		itSerializesEqual('0.1', {in: () => 0.1, out: '0.1'});
		itSerializesEqual('123.0001', {in: () => 123.0001, out: '123.0001'});
	});

	describe('negative floats', () => {
		itSerializesEqual('-0.1', {in: () => -0.1, out: '-0.1'});
		itSerializesEqual('-123.0001', {in: () => -123.0001, out: '-123.0001'});
	});

	describe('Infinity', () => { // eslint-disable-line jest/prefer-lowercase-title
		itSerializesEqual('serializes correctly', {in: () => 1 / 0, out: 'Infinity'});

		itSerializesEqual('treated as a global var', {
			in: () => ({x: 1 / 0, y: 1 / 0}),
			out: '(()=>{const a=Infinity;return{x:a,y:a}})()'
		});
	});

	describe('negative Infinity', () => {
		itSerializesEqual('serializes correctly', {in: () => -1 / 0, out: '-Infinity'});

		itSerializesEqual('treated as a global var', {
			in: () => ({x: -1 / 0, y: -1 / 0, z: 1 / 0}),
			out: '(()=>{const a=Infinity,b=-a;return{x:b,y:b,z:a}})()'
		});
	});

	describe('NaN', () => { // eslint-disable-line jest/prefer-lowercase-title
		itSerializesEqual('serializes correctly', {in: () => undefined * 1, out: 'NaN'});

		itSerializesEqual('treated as a global var', {
			in: () => ({x: undefined * 1, y: undefined * 1}),
			out: '(()=>{const a=NaN;return{x:a,y:a}})()'
		});
	});
});

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

itSerializesEqual('null', {in: () => null, out: 'null'});

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
