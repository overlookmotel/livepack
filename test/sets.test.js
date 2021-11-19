/* --------------------
 * livepack module
 * Tests for Sets
 * ------------------*/

'use strict';

// Modules
const parseNodeVersion = require('parse-node-version');

// Imports
const {itSerializes, itSerializesEqual} = require('./support/index.js');

// Tests

describe('Sets', () => {
	itSerializesEqual('no entries', {
		in: () => new Set(),
		out: 'new Set',
		validate(set) {
			expect(set).toBeInstanceOf(Set);
			expect(set.size).toBe(0);
		}
	});

	describe('no circular', () => {
		itSerializesEqual('no extra props', {
			in() {
				const extA = {extA: 1};
				return new Set([extA, {extA}, 1, 2]);
			},
			out: '(()=>{const a={extA:1};return new Set([a,{extA:a},1,2])})()',
			validate(set) {
				expect(set).toBeInstanceOf(Set);
				expect(set.size).toBe(4);
				const values = [...set.values()];
				expect(values).toEqual([{extA: 1}, {extA: {extA: 1}}, 1, 2]);
				expect(values[1].extA).toBe(values[0]);
			}
		});

		itSerializesEqual('with extra props', {
			in() {
				const set = new Set();
				set.x = 123;
				return set;
			},
			out: 'Object.assign(new Set,{x:123})',
			validate(set) {
				expect(set).toBeInstanceOf(Set);
				expect(set.size).toBe(0);
				expect(set.x).toBe(123);
			}
		});
	});

	describe('circular references', () => {
		itSerializesEqual('no extra props', {
			in() {
				const set = new Set([1]);
				set.add(set);
				set.add(2);
				return set;
			},
			out: '(()=>{const a=new Set([1]);a.add(a);a.add(2);return a})()',
			validate(set) {
				expect(set).toBeInstanceOf(Set);
				expect(set.size).toBe(3);
				const values = [...set.values()];
				expect(values).toEqual([1, set, 2]);
				expect(values[1]).toBe(set);
			}
		});

		itSerializesEqual('with extra props', {
			in() {
				const set = new Set([1]);
				set.add(set);
				set.add(2);
				set.x = set;
				return set;
			},
			out: '(()=>{const a=new Set([1]);a.add(a);a.add(2);a.x=a;return a})()',
			validate(set) {
				expect(set).toBeInstanceOf(Set);
				expect(set.size).toBe(3);
				const values = [...set.values()];
				expect(values).toEqual([1, set, 2]);
				expect(values[1]).toBe(set);
				expect(set.x).toBe(set);
			}
		});
	});

	describe('set subclass', () => {
		itSerializes('no entries', {
			in() {
				class S extends Set {}
				return new S();
			},
			out: `(()=>{
				const a=Set,
					b=Object.setPrototypeOf,
					c=(b=>b=class S{
						constructor(...a){
							return Reflect.construct(Object.getPrototypeOf(b),a,b)
						}
					})(),
					d=c.prototype;
				b(c,a);
				b(d,a.prototype);
				return b(new a,d)
			})()`,
			validate(set) {
				expect(set).toBeInstanceOf(Set);
				expect(set.size).toBe(0);
				const proto = Object.getPrototypeOf(set);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('S');
				expect(proto).toHavePrototype(Set.prototype);
			}
		});

		itSerializes('non-circular entries', {
			in() {
				class S extends Set {}
				return new S([1, 2, 3]);
			},
			out: `(()=>{
				const a=Set,
					b=Object.setPrototypeOf,
					c=(b=>b=class S{
						constructor(...a){
							return Reflect.construct(Object.getPrototypeOf(b),a,b)
						}
					})(),
					d=c.prototype;
				b(c,a);
				b(d,a.prototype);
				return b(new a([1,2,3]),d)
			})()`,
			validate(set) {
				expect(set).toBeInstanceOf(Set);
				expect(set.size).toBe(3);
				expect([...set.values()]).toEqual([1, 2, 3]);
				const proto = Object.getPrototypeOf(set);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('S');
				expect(proto).toHavePrototype(Set.prototype);
			}
		});

		itSerializes('circular entries', {
			in() {
				class S extends Set {}
				const set = new S([1]);
				set.add(set);
				set.add(2);
				return set;
			},
			out: `(()=>{
				const a=Set,
					b=Object.setPrototypeOf,
					c=(b=>b=class S{
						constructor(...a){
							return Reflect.construct(Object.getPrototypeOf(b),a,b)
						}
					})(),
					d=c.prototype,
					e=b(new a([1]),d);
				b(c,a);
				b(d,a.prototype);
				e.add(e);
				e.add(2);
				return e
			})()`,
			validate(set) {
				expect(set).toBeInstanceOf(Set);
				expect(set.size).toBe(3);
				const values = [...set.values()];
				expect(values[0]).toBe(1);
				expect(values[1]).toBe(set);
				expect(values[2]).toBe(2);
				const proto = Object.getPrototypeOf(set);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('S');
				expect(proto).toHavePrototype(Set.prototype);
			}
		});
	});
});

const describeIfNode14 = parseNodeVersion(process.version).major >= 14 ? describe : describe.skip;

describeIfNode14('WeakSets', () => {
	itSerializes('empty', {
		in: () => new WeakSet(),
		out: 'new WeakSet',
		validate: weakSet => expect(weakSet).toBeInstanceOf(WeakSet)
	});

	itSerializes('with non-circular contents', {
		in() {
			const x = {a: 1},
				y = {b: 2};
			return {obj1: x, obj2: y, weakSet: new WeakSet([x, y])};
		},
		out: `(()=>{
			const a={a:1},
				b={b:2};
			return{obj1:a,obj2:b,weakSet:new WeakSet([a,b])}
		})()`,
		validate(obj) {
			expect(obj).toBeObject();
			const {obj1, obj2, weakSet} = obj;
			expect(weakSet).toBeInstanceOf(WeakSet);
			expect(obj1).toEqual({a: 1});
			expect(obj2).toEqual({b: 2});
			expect(weakSet.has(obj1)).toBeTrue();
			expect(weakSet.has(obj2)).toBeTrue();
		}
	});

	itSerializes('with circular contents', {
		in() {
			const weakSet = new WeakSet();
			weakSet.add(weakSet);
			return weakSet;
		},
		out: '(()=>{const a=new WeakSet;a.add(a);return a})()',
		validate(weakSet) {
			expect(weakSet).toBeInstanceOf(WeakSet);
			expect(weakSet.has(weakSet)).toBeTrue();
		}
	});
});
