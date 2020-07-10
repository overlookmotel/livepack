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

		it('properties with names which are JS reserved words', () => {
			// This test is to ensure doesn't create illegally-named intermediate vars when
			// `mangle` and `inline` options false
			expectSerializedEqual(
				{if: {}, do: {}, this: {}, arguments: {}, repeat: {if: {}, do: {}, this: {}, arguments: {}}},
				'({if:{},do:{},this:{},arguments:{},repeat:{if:{},do:{},this:{},arguments:{}}})'
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
					expect(Object.getOwnPropertyDescriptor(obj, s1)).toEqual({
						value: 3, writable: true, enumerable: false, configurable: true
					});
					expect(Object.getOwnPropertyDescriptor(obj, s2)).toEqual({
						value: {ss: 4}, writable: true, enumerable: false, configurable: true
					});
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
					expect(Object.getOwnPropertyDescriptor(obj1, s1)).toEqual({
						value: 1, writable: true, enumerable: false, configurable: true
					});
					expect(Object.getOwnPropertyDescriptor(obj2, s1)).toEqual({
						value: 2, writable: true, enumerable: false, configurable: true
					});
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
					expect(Object.getOwnPropertyDescriptor(obj, s)).toEqual({
						value: obj, writable: true, enumerable: false, configurable: true
					});
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
					expect(Object.getOwnPropertyDescriptor(obj, s1)).toEqual({
						value: obj, writable: true, enumerable: false, configurable: true
					});
					expect(Object.getOwnPropertyDescriptor(obj, s2)).toEqual({
						value: obj, writable: true, enumerable: false, configurable: true
					});
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
					expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
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
							expect(Object.getOwnPropertyNames(obj)).toEqual(['x', 'y']);
							expect(Object.getOwnPropertyDescriptor(obj, 'x')).toEqual({
								value: 1, writable: true, enumerable: true, configurable: true
							});
							expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
								value: 2, writable, enumerable, configurable
							});
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
						const descriptor = Object.getOwnPropertyDescriptor(obj, 'y');
						expect(descriptor).toContainAllKeys(['enumerable', 'configurable', 'get', 'set']);
						expect(descriptor.enumerable).toBeTrue();
						expect(descriptor.configurable).toBeTrue();
						expect(descriptor.get).toBeFunction();
						expect(descriptor.set).toBeUndefined();
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
						const descriptor = Object.getOwnPropertyDescriptor(obj, 'y');
						expect(descriptor).toContainAllKeys(['enumerable', 'configurable', 'get', 'set']);
						expect(descriptor.enumerable).toBeTrue();
						expect(descriptor.configurable).toBeTrue();
						expect(descriptor.get).toBeUndefined();
						expect(descriptor.set).toBeFunction();

						obj.y = 2;
						expect(obj.x).toBe(2);
						expect(obj.y).toBeUndefined();
					});
				});
			});
		});

		describe('circular properties', () => {
			it('has correct prototype', () => {
				const input = {x: 1};
				Object.defineProperty(input, 'y', {value: input, writable: true, configurable: true});
				expectSerializedEqual(input, null, (obj) => {
					expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
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
							expect(Object.getOwnPropertyNames(obj)).toEqual(['w', 'x', 'y', 'z']);
							expect(Object.getOwnPropertyDescriptor(obj, 'w')).toEqual({
								value: 1, writable: true, enumerable: true, configurable: true
							});
							expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
								value: 2, writable: true, enumerable: true, configurable: true
							});
							expect(Object.getOwnPropertyDescriptor(obj, 'x')).toEqual({
								value: obj, writable, enumerable, configurable
							});
							expect(Object.getOwnPropertyDescriptor(obj, 'z')).toEqual({
								value: obj, writable, enumerable, configurable
							});
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
					const descriptor = Object.getOwnPropertyDescriptor(obj, 'y');
					expect(descriptor).toContainAllKeys(['enumerable', 'configurable', 'get', 'set']);
					expect(descriptor.enumerable).toBeTrue();
					expect(descriptor.configurable).toBeTrue();
					expect(descriptor.get).toBeFunction();
					expect(descriptor.set).toBeUndefined();
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
					const descriptor = Object.getOwnPropertyDescriptor(obj, 'y');
					expect(descriptor).toContainAllKeys(['enumerable', 'configurable', 'get', 'set']);
					expect(descriptor.enumerable).toBeTrue();
					expect(descriptor.configurable).toBeTrue();
					expect(descriptor.get).toBeUndefined();
					expect(descriptor.set).toBeFunction();
				});
			});
		});
	});

	describe('null prototype object', () => {
		it('no properties', () => {
			expectSerializedEqual(Object.create(null), 'Object.create(null)', (obj) => {
				expect(Object.getPrototypeOf(obj)).toBeNull();
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
						expect(Object.getPrototypeOf(obj)).toBeNull();
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
						expect(Object.getPrototypeOf(obj)).toBeNull();
						expect(Object.getOwnPropertyNames(obj)).toEqual(['x', 'y']);
						expect(Object.keys(obj)).toEqual(['x']);
						expect(obj.x).toBe(1);
						expect(obj.y).toBe(2);
						expect(Object.getOwnPropertyDescriptor(obj, 'x')).toEqual({
							value: 1, writable: true, enumerable: true, configurable: true
						});
						expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
							value: 2, writable: true, enumerable: false, configurable: true
						});
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
						expect(Object.getPrototypeOf(obj)).toBeNull();
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
						expect(Object.getPrototypeOf(obj)).toBeNull();
						expect(Object.getOwnPropertyNames(obj)).toEqual(['x', 'y']);
						expect(Object.keys(obj)).toEqual(['x']);
						expect(obj.x).toBe(1);
						expect(obj.y).toBe(obj);
						expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
							value: obj, writable: true, enumerable: false, configurable: true
						});
					}
				);
			});
		});
	});
});
