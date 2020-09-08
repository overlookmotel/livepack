/* --------------------
 * livepack module
 * Tests for Sets
 * ------------------*/

'use strict';

// Modules
const parseNodeVersion = require('parse-node-version');

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Sets', ({expectSerializedEqual, run}) => {
	it('no entries', () => {
		expectSerializedEqual(new Set(), 'new Set', (set) => {
			expect(set).toBeInstanceOf(Set);
			expect(set.size).toBe(0);
		});
	});

	describe('no circular', () => {
		it('no extra props', () => {
			const extA = {extA: 1};
			const input = new Set([extA, {extA}, 1, 2]);

			expectSerializedEqual(input, null, (set) => {
				expect(set).toBeInstanceOf(Set);
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
				expect(set).toBeInstanceOf(Set);
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
					expect(set).toBeInstanceOf(Set);
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
					expect(set).toBeInstanceOf(Set);
					expect(set.size).toBe(3);
					const values = [...set.values()];
					expect(values).toEqual([1, set, 2]);
					expect(values[1]).toBe(set);
					expect(set.x).toBe(set);
				}
			);
		});
	});

	describe('Set subclass', () => {
		it('no entries', () => {
			class S extends Set {}
			run(
				new S(),
				'(()=>{const a=Set,b=Object.setPrototypeOf,c=b(class S{constructor(...a){return Reflect.construct(Object.getPrototypeOf(S),a,S)}},a).prototype;b(c,a.prototype);return b(new a,c)})()',
				(set) => {
					expect(set).toBeInstanceOf(Set);
					expect(set.size).toBe(0);
					const proto = Object.getPrototypeOf(set);
					expect(proto.constructor).toBeFunction();
					expect(proto.constructor.name).toBe('S');
					expect(proto).toHavePrototype(Set.prototype);
				}
			);
		});

		it('non-circular entries', () => {
			class S extends Set {}
			run(
				new S([1, 2, 3]),
				'(()=>{const a=Set,b=Object.setPrototypeOf,c=b(class S{constructor(...a){return Reflect.construct(Object.getPrototypeOf(S),a,S)}},a).prototype;b(c,a.prototype);return b(new a([1,2,3]),c)})()',
				(set) => {
					expect(set).toBeInstanceOf(Set);
					expect(set.size).toBe(3);
					expect([...set.values()]).toEqual([1, 2, 3]);
					const proto = Object.getPrototypeOf(set);
					expect(proto.constructor).toBeFunction();
					expect(proto.constructor.name).toBe('S');
					expect(proto).toHavePrototype(Set.prototype);
				}
			);
		});

		it('circular entries', () => {
			class S extends Set {}
			const input = new S([1]);
			input.add(input);
			input.add(2);

			run(
				input,
				'(()=>{const a=Set,b=Object.setPrototypeOf,c=b(class S{constructor(...a){return Reflect.construct(Object.getPrototypeOf(S),a,S)}},a).prototype,d=b(new a([1]),c);b(c,a.prototype);d.add(d);d.add(2);return d})()',
				(set) => {
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
			);
		});
	});
});

const describeWithAllOptionsIfNode14 = parseNodeVersion(process.version).major >= 14
	? describeWithAllOptions
	: describeWithAllOptions.skip;

describeWithAllOptionsIfNode14('WeakSets', ({run}) => {
	it('empty', () => {
		run(
			new WeakSet(),
			'new WeakSet',
			(weakSet) => {
				expect(weakSet).toBeInstanceOf(WeakSet);
			}
		);
	});

	it('with non-circular contents', () => {
		const x = {a: 1},
			y = {b: 2};
		const input = {obj1: x, obj2: y, weakSet: new WeakSet([x, y])};

		run(
			input,
			'(()=>{const a={a:1},b={b:2};return{obj1:a,obj2:b,weakSet:new WeakSet([a,b])}})()',
			(obj) => {
				expect(obj).toBeObject();
				const {obj1, obj2, weakSet} = obj;
				expect(weakSet).toBeInstanceOf(WeakSet);
				expect(obj1).toEqual({a: 1});
				expect(obj2).toEqual({b: 2});
				expect(weakSet.has(obj1)).toBeTrue();
				expect(weakSet.has(obj2)).toBeTrue();
			}
		);
	});

	it('with circular contents', () => {
		const input = new WeakSet();
		input.add(input);

		run(
			input,
			'(()=>{const a=new WeakSet;a.add(a);return a})()',
			(weakSet) => {
				expect(weakSet).toBeInstanceOf(WeakSet);
				expect(weakSet.has(weakSet)).toBeTrue();
			}
		);
	});
});
