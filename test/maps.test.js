/* --------------------
 * livepack module
 * Tests for Maps
 * ------------------*/

'use strict';

// Modules
const parseNodeVersion = require('parse-node-version');

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Maps', ({expectSerializedEqual, run}) => {
	it('no entries', () => {
		expectSerializedEqual(new Map(), 'new Map', (map) => {
			expect(map).toBeInstanceOf(Map);
			expect(map.size).toBe(0);
		});
	});

	describe('no circular', () => {
		it('no extra props', () => {
			const extA = {extA: 1};
			const input = new Map([[extA, 1], [2, extA], [3, 4]]);

			expectSerializedEqual(input, null, (map) => {
				expect(map).toBeInstanceOf(Map);
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
				expect(map).toBeInstanceOf(Map);
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
					expect(map).toBeInstanceOf(Map);
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
					expect(map).toBeInstanceOf(Map);
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
					expect(map).toBeInstanceOf(Map);
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
					expect(map).toBeInstanceOf(Map);
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
					expect(map).toBeInstanceOf(Map);
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

const describeWithAllOptionsIfNode14 = parseNodeVersion(process.version).major >= 14
	? describeWithAllOptions
	: describeWithAllOptions.skip;

describeWithAllOptionsIfNode14('WeakMaps', ({run}) => {
	it('empty', () => {
		run(
			new WeakMap(),
			'new WeakMap',
			(weakMap) => {
				expect(weakMap).toBeInstanceOf(WeakMap);
			}
		);
	});

	it('with non-circular contents', () => {
		const x = {a: 1},
			xv = {aa: 11},
			y = {b: 2},
			yv = {bb: 22};
		const input = {key1: x, key2: y, weakMap: new WeakMap([[x, xv], [y, yv]])};

		run(
			input,
			'(()=>{const a={a:1},b={b:2};return{key1:a,key2:b,weakMap:new WeakMap([[a,{aa:11}],[b,{bb:22}]])}})()',
			(obj) => {
				expect(obj).toBeObject();
				const {key1, key2, weakMap} = obj;
				expect(weakMap).toBeInstanceOf(WeakMap);
				expect(key1).toEqual({a: 1});
				expect(key2).toEqual({b: 2});
				expect(weakMap.get(key1)).toEqual({aa: 11});
				expect(weakMap.get(key2)).toEqual({bb: 22});
			}
		);
	});

	it('with circular contents', () => {
		const weak = new WeakMap();
		const x = {a: 1},
			y = {b: 2};
		weak.set(x, weak);
		weak.set(weak, y);
		const input = {obj1: x, obj2: y, weakMap: weak};

		run(
			input,
			'(()=>{const a={a:1},b={b:2},c=new WeakMap;c.set(a,c);c.set(c,b);return{obj1:a,obj2:b,weakMap:c}})()',
			(obj) => {
				expect(obj).toBeObject();
				const {obj1, obj2, weakMap} = obj;
				expect(weakMap).toBeInstanceOf(WeakMap);
				expect(obj1).toEqual({a: 1});
				expect(obj2).toEqual({b: 2});
				expect(weakMap.get(obj1)).toBe(weakMap);
				expect(weakMap.get(weakMap)).toEqual(obj2);
			}
		);
	});
});
