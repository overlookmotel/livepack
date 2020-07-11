/* --------------------
 * livepack module
 * Tests for Maps
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Maps', ({expectSerializedEqual}) => {
	it('no entries', () => {
		expectSerializedEqual(new Map(), 'new Map', (map) => {
			expectToBeMap(map);
			expect(map.size).toBe(0);
		});
	});

	describe('no circular', () => {
		it('no extra props', () => {
			const extA = {extA: 1};
			const input = new Map([[extA, 1], [2, extA], [3, 4]]);

			expectSerializedEqual(input, null, (map) => {
				expectToBeMap(map);
				expect(map.size).toBe(3);
				const entries = [...map.entries()];
				expect(entries).toEqual([[extA, 1], [2, extA], [3, 4]]);
				expect(entries[1][1]).toBe(entries[0][0]);
			});
		});

		it('with extra props', () => {
			const input = new Map();
			input.x = 123;

			expectSerializedEqual(input, 'Object.assign(new Map,{x:123})', (map) => {
				expectToBeMap(map);
				expect(map.size).toBe(0);
				expect(map.x).toBe(123);
			});
		});
	});

	describe('circular references', () => {
		it('no extra props', () => {
			const input = new Map([[1, 2]]);
			input.set(input, 3);
			input.set(4, input);
			input.set(5, 6);

			expectSerializedEqual(
				input,
				'(()=>{const a=new Map([[1,2]]);a.set(a,3);a.set(4,a);a.set(5,6);return a})()',
				(map) => {
					expectToBeMap(map);
					expect(map.size).toBe(4);
					const entries = [...map.entries()];
					expect(entries).toEqual([[1, 2], [map, 3], [4, map], [5, 6]]);
					expect(entries[1][0]).toBe(map);
					expect(entries[2][1]).toBe(map);
				}
			);
		});

		it('with extra props', () => {
			const input = new Map([[1, 2]]);
			input.set(input, 3);
			input.set(4, input);
			input.set(5, 6);
			input.x = input;

			expectSerializedEqual(
				input,
				'(()=>{const a=new Map([[1,2]]);a.set(a,3);a.set(4,a);a.set(5,6);a.x=a;return a})()',
				(map) => {
					expectToBeMap(map);
					expect(map.size).toBe(4);
					const entries = [...map.entries()];
					expect(entries).toEqual([[1, 2], [map, 3], [4, map], [5, 6]]);
					expect(entries[1][0]).toBe(map);
					expect(entries[2][1]).toBe(map);
					expect(map.x).toBe(map);
				}
			);
		});
	});
});

function expectToBeMap(val) {
	expect(val).toHavePrototype(Map.prototype);
}
