/* --------------------
 * livepack module
 * Tests for Maps
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Maps', ({expectSerializedEqual, run}) => {
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

	describe('Map subclass', () => {
		it('no entries', () => {
			class M extends Map {}
			run(
				new M(),
				'(()=>{const a=Map,b=Object.setPrototypeOf,c=b(class M{constructor(...a){return Reflect.construct(Object.getPrototypeOf(M),a,M)}},a).prototype;b(c,a.prototype);return b(new a,c)})()',
				(map) => {
					expectToBeMap(map);
					expect(map.size).toBe(0);
					const proto = Object.getPrototypeOf(map);
					expect(proto.constructor).toBeFunction();
					expect(proto.constructor.name).toBe('M');
					expect(proto).toHavePrototype(Map.prototype);
				}
			);
		});

		it('non-circular entries', () => {
			class M extends Map {}
			run(
				new M([[1, 2], [3, 4], [5, 6]]),
				'(()=>{const a=Map,b=Object.setPrototypeOf,c=b(class M{constructor(...a){return Reflect.construct(Object.getPrototypeOf(M),a,M)}},a).prototype;b(c,a.prototype);return b(new a([[1,2],[3,4],[5,6]]),c)})()',
				(map) => {
					expectToBeMap(map);
					expect(map.size).toBe(3);
					expect([...map.entries()]).toEqual([[1, 2], [3, 4], [5, 6]]);
					const proto = Object.getPrototypeOf(map);
					expect(proto.constructor).toBeFunction();
					expect(proto.constructor.name).toBe('M');
					expect(proto).toHavePrototype(Map.prototype);
				}
			);
		});

		it('circular entries', () => {
			class M extends Map {}
			const input = new M([[1, 2]]);
			input.set(input, 3);
			input.set(4, input);
			input.set(5, 6);

			run(
				input,
				'(()=>{const a=Map,b=Object.setPrototypeOf,c=b(class M{constructor(...a){return Reflect.construct(Object.getPrototypeOf(M),a,M)}},a).prototype,d=b(new a([[1,2]]),c);b(c,a.prototype);d.set(d,3);d.set(4,d);d.set(5,6);return d})()',
				(map) => {
					expectToBeMap(map);
					expect(map.size).toBe(4);
					const entries = [...map.entries()];
					expect(entries[0]).toEqual([1, 2]);
					expect(entries[1][0]).toBe(map);
					expect(entries[1][1]).toBe(3);
					expect(entries[2][0]).toBe(4);
					expect(entries[2][1]).toBe(map);
					expect(entries[3]).toEqual([5, 6]);
					const proto = Object.getPrototypeOf(map);
					expect(proto.constructor).toBeFunction();
					expect(proto.constructor.name).toBe('M');
					expect(proto).toHavePrototype(Map.prototype);
				}
			);
		});
	});
});

function expectToBeMap(val) {
	expect(val).toBeInstanceOf(Map);
}
