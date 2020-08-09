/* --------------------
 * livepack module
 * Tests for objects
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Objects', ({expectSerializedEqual, run}) => {
	it('empty object', () => {
		expectSerializedEqual({}, '({})');
	});

	describe('properties', () => {
		it('one property', () => {
			expectSerializedEqual({a: 1}, '({a:1})');
		});

		it('multiple properties', () => {
			expectSerializedEqual({a: 1, b: 2, c: 3}, '({a:1,b:2,c:3})');
		});

		it('properties with names which are not valid identifiers', () => {
			expectSerializedEqual({'b-c': {'0a': 1, 'd.e': 2}}, '({"b-c":{"0a":1,"d.e":2}})');
		});

		it('numeric property keys', () => {
			expectSerializedEqual({0: {1: 1, 23: 2, '04': 3}}, '({0:{1:1,23:2,"04":3}})');
		});

		it('properties with names which are JS reserved words', () => {
			// This test is to ensure doesn't create illegally-named intermediate vars when
			// `mangle` and `inline` options false
			expectSerializedEqual(
				{if: {}, do: {}, this: {}, arguments: {}, repeat: {if: {}, do: {}, this: {}, arguments: {}}},
				'({if:{},do:{},this:{},arguments:{},repeat:{if:{},do:{},this:{},arguments:{}}})'
			);
		});

		it('with undefined value', () => {
			expectSerializedEqual(
				{x: undefined},
				'({x:void 0})',
				(obj) => {
					expect(obj).toHaveOwnPropertyNames(['x']);
					expect(obj.x).toBeUndefined();
				}
			);
		});
	});

	describe('nested objects', () => {
		it('one nested object', () => {
			expectSerializedEqual({
				a: {aa: 1},
				b: 2
			}, '({a:{aa:1},b:2})');
		});

		it('multiple nested objects', () => {
			expectSerializedEqual({
				a: {aa: 1},
				b: {ba: 2},
				c: 3
			}, '({a:{aa:1},b:{ba:2},c:3})');
		});

		it('multiple layers of nesting', () => {
			expectSerializedEqual({
				a: {
					aa: {
						aaa: {
							aaaa: 1,
							aaab: 2
						},
						aab: {},
						aac: 3
					},
					ab: {
						aba: {
							abaa: 4
						},
						abb: 5
					},
					ac: {},
					ad: 6
				},
				b: {
					ba: {
						baa: {
							baaa: 7,
							baab: 8
						}
					},
					bb: 9
				}
			}, '({a:{aa:{aaa:{aaaa:1,aaab:2},aab:{},aac:3},ab:{aba:{abaa:4},abb:5},ac:{},ad:6},b:{ba:{baa:{baaa:7,baab:8}},bb:9}})');
		});

		describe('duplicated references', () => {
			it('where nested before', () => {
				const a = {aa: 1};
				const input = {
					c: {
						d: a
					},
					a,
					b: a
				};
				const output = expectSerializedEqual(input, '(()=>{const a={aa:1};return{c:{d:a},a,b:a}})()');
				expect(output.a).toEqual(a);
				expect(output.b).toBe(output.a);
				expect(output.c.d).toBe(output.a);
			});

			it('where nested after', () => {
				const a = {aa: 1};
				const input = {
					a,
					b: a,
					c: {
						d: a
					}
				};
				const output = expectSerializedEqual(input, '(()=>{const a={aa:1};return{a,b:a,c:{d:a}}})()');
				expect(output.a).toEqual(a);
				expect(output.b).toBe(output.a);
				expect(output.c.d).toBe(output.a);
			});
		});

		describe('circular references', () => {
			describe('direct', () => {
				it('one level deep', () => {
					const input = {};
					input.a = input;

					const output = expectSerializedEqual(
						input, '(()=>{const a={};a.a=a;return a})()'
					);
					expect(output.a).toBe(output);
				});

				it('multiple levels deep', () => {
					const input = {
						a: {
							b: {}
						}
					};
					input.a.b.c = input;

					const output = expectSerializedEqual(
						input, '(()=>{const a={},b={a:{b:a}};a.c=b;return b})()'
					);
					expect(output.a.b.c).toBe(output);
				});

				it('property names which are not valid identifiers', () => {
					const input = {};
					input['0a'] = input;

					const output = expectSerializedEqual(
						input, '(()=>{const a={};a["0a"]=a;return a})()'
					);
					expect(output['0a']).toBe(output);
				});

				it('numeric property keys', () => {
					const input = {};
					input[0] = input;
					input[1] = input;
					input[23] = input;
					input['04'] = input;
					expectSerializedEqual(
						input,
						'(()=>{const a={};a[0]=a;a[1]=a;a[23]=a;a["04"]=a;return a})()',
						(obj) => {
							expect(obj[0]).toBe(obj);
							expect(obj[1]).toBe(obj);
							expect(obj[23]).toBe(obj);
							expect(obj['04']).toBe(obj);
						}
					);
				});
			});

			describe('inside another object', () => {
				it('one level deep', () => {
					const a = {};
					a.b = a;
					const input = {a};

					const output = expectSerializedEqual(input, '(()=>{const a={};a.b=a;return{a}})()');
					expect(output.a.b).toBe(output.a);
				});

				it('multiple levels deep', () => {
					const a = {
						b: {
							c: {}
						}
					};
					a.b.c.d = a;
					const input = {a};

					const output = expectSerializedEqual(
						input, '(()=>{const a={},b={b:{c:a}};a.d=b;return{a:b}})()'
					);
					expect(output.a.b.c.d).toBe(output.a);
				});
			});
		});
	});

	describe('with symbol keys', () => {
		describe('no descriptors', () => {
			it('no circular properties', () => {
				const input = {
					x: 1,
					y: {yy: 2},
					[Symbol('symbol1')]: 3,
					[Symbol('symbol2')]: {ss: 4}
				};

				run(input, null, (obj) => {
					const symbolKeys = Object.getOwnPropertySymbols(obj);
					expect(symbolKeys).toBeArrayOfSize(2);
					expect(Object.keys(obj)).toBeArrayOfSize(2);
					const [s1, s2] = symbolKeys;
					expect(typeof s1).toBe('symbol');
					expect(typeof s2).toBe('symbol');
					expect(s2).not.toBe(s1);
					expect(obj[s1]).toBe(3);
					expect(obj[s2]).toEqual({ss: 4});
					expect(obj.x).toBe(1);
					expect(obj.y).toEqual({yy: 2});
				});
			});

			it('repeated key', () => {
				const s = Symbol('symbol1');
				const input = {obj1: {[s]: 1}, obj2: {[s]: 2}};

				run(input, null, (obj) => {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['obj1', 'obj2']);
					const {obj1, obj2} = obj;

					const symbolKeys1 = Object.getOwnPropertySymbols(obj1);
					expect(symbolKeys1).toBeArrayOfSize(1);
					const symbolKeys2 = Object.getOwnPropertySymbols(obj2);
					expect(symbolKeys2).toBeArrayOfSize(1);
					const [s1] = symbolKeys1,
						[s2] = symbolKeys2;
					expect(typeof s1).toBe('symbol');
					expect(s2).toBe(s1);
					expect(obj1[s1]).toBe(1);
					expect(obj2[s1]).toBe(2);
				});
			});

			it('circular properties', () => {
				const input = {x: 1, y: 2};
				input[Symbol('symbol1')] = input;

				run(input, null, (obj) => {
					const symbolKeys = Object.getOwnPropertySymbols(obj);
					expect(symbolKeys).toBeArrayOfSize(1);
					expect(Object.keys(obj)).toBeArrayOfSize(2);
					const [s] = symbolKeys;
					expect(typeof s).toBe('symbol');
					expect(obj[s]).toBe(obj);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
				});
			});

			it('circular properties duplicated', () => {
				const input = {x: 1, y: 2};
				input[Symbol('symbol1')] = input;
				input[Symbol('symbol2')] = input;

				run(input, null, (obj) => {
					const symbolKeys = Object.getOwnPropertySymbols(obj);
					expect(symbolKeys).toBeArrayOfSize(2);
					expect(Object.keys(obj)).toBeArrayOfSize(2);
					const [s1, s2] = symbolKeys;
					expect(typeof s1).toBe('symbol');
					expect(typeof s2).toBe('symbol');
					expect(s2).not.toBe(s1);
					expect(obj[s1]).toBe(obj);
					expect(obj[s2]).toBe(obj);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
				});
			});
		});

		describe('with descriptors', () => {
			it('no circular properties', () => {
				const input = {x: 1, y: {yy: 2}};
				Object.defineProperties(input, {
					[Symbol('symbol1')]: {value: 3, writable: true, configurable: true},
					[Symbol('symbol2')]: {value: {ss: 4}, writable: true, configurable: true}
				});

				run(input, null, (obj) => {
					const symbolKeys = Object.getOwnPropertySymbols(obj);
					expect(symbolKeys).toBeArrayOfSize(2);
					expect(Object.keys(obj)).toBeArrayOfSize(2);
					const [s1, s2] = symbolKeys;
					expect(typeof s1).toBe('symbol');
					expect(typeof s2).toBe('symbol');
					expect(s2).not.toBe(s1);
					expect(obj[s1]).toBe(3);
					expect(obj[s2]).toEqual({ss: 4});
					expect(obj).toHaveDescriptorModifiersFor(s1, true, false, true);
					expect(obj).toHaveDescriptorModifiersFor(s2, true, false, true);
					expect(obj.x).toBe(1);
					expect(obj.y).toEqual({yy: 2});
				});
			});

			it('repeated key', () => {
				const s = Symbol('symbol1');
				const input = {obj1: {}, obj2: {}};
				Object.defineProperty(input.obj1, s, {value: 1, writable: true, configurable: true});
				Object.defineProperty(input.obj2, s, {value: 2, writable: true, configurable: true});

				run(input, null, (obj) => {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['obj1', 'obj2']);
					const {obj1, obj2} = obj;

					const symbolKeys1 = Object.getOwnPropertySymbols(obj1);
					expect(symbolKeys1).toBeArrayOfSize(1);
					const symbolKeys2 = Object.getOwnPropertySymbols(obj2);
					expect(symbolKeys2).toBeArrayOfSize(1);
					const [s1] = symbolKeys1,
						[s2] = symbolKeys2;
					expect(typeof s1).toBe('symbol');
					expect(s2).toBe(s1);
					expect(obj1[s1]).toBe(1);
					expect(obj2[s1]).toBe(2);
					expect(obj1).toHaveDescriptorModifiersFor(s1, true, false, true);
					expect(obj2).toHaveDescriptorModifiersFor(s1, true, false, true);
				});
			});

			it('circular properties', () => {
				const input = {x: 1, y: 2};
				Object.defineProperty(input, Symbol('symbol1'), {
					value: input, writable: true, configurable: true
				});

				run(input, null, (obj) => {
					const symbolKeys = Object.getOwnPropertySymbols(obj);
					expect(symbolKeys).toBeArrayOfSize(1);
					expect(Object.keys(obj)).toBeArrayOfSize(2);
					const [s] = symbolKeys;
					expect(typeof s).toBe('symbol');
					expect(obj[s]).toBe(obj);
					expect(obj).toHaveDescriptorModifiersFor(s, true, false, true);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
				});
			});

			it('circular properties duplicated', () => {
				const input = {x: 1, y: 2};
				Object.defineProperties(input, {
					[Symbol('symbol1')]: {value: input, writable: true, configurable: true},
					[Symbol('symbol2')]: {value: input, writable: true, configurable: true}
				});

				run(input, null, (obj) => {
					const symbolKeys = Object.getOwnPropertySymbols(obj);
					expect(symbolKeys).toBeArrayOfSize(2);
					expect(Object.keys(obj)).toBeArrayOfSize(2);
					const [s1, s2] = symbolKeys;
					expect(typeof s1).toBe('symbol');
					expect(typeof s2).toBe('symbol');
					expect(s2).not.toBe(s1);
					expect(obj[s1]).toBe(obj);
					expect(obj[s2]).toBe(obj);
					expect(obj).toHaveDescriptorModifiersFor(s1, true, false, true);
					expect(obj).toHaveDescriptorModifiersFor(s2, true, false, true);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
				});
			});
		});
	});

	describe('with descriptors', () => {
		describe('no circular properties', () => {
			it('has correct prototype', () => {
				const input = {x: 1};
				Object.defineProperty(input, 'y', {value: 2, writable: true, configurable: true});
				expectSerializedEqual(input, null, (obj) => {
					expect(obj).toHavePrototype(Object.prototype);
				});
			});

			it('has correct value', () => {
				const input = {x: 1};
				Object.defineProperty(input, 'y', {value: 2, writable: true, configurable: true});
				expectSerializedEqual(input, null, (obj) => {
					expect(obj.y).toBe(2);
				});
			});

			describe('with descriptor props', () => {
				it.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
				)(
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => {
						const input = {x: 1};
						Object.defineProperty(input, 'y', {value: 2, writable, enumerable, configurable});

						expectSerializedEqual(input, null, (obj) => {
							expect(obj).toHaveOwnPropertyNames(['x', 'y']);
							expect(obj.x).toBe(1);
							expect(obj.y).toBe(2);
							expect(obj).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(obj).toHaveDescriptorModifiersFor('y', writable, enumerable, configurable);
						});
					}
				);
			});

			describe('with getter / setter', () => {
				it('getter', () => {
					const input = {
						x: 1,
						get y() { return 2; }
					};

					expectSerializedEqual(input, null, (obj) => {
						expect(obj.y).toBe(2);
						expect(Object.keys(obj)).toEqual(['x', 'y']);
						expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
							get: expect.any(Function), set: undefined, enumerable: true, configurable: true
						});
					});
				});

				it('setter', () => {
					const input = {
						x: 1,
						set y(newX) { this.x = newX; }
					};

					expectSerializedEqual(input, null, (obj) => {
						expect(obj.x).toBe(1);
						expect(obj.y).toBeUndefined();
						expect(Object.keys(obj)).toEqual(['x', 'y']);
						expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
							get: undefined, set: expect.any(Function), enumerable: true, configurable: true
						});

						obj.y = 2;
						expect(obj.x).toBe(2);
						expect(obj.y).toBeUndefined();
					});
				});

				it('getter and setter undefined', () => {
					const input = {x: 1};
					Object.defineProperty(input, 'y', {get: undefined, enumerable: true});

					expectSerializedEqual(input, null, (obj) => {
						expect(Object.keys(obj)).toEqual(['x', 'y']);
						expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
							get: undefined, set: undefined, enumerable: true, configurable: false
						});
					});
				});
			});

			it('with property names which are not valid identifiers', () => {
				const input = {};
				Object.defineProperty(input, '0a', {value: 1, writable: true});
				expectSerializedEqual(
					input,
					'Object.defineProperties({},{"0a":{value:1,writable:true}})'
				);
			});

			it('with numeric property keys', () => {
				const input = {};
				Object.defineProperty(input, 0, {value: 1, writable: true});
				Object.defineProperty(input, 1, {value: 2, writable: true});
				Object.defineProperty(input, 23, {value: 3, writable: true});
				Object.defineProperty(input, '04', {value: 4, writable: true});
				expectSerializedEqual(
					input,
					'Object.defineProperties({},{0:{value:1,writable:true},1:{value:2,writable:true},23:{value:3,writable:true},"04":{value:4,writable:true}})'
				);
			});

			it('with undefined value', () => {
				expectSerializedEqual(
					Object.defineProperty({}, 'x', {writable: true}),
					'Object.defineProperties({},{x:{writable:true}})',
					(obj) => {
						expect(obj).toHaveOwnPropertyNames(['x']);
						expect(obj.x).toBeUndefined();
					}
				);
			});
		});

		describe('circular properties', () => {
			it('has correct prototype', () => {
				const input = {x: 1};
				Object.defineProperty(input, 'y', {value: input, writable: true, configurable: true});
				expectSerializedEqual(input, null, (obj) => {
					expect(obj).toHavePrototype(Object.prototype);
				});
			});

			it('has correct value', () => {
				const input = {x: 1};
				Object.defineProperty(input, 'y', {value: input, writable: true, configurable: true});
				expectSerializedEqual(input, null, (obj) => {
					expect(obj.y).toBe(obj);
				});
			});

			describe('with descriptor props', () => {
				it.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
				)(
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => {
						const input = {w: 1};
						Object.defineProperty(input, 'x', {value: input, writable, enumerable, configurable});
						input.y = 2;
						Object.defineProperty(input, 'z', {value: input, writable, enumerable, configurable});

						expectSerializedEqual(input, null, (obj) => {
							expect(obj).toHaveOwnPropertyNames(['w', 'x', 'y', 'z']);
							expect(obj.w).toBe(1);
							expect(obj.x).toBe(obj);
							expect(obj.y).toBe(2);
							expect(obj.z).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('w', true, true, true);
							expect(obj).toHaveDescriptorModifiersFor('x', writable, enumerable, configurable);
							expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(obj).toHaveDescriptorModifiersFor('z', writable, enumerable, configurable);
						});
					}
				);
			});

			it('with getter', () => {
				const input = {
					x: 1,
					get y() { return input; }
				};

				expectSerializedEqual(input, null, (obj) => {
					expect(obj.y).toEqual(input);
					expect(Object.keys(obj)).toEqual(['x', 'y']);
					expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
						get: expect.any(Function), set: undefined, enumerable: true, configurable: true
					});
				});
			});

			it('with setter', () => {
				const input = {
					x: 1,
					set y(_) { this.z = input; }
				};

				expectSerializedEqual(input, null, (obj) => {
					expect(Object.keys(obj)).toEqual(['x', 'y']);
					obj.y = 2;
					expect(obj.z).toEqual(input);
					expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
						get: undefined, set: expect.any(Function), enumerable: true, configurable: true
					});
				});
			});

			it('with property names which are not valid identifiers', () => {
				const input = {};
				Object.defineProperty(input, '0a', {value: input, writable: true});
				expectSerializedEqual(
					input,
					'(()=>{const a={};Object.defineProperties(a,{"0a":{value:a,writable:true}});return a})()',
					obj => expect(obj['0a']).toBe(obj)
				);
			});

			it('with numeric property keys', () => {
				const input = {};
				Object.defineProperty(input, 0, {value: input, writable: true});
				Object.defineProperty(input, 1, {value: input, writable: true});
				Object.defineProperty(input, 23, {value: input, writable: true});
				Object.defineProperty(input, '04', {value: input, writable: true});
				expectSerializedEqual(
					input,
					'(()=>{const a={};Object.defineProperties(a,{0:{value:a,writable:true},1:{value:a,writable:true},23:{value:a,writable:true},"04":{value:a,writable:true}});return a})()',
					(obj) => {
						expect(obj[0]).toBe(obj);
						expect(obj[1]).toBe(obj);
						expect(obj[23]).toBe(obj);
						expect(obj['04']).toBe(obj);
					}
				);
			});
		});
	});

	describe('null prototype object', () => {
		it('no properties', () => {
			expectSerializedEqual(Object.create(null), 'Object.create(null)', (obj) => {
				expect(obj).toHavePrototype(null);
				expect(obj).toContainAllKeys([]);
			});
		});

		describe('no circular props', () => {
			it('properties', () => {
				const input = Object.create(null);
				input.x = 1;
				input.y = 2;

				expectSerializedEqual(
					input, '(()=>{const a=Object;return a.assign(a.create(null),{x:1,y:2})})()',
					(obj) => {
						expect(obj).toHavePrototype(null);
						expect(obj).toContainAllKeys(['x', 'y']);
						expect(obj.x).toBe(1);
						expect(obj.y).toBe(2);
					}
				);
			});

			it('properties with descriptors', () => {
				const input = Object.create(null);
				input.x = 1;
				Object.defineProperty(input, 'y', {value: 2, writable: true, configurable: true});

				expectSerializedEqual(
					input,
					'Object.create(null,{x:{value:1,writable:true,enumerable:true,configurable:true},y:{value:2,writable:true,configurable:true}})',
					(obj) => {
						expect(obj).toHavePrototype(null);
						expect(obj).toHaveOwnPropertyNames(['x', 'y']);
						expect(Object.keys(obj)).toEqual(['x']);
						expect(obj.x).toBe(1);
						expect(obj.y).toBe(2);
						expect(obj).toHaveDescriptorModifiersFor('x', true, true, true);
						expect(obj).toHaveDescriptorModifiersFor('y', true, false, true);
					}
				);
			});
		});

		describe('circular props', () => {
			it('properties', () => {
				const input = Object.create(null);
				input.x = 1;
				input.y = input;

				expectSerializedEqual(
					input, '(()=>{const a=Object,b=a.assign(a.create(null),{x:1});b.y=b;return b})()',
					(obj) => {
						expect(obj).toHavePrototype(null);
						expect(obj).toContainAllKeys(['x', 'y']);
						expect(obj.x).toBe(1);
						expect(obj.y).toBe(obj);
					}
				);
			});

			it('properties with descriptors', () => {
				const input = Object.create(null);
				input.x = 1;
				Object.defineProperty(input, 'y', {value: input, writable: true, configurable: true});

				expectSerializedEqual(
					input,
					'(()=>{const a=Object,b=a.assign(a.create(null),{x:1});a.defineProperties(b,{y:{value:b,writable:true,configurable:true}});return b})()',
					(obj) => {
						expect(obj).toHavePrototype(null);
						expect(obj).toHaveOwnPropertyNames(['x', 'y']);
						expect(Object.keys(obj)).toEqual(['x']);
						expect(obj.x).toBe(1);
						expect(obj.y).toBe(obj);
						expect(obj).toHaveDescriptorModifiersFor('y', true, false, true);
					}
				);
			});
		});
	});

	describe('non-extensible', () => {
		describe('frozen', () => {
			describe('no circular properties', () => {
				it('no descriptors', () => {
					expectSerializedEqual(
						Object.freeze({a: 1}),
						'Object.freeze({a:1})',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeTrue();
							expect(obj).toHaveOwnPropertyNames(['a']);
							expect(obj.a).toBe(1);
							expect(obj).toHaveDescriptorModifiersFor('a', false, true, false);
						}
					);
				});

				it('descriptors', () => {
					expectSerializedEqual(
						Object.freeze(Object.defineProperty({a: 1}, 'a', {enumerable: false})),
						'(()=>{const a=Object;return a.freeze(a.defineProperties({},{a:{value:1}}))})()',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeTrue();
							expect(obj).toHaveOwnPropertyNames(['a']);
							expect(obj.a).toBe(1);
							expect(obj).toHaveDescriptorModifiersFor('a', false, false, false);
						}
					);
				});
			});

			describe('circular properties', () => {
				it('no descriptors', () => {
					const input = {};
					input.a = input;
					input.b = 2;
					input.c = input;
					Object.freeze(input);

					expectSerializedEqual(
						input,
						'(()=>{const a={a:void 0,b:2};a.a=a;a.c=a;Object.freeze(a);return a})()',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeTrue();
							expect(obj).toHaveOwnPropertyNames(['a', 'b', 'c']);
							expect(obj.a).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('a', false, true, false);
							expect(obj.b).toBe(2);
							expect(obj).toHaveDescriptorModifiersFor('b', false, true, false);
							expect(obj.c).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('c', false, true, false);
						}
					);
				});

				it('descriptors', () => {
					const input = {};
					input.a = input;
					input.b = 2;
					input.c = input;
					Object.defineProperty(input, 'a', {enumerable: false});
					Object.defineProperty(input, 'b', {enumerable: false});
					Object.defineProperty(input, 'c', {enumerable: false});
					Object.freeze(input);

					expectSerializedEqual(
						input,
						'(()=>{const a=Object,b=a.defineProperties,c=b({},{a:{writable:true,enumerable:true,configurable:true},b:{value:2}});a.freeze(b(c,{a:{value:c,enumerable:false},c:{value:c}}));return c})()',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeTrue();
							expect(obj).toHaveOwnPropertyNames(['a', 'b', 'c']);
							expect(obj.a).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('a', false, false, false);
							expect(obj.b).toBe(2);
							expect(obj).toHaveDescriptorModifiersFor('b', false, false, false);
							expect(obj.c).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('c', false, false, false);
						}
					);
				});
			});
		});

		describe('sealed', () => {
			describe('no circular properties', () => {
				it('no descriptors', () => {
					expectSerializedEqual(
						Object.seal({a: 1}),
						'Object.seal({a:1})',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeFalse();
							expect(Object.isSealed(obj)).toBeTrue();
							expect(obj).toHaveOwnPropertyNames(['a']);
							expect(obj.a).toBe(1);
							expect(obj).toHaveDescriptorModifiersFor('a', true, true, false);
						}
					);
				});

				it('descriptors', () => {
					expectSerializedEqual(
						Object.seal(Object.defineProperties({a: 1, b: 2, c: 3, d: 4}, {
							a: {writable: false, enumerable: false},
							b: {writable: true, enumerable: false},
							c: {writable: false, enumerable: true},
							d: {writable: true, enumerable: true}
						})),
						'(()=>{const a=Object;return a.seal(a.defineProperties({},{a:{value:1},b:{value:2,writable:true},c:{value:3,enumerable:true},d:{value:4,writable:true,enumerable:true}}))})()',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeFalse();
							expect(Object.isSealed(obj)).toBeTrue();
							expect(obj).toHaveOwnPropertyNames(['a', 'b', 'c', 'd']);
							expect(obj.a).toBe(1);
							expect(obj).toHaveDescriptorModifiersFor('a', false, false, false);
							expect(obj.b).toBe(2);
							expect(obj).toHaveDescriptorModifiersFor('b', true, false, false);
							expect(obj.c).toBe(3);
							expect(obj).toHaveDescriptorModifiersFor('c', false, true, false);
							expect(obj.d).toBe(4);
							expect(obj).toHaveDescriptorModifiersFor('d', true, true, false);
						}
					);
				});
			});

			describe('circular properties', () => {
				it('no descriptors', () => {
					const input = {};
					input.a = input;
					input.b = 2;
					input.c = input;
					Object.seal(input);

					expectSerializedEqual(
						input,
						'(()=>{const a={a:void 0,b:2};a.a=a;a.c=a;Object.seal(a);return a})()',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeFalse();
							expect(Object.isSealed(obj)).toBeTrue();
							expect(obj).toHaveOwnPropertyNames(['a', 'b', 'c']);
							expect(obj.a).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('a', true, true, false);
							expect(obj.b).toBe(2);
							expect(obj).toHaveDescriptorModifiersFor('b', true, true, false);
							expect(obj.c).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('c', true, true, false);
						}
					);
				});

				it('descriptors', () => {
					const input = {};
					input.a = input;
					input.b = 2;
					input.c = input;
					input.d = input;
					Object.defineProperties(input, {
						a: {writable: false, enumerable: false},
						b: {writable: true, enumerable: false},
						c: {writable: false, enumerable: true},
						d: {writable: true, enumerable: true}
					});
					Object.seal(input);

					expectSerializedEqual(
						input,
						'(()=>{const a=Object,b=a.defineProperties,c=b({},{a:{writable:true,enumerable:true,configurable:true},b:{value:2,writable:true}});a.seal(b(c,{a:{value:c,writable:false,enumerable:false},c:{value:c,enumerable:true},d:{value:c,writable:true,enumerable:true}}));return c})()',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeFalse();
							expect(Object.isSealed(obj)).toBeTrue();
							expect(obj).toHaveOwnPropertyNames(['a', 'b', 'c', 'd']);
							expect(obj.a).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('a', false, false, false);
							expect(obj.b).toBe(2);
							expect(obj).toHaveDescriptorModifiersFor('b', true, false, false);
							expect(obj.c).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('c', false, true, false);
							expect(obj.d).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('d', true, true, false);
						}
					);
				});
			});
		});

		describe('extensions prevented', () => {
			describe('no circular properties', () => {
				it('no descriptors', () => {
					expectSerializedEqual(
						Object.preventExtensions({a: 1}),
						'Object.preventExtensions({a:1})',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeFalse();
							expect(Object.isSealed(obj)).toBeFalse();
							expect(Object.isExtensible(obj)).toBeFalse();
							expect(obj).toHaveOwnPropertyNames(['a']);
							expect(obj.a).toBe(1);
							expect(obj).toHaveDescriptorModifiersFor('a', true, true, true);
						}
					);
				});

				it('descriptors', () => {
					expectSerializedEqual(
						Object.preventExtensions(Object.defineProperty({a: 1}, 'a', {enumerable: false})),
						'(()=>{const a=Object;return a.preventExtensions(a.defineProperties({},{a:{value:1,writable:true,configurable:true}}))})()',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeFalse();
							expect(Object.isSealed(obj)).toBeFalse();
							expect(Object.isExtensible(obj)).toBeFalse();
							expect(obj).toHaveOwnPropertyNames(['a']);
							expect(obj.a).toBe(1);
							expect(obj).toHaveDescriptorModifiersFor('a', true, false, true);
						}
					);
				});
			});

			describe('circular properties', () => {
				it('no descriptors', () => {
					const input = {};
					input.a = input;
					input.b = 2;
					input.c = input;
					Object.preventExtensions(input);

					expectSerializedEqual(
						input,
						'(()=>{const a={a:void 0,b:2};a.a=a;a.c=a;Object.preventExtensions(a);return a})()',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeFalse();
							expect(Object.isSealed(obj)).toBeFalse();
							expect(Object.isExtensible(obj)).toBeFalse();
							expect(obj).toHaveOwnPropertyNames(['a', 'b', 'c']);
							expect(obj.a).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('a', true, true, true);
							expect(obj.b).toBe(2);
							expect(obj).toHaveDescriptorModifiersFor('b', true, true, true);
							expect(obj.c).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('c', true, true, true);
						}
					);
				});

				it('descriptors', () => {
					const input = {};
					input.a = input;
					input.b = 2;
					input.c = input;
					Object.defineProperty(input, 'a', {writable: false});
					Object.defineProperty(input, 'b', {enumerable: false});
					Object.defineProperty(input, 'c', {configurable: false});
					Object.preventExtensions(input);

					expectSerializedEqual(
						input,
						'(()=>{const a=Object,b=a.defineProperties,c=b({},{a:{writable:true,enumerable:true,configurable:true},b:{value:2,writable:true,configurable:true}});a.preventExtensions(b(c,{a:{value:c,writable:false},c:{value:c,writable:true,enumerable:true}}));return c})()',
						(obj) => {
							expect(obj).toBeObject();
							expect(Object.isFrozen(obj)).toBeFalse();
							expect(Object.isSealed(obj)).toBeFalse();
							expect(Object.isExtensible(obj)).toBeFalse();
							expect(obj).toHaveOwnPropertyNames(['a', 'b', 'c']);
							expect(obj.a).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('a', false, true, true);
							expect(obj.b).toBe(2);
							expect(obj).toHaveDescriptorModifiersFor('b', true, false, true);
							expect(obj.c).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('c', true, true, false);
						}
					);
				});
			});
		});
	});
});
