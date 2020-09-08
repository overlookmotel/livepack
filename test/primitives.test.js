/* --------------------
 * livepack module
 * Tests for primitives
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions, itWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Strings', ({expectSerializedEqual}) => {
	it('non-empty string', () => {
		expectSerializedEqual('abc', '"abc"');
	});

	it('empty string', () => {
		expectSerializedEqual('', '""');
	});
});

describeWithAllOptions('Booleans', ({expectSerializedEqual}) => {
	it('true', () => {
		expectSerializedEqual(true, 'true');
	});

	it('false', () => {
		expectSerializedEqual(false, 'false');
	});
});

describeWithAllOptions('Numbers', ({expectSerializedEqual}) => {
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

	describe('Infinity', () => {
		it('serializes correctly', () => {
			expectSerializedEqual(1 / 0, 'Infinity');
		});

		it('treated as a global var', () => {
			expectSerializedEqual(
				{Infinity: 1 / 0, y: 1 / 0},
				'(()=>{const a=Infinity;return{Infinity:a,y:a}})()'
			);
		});
	});

	describe('negative Infinity', () => {
		it('serializes correctly', () => {
			expectSerializedEqual(-1 / 0, '-Infinity');
		});

		it('treated as a global var', () => {
			expectSerializedEqual(
				{minusInfinity: -1 / 0, y: -1 / 0},
				'(()=>{const a=-Infinity;return{minusInfinity:a,y:a}})()'
			);
		});
	});

	describe('NaN', () => {
		it('serializes correctly', () => {
			expectSerializedEqual(undefined * 1, 'NaN');
		});

		it('treated as a global var', () => {
			expectSerializedEqual(
				{x: undefined * 1, y: undefined * 1},
				'(()=>{const a=NaN;return{x:a,y:a}})()'
			);
		});
	});
});

/* eslint-disable node/no-unsupported-features/es-builtins */
describeWithAllOptions('BigInts', ({expectSerializedEqual}) => {
	it('zero', () => { // eslint-disable-line jest/no-identical-title
		expectSerializedEqual(BigInt(0), '0n', bigInt => expect(bigInt).toBe(BigInt(0)));
	});

	it('small', () => {
		expectSerializedEqual(BigInt(100), '100n', bigInt => expect(bigInt).toBe(BigInt(100)));
	});

	it('negative', () => {
		expectSerializedEqual(BigInt(-100), '-100n', bigInt => expect(bigInt).toBe(BigInt(-100)));
	});

	it('huge', () => {
		expectSerializedEqual(
			BigInt('100000000000000000000'),
			'100000000000000000000n',
			bigInt => expect(bigInt).toBe(BigInt('100000000000000000000'))
		);
	});
});
/* eslint-enable node/no-unsupported-features/es-builtins */

itWithAllOptions('null', ({expectSerializedEqual}) => {
	expectSerializedEqual(null, 'null');
});

describeWithAllOptions('undefined', ({expectSerializedEqual}) => {
	it('serializes as `void 0`', () => {
		expectSerializedEqual(undefined, 'void 0', undef => expect(undef).toBeUndefined());
	});

	it('is de-duplicated if used multiple times', () => {
		expectSerializedEqual(
			{x: undefined, y: undefined},
			'(()=>{const a=void 0;return{x:a,y:a}})()',
			(obj) => {
				expect(obj.x).toBeUndefined();
				expect(obj.y).toBeUndefined();
			}
		);
	});
});
