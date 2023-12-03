/* --------------------
 * livepack module
 * Tests for Maps
 * ------------------*/

'use strict';

// Imports
const {itSerializes, itSerializesEqual} = require('./support/index.js');

// Tests

describe('Maps', () => {
	itSerializesEqual('no entries', {
		in: () => new Map(),
		out: 'new Map',
		validate(map) {
			expect(map).toBeInstanceOf(Map);
			expect(map.size).toBe(0);
		}
	});

	describe('no circular', () => {
		itSerializesEqual('no extra props', {
			in() {
				const extA = {extA: 1};
				return new Map([[extA, 1], [2, extA], [3, 4]]);
			},
			out: '(()=>{const a={extA:1};return new Map([[a,1],[2,a],[3,4]])})()',
			validate(map) {
				expect(map).toBeInstanceOf(Map);
				expect(map.size).toBe(3);
				const entries = [...map.entries()];
				expect(entries).toEqual([[{extA: 1}, 1], [2, {extA: 1}], [3, 4]]);
				expect(entries[1][1]).toBe(entries[0][0]);
			}
		});

		itSerializesEqual('with extra props', {
			in() {
				const map = new Map();
				map.x = 123;
				return map;
			},
			out: 'Object.assign(new Map,{x:123})',
			validate(map) {
				expect(map).toBeInstanceOf(Map);
				expect(map.size).toBe(0);
				expect(map.x).toBe(123);
			}
		});
	});

	describe('circular references', () => {
		itSerializesEqual('no extra props', {
			in() {
				const map = new Map([[1, 2]]);
				map.set(map, 3);
				map.set(4, map);
				map.set(5, 6);
				return map;
			},
			out: '(()=>{const a=new Map([[1,2]]);a.set(a,3);a.set(4,a);a.set(5,6);return a})()',
			validate(map) {
				expect(map).toBeInstanceOf(Map);
				expect(map.size).toBe(4);
				const entries = [...map.entries()];
				expect(entries).toEqual([[1, 2], [map, 3], [4, map], [5, 6]]);
				expect(entries[1][0]).toBe(map);
				expect(entries[2][1]).toBe(map);
			}
		});

		itSerializesEqual('with extra props', {
			in() {
				const map = new Map([[1, 2]]);
				map.set(map, 3);
				map.set(4, map);
				map.set(5, 6);
				map.x = map;
				return map;
			},
			out: '(()=>{const a=new Map([[1,2]]);a.set(a,3);a.set(4,a);a.set(5,6);a.x=a;return a})()',
			validate(map) {
				expect(map).toBeInstanceOf(Map);
				expect(map.size).toBe(4);
				const entries = [...map.entries()];
				expect(entries).toEqual([[1, 2], [map, 3], [4, map], [5, 6]]);
				expect(entries[1][0]).toBe(map);
				expect(entries[2][1]).toBe(map);
				expect(map.x).toBe(map);
			}
		});
	});

	describe('map subclass', () => {
		itSerializes('no entries', {
			in() {
				class M extends Map {}
				return new M();
			},
			out: `(()=>{
				const a=Map,
					b=Object.setPrototypeOf,
					c=b(class M extends class{}{},a).prototype;
				b(c,a.prototype);
				return b(new a,c)
			})()`,
			validate(map) {
				expect(map).toBeInstanceOf(Map);
				expect(map.size).toBe(0);
				const proto = Object.getPrototypeOf(map);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('M');
				expect(proto).toHavePrototype(Map.prototype);
			}
		});

		itSerializes('non-circular entries', {
			in() {
				class M extends Map {}
				return new M([[1, 2], [3, 4], [5, 6]]);
			},
			out: `(()=>{
				const a=Map,
					b=Object.setPrototypeOf,
					c=b(class M extends class{}{},a).prototype;
				b(c,a.prototype);
				return b(new a([[1,2],[3,4],[5,6]]),c)
			})()`,
			validate(map) {
				expect(map).toBeInstanceOf(Map);
				expect(map.size).toBe(3);
				expect([...map.entries()]).toEqual([[1, 2], [3, 4], [5, 6]]);
				const proto = Object.getPrototypeOf(map);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('M');
				expect(proto).toHavePrototype(Map.prototype);
			}
		});

		itSerializes('circular entries', {
			in() {
				class M extends Map {}
				const map = new M([[1, 2]]);
				map.set(map, 3);
				map.set(4, map);
				map.set(5, 6);
				return map;
			},
			out: `(()=>{
				const a=Map,
					b=Object.setPrototypeOf,
					c=b(class M extends class{}{},a).prototype,
					d=b(new a([[1,2]]),c);
				b(c,a.prototype);
				d.set(d,3);
				d.set(4,d);
				d.set(5,6);
				return d
			})()`,
			validate(map) {
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
		});
	});
});

describe('WeakMaps', () => {
	it('calling `WeakMap()` without `new` throws error', () => {
		expect(() => WeakMap()).toThrowWithMessage(
			TypeError, "Class constructor WeakMap cannot be invoked without 'new'"
		);
	});

	itSerializes('empty', {
		in: () => new WeakMap(),
		out: 'new WeakMap',
		validate: weakMap => expect(weakMap).toBeInstanceOf(WeakMap)
	});

	itSerializes('with non-circular contents', {
		in() {
			const x = {a: 1},
				xv = {aa: 11},
				y = {b: 2},
				yv = {bb: 22};
			return {key1: x, key2: y, weakMap: new WeakMap([[x, xv], [y, yv]])};
		},
		out: `(()=>{
			const a={a:1},b={b:2};
			return{
				key1:a,
				key2:b,
				weakMap:new WeakMap([
					[a,{aa:11}],
					[b,{bb:22}]
				])
			}
		})()`,
		validate(obj) {
			expect(obj).toBeObject();
			const {key1, key2, weakMap} = obj;
			expect(weakMap).toBeInstanceOf(WeakMap);
			expect(key1).toEqual({a: 1});
			expect(key2).toEqual({b: 2});
			expect(weakMap.get(key1)).toEqual({aa: 11});
			expect(weakMap.get(key2)).toEqual({bb: 22});
		}
	});

	itSerializes('with circular contents', {
		in() {
			const weak = new WeakMap();
			const x = {a: 1},
				y = {b: 2};
			weak.set(x, weak);
			weak.set(weak, y);
			return {obj1: x, obj2: y, weakMap: weak};
		},
		out: `(()=>{
			const a={a:1},
				b={b:2},
				c=new WeakMap;
			c.set(a,c);
			c.set(c,b);
			return{obj1:a,obj2:b,weakMap:c}
		})()`,
		validate(obj) {
			expect(obj).toBeObject();
			const {obj1, obj2, weakMap} = obj;
			expect(weakMap).toBeInstanceOf(WeakMap);
			expect(obj1).toEqual({a: 1});
			expect(obj2).toEqual({b: 2});
			expect(weakMap.get(obj1)).toBe(weakMap);
			expect(weakMap.get(weakMap)).toEqual(obj2);
		}
	});

	itSerializes('with circular contents followed by non-circular', {
		in() {
			const weak = new WeakMap();
			const x = {a: 1},
				y = {b: 2};
			weak.set(x, weak);
			weak.set(weak, y);
			weak.set(y, x);
			return {obj1: x, obj2: y, weakMap: weak};
		},
		out: `(()=>{
			const a={a:1},
				b={b:2},
				c=new WeakMap([[b,a]]);
			c.set(a,c);
			c.set(c,b);
			return{obj1:a,obj2:b,weakMap:c}
		})()`,
		validate({obj1, obj2, weakMap}) {
			expect(weakMap).toBeInstanceOf(WeakMap);
			expect(obj1).toEqual({a: 1});
			expect(obj2).toEqual({b: 2});
			expect(weakMap.get(obj1)).toBe(weakMap);
			expect(weakMap.get(weakMap)).toEqual(obj2);
			expect(weakMap.get(obj2)).toEqual(obj1);
		}
	});
});
