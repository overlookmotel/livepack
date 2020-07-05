/* --------------------
 * livepack module
 * Tests for Sets
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Sets', ({expectSerializedEqual}) => {
	it('no entries', () => {
		expectSerializedEqual(new Set(), 'new Set', (set) => {
			expectToBeSet(set);
			expect(set.size).toBe(0);
		});
	});

	describe('no circular', () => {
		it('no extra props', () => {
			const extA = {extA: 1};
			const input = new Set([extA, {extA}, 1, 2]);

			expectSerializedEqual(input, null, (set) => {
				expectToBeSet(set);
				expect(set.size).toBe(4);
				const values = [...set.values()];
				expect(values).toEqual([extA, {extA}, 1, 2]);
				expect(values[1].extA).toBe(values[0]);
			});
		});

		it('with extra props', () => {
			const input = new Set();
			input.x = 123;

			expectSerializedEqual(input, 'Object.assign(new Set,{x:123})', (set) => {
				expectToBeSet(set);
				expect(set.size).toBe(0);
				expect(set.x).toBe(123);
			});
		});
	});

	describe('circular references', () => {
		it('no extra props', () => {
			const input = new Set([1]);
			input.add(input);
			input.add(2);

			expectSerializedEqual(
				input,
				'(()=>{const a=new Set([1]);a.add(a);a.add(2);return a})()',
				(set) => {
					expectToBeSet(set);
					expect(set.size).toBe(3);
					const values = [...set.values()];
					expect(values).toEqual([1, set, 2]);
					expect(values[1]).toBe(set);
				}
			);
		});

		it('with extra props', () => {
			const input = new Set([1]);
			input.add(input);
			input.add(2);
			input.x = input;

			expectSerializedEqual(
				input,
				'(()=>{const a=new Set([1]);a.add(a);a.add(2);a.x=a;return a})()',
				(set) => {
					expectToBeSet(set);
					expect(set.size).toBe(3);
					const values = [...set.values()];
					expect(values).toEqual([1, set, 2]);
					expect(values[1]).toBe(set);
					expect(set.x).toBe(set);
				}
			);
		});
	});
});

function expectToBeSet(val) {
	expect(Object.getPrototypeOf(val)).toBe(Set.prototype);
}
