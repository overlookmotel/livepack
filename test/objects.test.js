/* --------------------
 * livepack module
 * Tests for objects
 * ------------------*/

'use strict';

// Imports
const {itSerializes, itSerializesEqual} = require('./support/index.js');

// Tests

const unsafeNumberString = (BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)).toString();

describe('Objects', () => {
	itSerializesEqual('empty object', {
		in: () => ({}),
		out: '{}'
	});

	describe('properties', () => {
		itSerializesEqual('one property', {
			in: () => ({a: 1}),
			out: '{a:1}'
		});

		itSerializesEqual('multiple properties', {
			in: () => ({a: 1, b: 2, c: 3}),
			out: '{a:1,b:2,c:3}'
		});

		itSerializesEqual('properties with names which are not valid identifiers', {
			in: () => ({'b-c': {'0a': 1, 'd.e': 2}}),
			out: '{"b-c":{"0a":1,"d.e":2}}'
		});

		itSerializesEqual('numeric property keys', {
			in: () => ({0: {1: 1, 23: 2, '04': 3}}),
			out: '{0:{1:1,23:2,"04":3}}'
		});

		itSerializesEqual('numeric property keys above max integer level', {
			// 4294967294 is max integer key - integers above max are not moved to first position
			in: () => ({a: 3, 4294967294: 1, 4294967295: 2}),
			out: '{4294967294:1,a:3,4294967295:2}'
		});

		itSerializesEqual('numeric property keys above max safe integer level', {
			in: () => ({
				a: 3,
				[Number.MAX_SAFE_INTEGER]: 1,
				[unsafeNumberString]: 2
			}),
			out: '{a:3,9007199254740991:1,"9007199254740992":2}'
		});

		itSerializesEqual('properties with names which are JS reserved words', {
			// This test is to ensure doesn't create illegally-named intermediate vars when
			// `mangle` and `inline` options false
			in: () => ({
				if: {}, do: {}, this: {}, arguments: {}, repeat: {if: {}, do: {}, this: {}, arguments: {}}
			}),
			out: '{if:{},do:{},this:{},arguments:{},repeat:{if:{},do:{},this:{},arguments:{}}}'
		});

		itSerializesEqual('with undefined value', {
			in: () => ({x: undefined}),
			out: '{x:void 0}',
			validate(obj) {
				expect(obj).toHaveOwnPropertyNames(['x']);
				expect(obj.x).toBeUndefined();
			}
		});
	});

	describe('nested objects', () => {
		itSerializesEqual('one nested object', {
			in: () => ({a: {aa: 1}, b: 2}),
			out: '{a:{aa:1},b:2}'
		});

		itSerializesEqual('multiple nested objects', {
			in: () => ({a: {aa: 1}, b: {ba: 2}, c: 3}),
			out: '{a:{aa:1},b:{ba:2},c:3}'
		});

		itSerializesEqual('multiple layers of nesting', {
			in: () => ({
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
			}),
			out: `{
				a:{
					aa:{aaa:{aaaa:1,aaab:2},aab:{},aac:3},
					ab:{aba:{abaa:4},abb:5},
					ac:{},
					ad:6
				},
				b:{
					ba:{baa:{baaa:7,baab:8}},
					bb:9
				}
			}`
		});

		describe('duplicated references', () => {
			itSerializesEqual('where nested before', {
				in() {
					const x = {xx: 1};
					return {
						c: {d: x},
						a: x,
						b: x
					};
				},
				out: '(()=>{const a={xx:1};return{c:{d:a},a,b:a}})()',
				validate(obj) {
					expect(obj.a).toEqual({xx: 1});
					expect(obj.b).toBe(obj.a);
					expect(obj.c.d).toBe(obj.a);
				}
			});

			itSerializesEqual('where nested after', {
				in() {
					const x = {xx: 1};
					return {
						a: x,
						b: x,
						c: {d: x}
					};
				},
				out: '(()=>{const a={xx:1};return{a,b:a,c:{d:a}}})()',
				validate(obj) {
					expect(obj.a).toEqual({xx: 1});
					expect(obj.b).toBe(obj.a);
					expect(obj.c.d).toBe(obj.a);
				}
			});
		});

		describe('circular references', () => {
			describe('direct', () => {
				itSerializesEqual('one level deep', {
					in() {
						const obj = {};
						obj.a = obj;
						return obj;
					},
					out: '(()=>{const a={};a.a=a;return a})()',
					validate: obj => expect(obj.a).toBe(obj)
				});

				itSerializesEqual('multiple levels deep', {
					in() {
						const obj = {
							a: {
								b: {}
							}
						};
						obj.a.b.c = obj;
						return obj;
					},
					out: '(()=>{const a={},b={a:{b:a}};a.c=b;return b})()',
					validate: obj => expect(obj.a.b.c).toBe(obj)
				});

				itSerializesEqual('property names which are not valid identifiers', {
					in() {
						const obj = {};
						obj['0a'] = obj;
						return obj;
					},
					out: '(()=>{const a={};a["0a"]=a;return a})()',
					validate: obj => expect(obj['0a']).toBe(obj)
				});

				itSerializesEqual('numeric property keys', {
					in() {
						const obj = {};
						obj['04'] = obj;
						obj[0] = obj;
						obj[1] = obj;
						obj[23] = obj;
						// 4294967294 is max integer key
						obj[4294967294] = obj;
						obj[4294967295] = obj;
						obj[Number.MAX_SAFE_INTEGER] = obj;
						obj[unsafeNumberString] = obj;
						return obj;
					},
					out: `(()=>{
						const a={};
						a[0]=a;
						a[1]=a;
						a[23]=a;
						a[4294967294]=a;
						a["04"]=a;
						a[4294967295]=a;
						a[9007199254740991]=a;
						a["9007199254740992"]=a;
						return a
					})()`,
					validate(obj) {
						expect(obj).toHaveOwnPropertyNames([
							'0', '1', '23', '4294967294', '04', '4294967295', '9007199254740991', '9007199254740992'
						]);
						expect(obj[0]).toBe(obj);
						expect(obj[1]).toBe(obj);
						expect(obj[23]).toBe(obj);
						expect(obj[4294967294]).toBe(obj);
						expect(obj[4294967295]).toBe(obj);
						expect(obj[Number.MAX_SAFE_INTEGER]).toBe(obj);
						expect(obj[unsafeNumberString]).toBe(obj);
					}
				});
			});

			describe('inside another object', () => {
				itSerializesEqual('one level deep', {
					in() {
						const x = {};
						x.b = x;
						return {a: x};
					},
					out: '(()=>{const a={};a.b=a;return{a}})()',
					validate: obj => expect(obj.a.b).toBe(obj.a)
				});

				itSerializesEqual('multiple levels deep', {
					in() {
						const x = {
							b: {
								c: {}
							}
						};
						x.b.c.d = x;
						return {x};
					},
					out: '(()=>{const a={},b={b:{c:a}};a.d=b;return{x:b}})()',
					validate: obj => expect(obj.x.b.c.d).toBe(obj.x)
				});
			});
		});
	});

	describe('with symbol keys', () => {
		describe('no descriptors', () => {
			itSerializes('no circular properties', {
				in: () => ({
					x: 1,
					y: {yy: 2},
					[Symbol('symbol1')]: 3,
					[Symbol('symbol2')]: {ss: 4}
				}),
				out: '(()=>{const a=Symbol;return{x:1,y:{yy:2},[a("symbol1")]:3,[a("symbol2")]:{ss:4}}})()',
				validate(obj) {
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
				}
			});

			itSerializes('repeated key', {
				in() {
					const s = Symbol('symbol1');
					return {obj1: {[s]: 1}, obj2: {[s]: 2}};
				},
				out: '(()=>{const a=Symbol("symbol1");return{obj1:{[a]:1},obj2:{[a]:2}}})()',
				validate(obj) {
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
				}
			});

			itSerializes('circular properties', {
				in() {
					const obj = {x: 1, y: 2};
					obj[Symbol('symbol1')] = obj;
					return obj;
				},
				out: '(()=>{const a={x:1,y:2};a[Symbol("symbol1")]=a;return a})()',
				validate(obj) {
					const symbolKeys = Object.getOwnPropertySymbols(obj);
					expect(symbolKeys).toBeArrayOfSize(1);
					expect(Object.keys(obj)).toBeArrayOfSize(2);
					const [s] = symbolKeys;
					expect(typeof s).toBe('symbol');
					expect(obj[s]).toBe(obj);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
				}
			});

			itSerializes('circular properties duplicated', {
				in() {
					const obj = {x: 1, y: 2};
					obj[Symbol('symbol1')] = obj;
					obj[Symbol('symbol2')] = obj;
					return obj;
				},
				out: '(()=>{const a=Symbol,b={x:1,y:2};b[a("symbol1")]=b;b[a("symbol2")]=b;return b})()',
				validate(obj) {
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
				}
			});
		});

		describe('with descriptors', () => {
			itSerializes('no circular properties', {
				in() {
					const obj = {x: 1, y: {yy: 2}};
					Object.defineProperties(obj, {
						[Symbol('symbol1')]: {value: 3, writable: true, configurable: true},
						[Symbol('symbol2')]: {value: {ss: 4}, writable: true, configurable: true}
					});
					return obj;
				},
				out: `(()=>{
					const a=Symbol;
					return Object.defineProperties({},{
						x:{value:1,writable:true,enumerable:true,configurable:true},
						y:{value:{yy:2},writable:true,enumerable:true,configurable:true},
						[a("symbol1")]:{value:3,writable:true,configurable:true},
						[a("symbol2")]:{value:{ss:4},writable:true,configurable:true}
					})
				})()`,
				validate(obj) {
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
				}
			});

			itSerializes('repeated key', {
				in() {
					const s = Symbol('symbol1');
					const obj = {obj1: {}, obj2: {}};
					Object.defineProperty(obj.obj1, s, {value: 1, writable: true, configurable: true});
					Object.defineProperty(obj.obj2, s, {value: 2, writable: true, configurable: true});
					return obj;
				},
				out: `(()=>{
					const a=Object.defineProperties,
						b=Symbol("symbol1");
					return{
						obj1:a({},{[b]:{value:1,writable:true,configurable:true}}),
						obj2:a({},{[b]:{value:2,writable:true,configurable:true}})
					}
				})()`,
				validate(obj) {
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
				}
			});

			itSerializes('circular properties', {
				in() {
					const obj = {x: 1, y: 2};
					Object.defineProperty(obj, Symbol('symbol1'), {
						value: obj, writable: true, configurable: true
					});
					return obj;
				},
				out: `(()=>{
					const a={x:1,y:2};
					Object.defineProperties(a,{[Symbol("symbol1")]:{value:a,writable:true,configurable:true}});
					return a
				})()`,
				validate(obj) {
					const symbolKeys = Object.getOwnPropertySymbols(obj);
					expect(symbolKeys).toBeArrayOfSize(1);
					expect(Object.keys(obj)).toBeArrayOfSize(2);
					const [s] = symbolKeys;
					expect(typeof s).toBe('symbol');
					expect(obj[s]).toBe(obj);
					expect(obj).toHaveDescriptorModifiersFor(s, true, false, true);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
				}
			});

			itSerializes('circular properties duplicated', {
				in() {
					const obj = {x: 1, y: 2};
					Object.defineProperties(obj, {
						[Symbol('symbol1')]: {value: obj, writable: true, configurable: true},
						[Symbol('symbol2')]: {value: obj, writable: true, configurable: true}
					});
					return obj;
				},
				out: `(()=>{
					const a=Symbol,
						b={x:1,y:2};
					Object.defineProperties(b,{
						[a("symbol1")]:{value:b,writable:true,configurable:true},
						[a("symbol2")]:{value:b,writable:true,configurable:true}
					});
					return b
				})()`,
				validate(obj) {
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
				}
			});
		});
	});

	describe('with descriptors', () => {
		describe('no circular properties', () => {
			itSerializesEqual('has correct prototype', {
				in() {
					const obj = {x: 1};
					Object.defineProperty(obj, 'y', {value: 2, writable: true, configurable: true});
					return obj;
				},
				out: 'Object.defineProperties({},{x:{value:1,writable:true,enumerable:true,configurable:true},y:{value:2,writable:true,configurable:true}})',
				validate: obj => expect(obj).toHavePrototype(Object.prototype)
			});

			itSerializesEqual('has correct value', {
				in() {
					const obj = {x: 1};
					Object.defineProperty(obj, 'y', {value: 2, writable: true, configurable: true});
					return obj;
				},
				out: 'Object.defineProperties({},{x:{value:1,writable:true,enumerable:true,configurable:true},y:{value:2,writable:true,configurable:true}})',
				validate: obj => expect(obj.y).toBe(2)
			});

			describe('with descriptor props', () => {
				itSerializesEqual.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)]),
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => ({
						in() {
							const obj = {x: 1};
							Object.defineProperty(obj, 'y', {value: 2, writable, enumerable, configurable});
							return obj;
						},
						validate(obj) {
							expect(obj).toHaveOwnPropertyNames(['x', 'y']);
							expect(obj.x).toBe(1);
							expect(obj.y).toBe(2);
							expect(obj).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(obj).toHaveDescriptorModifiersFor('y', writable, enumerable, configurable);
						}
					})
				);
			});

			describe('with getter / setter', () => {
				itSerializesEqual.skip('getter', {
					in: () => ({
						x: 1,
						get y() { return 2; }
					}),
					out: `Object.defineProperties({},{
						x:{value:1,writable:true,enumerable:true,configurable:true},
						y:{get:{"get y"(){return 2}}["get y"],enumerable:true,configurable:true}
					})`,
					validate(obj) {
						expect(obj.y).toBe(2);
						expect(Object.keys(obj)).toEqual(['x', 'y']);
						expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
							get: expect.any(Function), set: undefined, enumerable: true, configurable: true
						});
					}
				});

				itSerializesEqual.skip('setter', {
					in: () => ({
						x: 1,
						set y(newX) { this.x = newX; }
					}),
					out: `Object.defineProperties({},{
						x:{value:1,writable:true,enumerable:true,configurable:true},
						y:{set:{"set y"(a){this.x=a}}["set y"],enumerable:true,configurable:true}
					})`,
					validate(obj) {
						expect(obj.x).toBe(1);
						expect(obj.y).toBeUndefined();
						expect(Object.keys(obj)).toEqual(['x', 'y']);
						expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
							get: undefined, set: expect.any(Function), enumerable: true, configurable: true
						});

						obj.y = 2;
						expect(obj.x).toBe(2);
						expect(obj.y).toBeUndefined();
					}
				});

				itSerializesEqual.skip('getter and setter undefined', {
					in() {
						const obj = {x: 1};
						Object.defineProperty(obj, 'y', {get: undefined, enumerable: true});
						return obj;
					},
					out: 'Object.defineProperties({},{x:{value:1,writable:true,enumerable:true,configurable:true},y:{get:void 0,enumerable:true}})',
					validate(obj) {
						expect(Object.keys(obj)).toEqual(['x', 'y']);
						expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
							get: undefined, set: undefined, enumerable: true, configurable: false
						});
					}
				});
			});

			itSerializesEqual('with property names which are not valid identifiers', {
				in() {
					const obj = {};
					Object.defineProperty(obj, '0a', {value: 1, writable: true});
					return obj;
				},
				out: 'Object.defineProperties({},{"0a":{value:1,writable:true}})'
			});

			itSerializesEqual('with numeric property keys', {
				in() {
					const obj = {};
					Object.defineProperty(obj, 0, {value: 1, writable: true});
					Object.defineProperty(obj, 1, {value: 2, writable: true});
					Object.defineProperty(obj, 23, {value: 3, writable: true});
					Object.defineProperty(obj, '04', {value: 4, writable: true});
					return obj;
				},
				out: `Object.defineProperties(
					{},
					{
						0:{value:1,writable:true},
						1:{value:2,writable:true},
						23:{value:3,writable:true},
						"04":{value:4,writable:true}
					}
				)`
			});

			itSerializesEqual('with undefined value', {
				in: () => Object.defineProperty({}, 'x', {writable: true}),
				out: 'Object.defineProperties({},{x:{writable:true}})',
				validate(obj) {
					expect(obj).toHaveOwnPropertyNames(['x']);
					expect(obj.x).toBeUndefined();
				}
			});
		});

		describe('circular properties', () => {
			itSerializesEqual('has correct prototype', {
				in() {
					const obj = {x: 1};
					Object.defineProperty(obj, 'y', {value: obj, writable: true, configurable: true});
					return obj;
				},
				out: '(()=>{const a={x:1};Object.defineProperties(a,{y:{value:a,writable:true,configurable:true}});return a})()',
				validate: obj => expect(obj).toHavePrototype(Object.prototype)
			});

			itSerializesEqual('has correct value', {
				in() {
					const obj = {x: 1};
					Object.defineProperty(obj, 'y', {value: obj, writable: true, configurable: true});
					return obj;
				},
				out: '(()=>{const a={x:1};Object.defineProperties(a,{y:{value:a,writable:true,configurable:true}});return a})()',
				validate: obj => expect(obj.y).toBe(obj)
			});

			describe('with descriptor props', () => {
				itSerializesEqual.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)]),
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => ({
						in() {
							const obj = {w: 1};
							Object.defineProperty(obj, 'x', {value: obj, writable, enumerable, configurable});
							obj.y = 2;
							Object.defineProperty(obj, 'z', {value: obj, writable, enumerable, configurable});
							return obj;
						},
						validate(obj) {
							expect(obj).toHaveOwnPropertyNames(['w', 'x', 'y', 'z']);
							expect(obj.w).toBe(1);
							expect(obj.x).toBe(obj);
							expect(obj.y).toBe(2);
							expect(obj.z).toBe(obj);
							expect(obj).toHaveDescriptorModifiersFor('w', true, true, true);
							expect(obj).toHaveDescriptorModifiersFor('x', writable, enumerable, configurable);
							expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(obj).toHaveDescriptorModifiersFor('z', writable, enumerable, configurable);
						}
					})
				);
			});

			itSerializesEqual.skip('with getter', {
				in() {
					const obj = {
						x: 1,
						get y() { return obj; }
					};
					return obj;
				},
				out: `(()=>{
					const a=(a=>[b=>a=b,{"get y"(){return a}}["get y"]])(),
						b=Object.defineProperties({},{
							x:{value:1,writable:true,enumerable:true,configurable:true},
							y:{get:a[1],enumerable:true,configurable:true}
						});
					a[0](b);
					return b
				})()`,
				validate(obj) {
					expect(obj.y).toBe(obj);
					expect(Object.keys(obj)).toEqual(['x', 'y']);
					expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
						get: expect.any(Function), set: undefined, enumerable: true, configurable: true
					});
				}
			});

			itSerializesEqual.skip('with setter', {
				in() {
					const obj = {
						x: 1,
						set y(_) { this.z = obj; }
					};
					return obj;
				},
				out: `(()=>{
					const a=(b=>[a=>b=a,{"set y"(a){this.z=b}}["set y"]])(),
						b=Object.defineProperties({},{
							x:{value:1,writable:true,enumerable:true,configurable:true},
							y:{set:a[1],enumerable:true,configurable:true}
						});
					a[0](b);
					return b
				})()`,
				validate(obj) {
					expect(Object.keys(obj)).toEqual(['x', 'y']);
					obj.y = 2;
					expect(obj.z).toBe(obj);
					expect(Object.getOwnPropertyDescriptor(obj, 'y')).toEqual({
						get: undefined, set: expect.any(Function), enumerable: true, configurable: true
					});
				}
			});

			itSerializesEqual('with property names which are not valid identifiers', {
				in() {
					const obj = {};
					Object.defineProperty(obj, '0a', {value: obj, writable: true});
					return obj;
				},
				out: '(()=>{const a={};Object.defineProperties(a,{"0a":{value:a,writable:true}});return a})()',
				validate: obj => expect(obj['0a']).toBe(obj)
			});

			itSerializesEqual('with numeric property keys', {
				in() {
					const obj = {};
					Object.defineProperty(obj, 0, {value: obj, writable: true});
					Object.defineProperty(obj, 1, {value: obj, writable: true});
					Object.defineProperty(obj, 23, {value: obj, writable: true});
					Object.defineProperty(obj, '04', {value: obj, writable: true});
					return obj;
				},
				out: `(()=>{
					const a={};
					Object.defineProperties(a,{
						0:{value:a,writable:true},
						1:{value:a,writable:true},
						23:{value:a,writable:true},
						"04":{value:a,writable:true}
					});
					return a
				})()`,
				validate(obj) {
					expect(obj[0]).toBe(obj);
					expect(obj[1]).toBe(obj);
					expect(obj[23]).toBe(obj);
					expect(obj['04']).toBe(obj);
				}
			});
		});
	});

	describe('null prototype object', () => {
		itSerializesEqual('no properties', {
			in: () => Object.create(null),
			out: 'Object.create(null)',
			validate(obj) {
				expect(obj).toHavePrototype(null);
				expect(obj).toContainAllKeys([]);
			}
		});

		describe('no circular props', () => {
			itSerializesEqual('properties', {
				in() {
					const obj = Object.create(null);
					obj.x = 1;
					obj.y = 2;
					return obj;
				},
				out: '(()=>{const a=Object;return a.assign(a.create(null),{x:1,y:2})})()',
				validate(obj) {
					expect(obj).toHavePrototype(null);
					expect(obj).toContainAllKeys(['x', 'y']);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
				}
			});

			itSerializesEqual('properties with descriptors', {
				in() {
					const obj = Object.create(null);
					obj.x = 1;
					Object.defineProperty(obj, 'y', {value: 2, writable: true, configurable: true});
					return obj;
				},
				out: `Object.create(null,{
					x:{value:1,writable:true,enumerable:true,configurable:true},
					y:{value:2,writable:true,configurable:true}
				})`,
				validate(obj) {
					expect(obj).toHavePrototype(null);
					expect(obj).toHaveOwnPropertyNames(['x', 'y']);
					expect(Object.keys(obj)).toEqual(['x']);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(2);
					expect(obj).toHaveDescriptorModifiersFor('x', true, true, true);
					expect(obj).toHaveDescriptorModifiersFor('y', true, false, true);
				}
			});
		});

		describe('circular props', () => {
			itSerializesEqual('properties', {
				in() {
					const obj = Object.create(null);
					obj.x = 1;
					obj.y = obj;
					return obj;
				},
				out: '(()=>{const a=Object,b=a.assign(a.create(null),{x:1});b.y=b;return b})()',
				validate(obj) {
					expect(obj).toHavePrototype(null);
					expect(obj).toContainAllKeys(['x', 'y']);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(obj);
				}
			});

			itSerializesEqual('properties with descriptors', {
				in() {
					const obj = Object.create(null);
					obj.x = 1;
					Object.defineProperty(obj, 'y', {value: obj, writable: true, configurable: true});
					return obj;
				},
				out: '(()=>{const a=Object,b=a.assign(a.create(null),{x:1});a.defineProperties(b,{y:{value:b,writable:true,configurable:true}});return b})()',
				validate(obj) {
					expect(obj).toHavePrototype(null);
					expect(obj).toHaveOwnPropertyNames(['x', 'y']);
					expect(Object.keys(obj)).toEqual(['x']);
					expect(obj.x).toBe(1);
					expect(obj.y).toBe(obj);
					expect(obj).toHaveDescriptorModifiersFor('y', true, false, true);
				}
			});
		});
	});

	describe('non-extensible', () => {
		describe('frozen', () => {
			describe('no circular properties', () => {
				itSerializesEqual('no descriptors', {
					in: () => Object.freeze({a: 1}),
					out: 'Object.freeze({a:1})',
					validate(obj) {
						expect(obj).toBeObject();
						expect(Object.isFrozen(obj)).toBeTrue();
						expect(obj).toHaveOwnPropertyNames(['a']);
						expect(obj.a).toBe(1);
						expect(obj).toHaveDescriptorModifiersFor('a', false, true, false);
					}
				});

				itSerializesEqual('descriptors', {
					in: () => Object.freeze(Object.defineProperty({a: 1}, 'a', {enumerable: false})),
					out: '(()=>{const a=Object;return a.freeze(a.defineProperties({},{a:{value:1}}))})()',
					validate(obj) {
						expect(obj).toBeObject();
						expect(Object.isFrozen(obj)).toBeTrue();
						expect(obj).toHaveOwnPropertyNames(['a']);
						expect(obj.a).toBe(1);
						expect(obj).toHaveDescriptorModifiersFor('a', false, false, false);
					}
				});
			});

			describe('circular properties', () => {
				itSerializesEqual('no descriptors', {
					in() {
						const obj = {};
						obj.a = obj;
						obj.b = 2;
						obj.c = obj;
						Object.freeze(obj);
						return obj;
					},
					out: '(()=>{const a={a:void 0,b:2};a.a=a;a.c=a;Object.freeze(a);return a})()',
					validate(obj) {
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
				});

				itSerializesEqual('descriptors', {
					in() {
						const obj = {};
						obj.a = obj;
						obj.b = 2;
						obj.c = obj;
						Object.defineProperty(obj, 'a', {enumerable: false});
						Object.defineProperty(obj, 'b', {enumerable: false});
						Object.defineProperty(obj, 'c', {enumerable: false});
						Object.freeze(obj);
						return obj;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperties,
							c=b({},{
								a:{writable:true,enumerable:true,configurable:true},
								b:{value:2}
							});
						a.freeze(
							b(
								c,{
									a:{value:c,enumerable:false},
									c:{value:c}
								}
							)
						);
						return c
					})()`,
					validate(obj) {
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
				});
			});
		});

		describe('sealed', () => {
			describe('no circular properties', () => {
				itSerializesEqual('no descriptors', {
					in: () => Object.seal({a: 1}),
					out: 'Object.seal({a:1})',
					validate(obj) {
						expect(obj).toBeObject();
						expect(Object.isFrozen(obj)).toBeFalse();
						expect(Object.isSealed(obj)).toBeTrue();
						expect(obj).toHaveOwnPropertyNames(['a']);
						expect(obj.a).toBe(1);
						expect(obj).toHaveDescriptorModifiersFor('a', true, true, false);
					}
				});

				itSerializesEqual('descriptors', {
					in: () => Object.seal(Object.defineProperties({a: 1, b: 2, c: 3, d: 4}, {
						a: {writable: false, enumerable: false},
						b: {writable: true, enumerable: false},
						c: {writable: false, enumerable: true},
						d: {writable: true, enumerable: true}
					})),
					out: `(()=>{
						const a=Object;
						return a.seal(
							a.defineProperties({},{
								a:{value:1},
								b:{value:2,writable:true},
								c:{value:3,enumerable:true},
								d:{value:4,writable:true,enumerable:true}
							})
						)
					})()`,
					validate(obj) {
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
				});
			});

			describe('circular properties', () => {
				itSerializesEqual('no descriptors', {
					in() {
						const obj = {};
						obj.a = obj;
						obj.b = 2;
						obj.c = obj;
						Object.seal(obj);
						return obj;
					},
					out: '(()=>{const a={a:void 0,b:2};a.a=a;a.c=a;Object.seal(a);return a})()',
					validate(obj) {
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
				});

				itSerializesEqual('descriptors', {
					in() {
						const obj = {};
						obj.a = obj;
						obj.b = 2;
						obj.c = obj;
						obj.d = obj;
						Object.defineProperties(obj, {
							a: {writable: false, enumerable: false},
							b: {writable: true, enumerable: false},
							c: {writable: false, enumerable: true},
							d: {writable: true, enumerable: true}
						});
						Object.seal(obj);
						return obj;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperties,
							c=b({},{
								a:{writable:true,enumerable:true,configurable:true},
								b:{value:2,writable:true}
							});
						a.seal(
							b(
								c,{
									a:{value:c,writable:false,enumerable:false},
									c:{value:c,enumerable:true},
									d:{value:c,writable:true,enumerable:true}
								}
							)
						);
						return c
					})()`,
					validate(obj) {
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
				});
			});
		});

		describe('extensions prevented', () => {
			describe('no circular properties', () => {
				itSerializesEqual('no descriptors', {
					in: () => Object.preventExtensions({a: 1}),
					out: 'Object.preventExtensions({a:1})',
					validate(obj) {
						expect(obj).toBeObject();
						expect(Object.isFrozen(obj)).toBeFalse();
						expect(Object.isSealed(obj)).toBeFalse();
						expect(Object.isExtensible(obj)).toBeFalse();
						expect(obj).toHaveOwnPropertyNames(['a']);
						expect(obj.a).toBe(1);
						expect(obj).toHaveDescriptorModifiersFor('a', true, true, true);
					}
				});

				itSerializesEqual('descriptors', {
					in: () => Object.preventExtensions(Object.defineProperty({a: 1}, 'a', {enumerable: false})),
					out: '(()=>{const a=Object;return a.preventExtensions(a.defineProperties({},{a:{value:1,writable:true,configurable:true}}))})()',
					validate(obj) {
						expect(obj).toBeObject();
						expect(Object.isFrozen(obj)).toBeFalse();
						expect(Object.isSealed(obj)).toBeFalse();
						expect(Object.isExtensible(obj)).toBeFalse();
						expect(obj).toHaveOwnPropertyNames(['a']);
						expect(obj.a).toBe(1);
						expect(obj).toHaveDescriptorModifiersFor('a', true, false, true);
					}
				});
			});

			describe('circular properties', () => {
				itSerializesEqual('no descriptors', {
					in() {
						const obj = {};
						obj.a = obj;
						obj.b = 2;
						obj.c = obj;
						Object.preventExtensions(obj);
						return obj;
					},
					out: '(()=>{const a={a:void 0,b:2};a.a=a;a.c=a;Object.preventExtensions(a);return a})()',
					validate(obj) {
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
				});

				itSerializesEqual('descriptors', {
					in() {
						const obj = {};
						obj.a = obj;
						obj.b = 2;
						obj.c = obj;
						Object.defineProperty(obj, 'a', {writable: false});
						Object.defineProperty(obj, 'b', {enumerable: false});
						Object.defineProperty(obj, 'c', {configurable: false});
						Object.preventExtensions(obj);
						return obj;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperties,
							c=b({},{
								a:{writable:true,enumerable:true,configurable:true},
								b:{value:2,writable:true,configurable:true}
							});
						a.preventExtensions(
							b(c,{
								a:{value:c,writable:false},
								c:{value:c,writable:true,enumerable:true}
							})
						);
						return c
					})()`,
					validate(obj) {
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
				});
			});
		});
	});

	describe('`__proto__` property', () => {
		describe('standard object', () => {
			describe('no other props', () => {
				itSerializesEqual('non-circular', {
					in: () => Object.defineProperty({}, '__proto__', {value: {x: 1}}),
					out: 'Object.defineProperty({},"__proto__",{value:{x:1}})',
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['__proto__']);
						expect(obj.__proto__).toEqual({x: 1}); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj.x).toBeUndefined();
						expect(obj).toHavePrototype(Object.prototype);
					}
				});

				itSerializesEqual('circular', {
					in() {
						const obj = {};
						Object.defineProperty(obj, '__proto__', {value: obj});
						return obj;
					},
					out: '(()=>{const a={};Object.defineProperty(a,"__proto__",{value:a});return a})()',
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['__proto__']);
						expect(obj.__proto__).toBe(obj); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj).toHavePrototype(Object.prototype);
					}
				});
			});

			describe('prop before', () => {
				itSerializesEqual('non-circular', {
					in: () => Object.defineProperty({y: 2}, '__proto__', {value: {x: 1}}),
					out: `(()=>{
						const a=Object;
						return a.defineProperty(
							a.defineProperties({},{y:{value:2,writable:true,enumerable:true,configurable:true}}),
							"__proto__",
							{value:{x:1}}
						)
					})()`,
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['y', '__proto__']);
						expect(obj.y).toBe(2);
						expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
						expect(obj.__proto__).toEqual({x: 1}); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj.x).toBeUndefined();
						expect(obj).toHavePrototype(Object.prototype);
					}
				});

				itSerializesEqual('circular', {
					in() {
						const obj = {};
						obj.y = 2;
						Object.defineProperty(obj, '__proto__', {value: obj});
						return obj;
					},
					out: '(()=>{const a={y:2};Object.defineProperty(a,"__proto__",{value:a});return a})()',
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['y', '__proto__']);
						expect(obj.y).toBe(2);
						expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
						expect(obj.__proto__).toBe(obj); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj).toHavePrototype(Object.prototype);
					}
				});
			});

			describe('prop after', () => {
				itSerializesEqual('non-circular', {
					in() {
						const obj = {};
						Object.defineProperty(obj, '__proto__', {value: {x: 1}});
						obj.y = 2;
						return obj;
					},
					out: `(()=>{
						const a=Object;
						return a.defineProperties(
							a.defineProperty({},"__proto__",{value:{x:1}}),
							{y:{value:2,writable:true,enumerable:true,configurable:true}}
						)
					})()`,
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['__proto__', 'y']);
						expect(obj.__proto__).toEqual({x: 1}); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj.y).toBe(2);
						expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
						expect(obj.x).toBeUndefined();
						expect(obj).toHavePrototype(Object.prototype);
					}
				});

				itSerializesEqual('circular', {
					in() {
						const obj = {};
						Object.defineProperty(obj, '__proto__', {value: obj});
						obj.y = 2;
						return obj;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperty,
							c=a.defineProperties(
								b({},"__proto__",{writable:true,enumerable:true,configurable:true}),
								{y:{value:2,writable:true,enumerable:true,configurable:true}}
							);
						b(c,"__proto__",{value:c,writable:false,enumerable:false,configurable:false});
						return c
					})()`,
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['__proto__', 'y']);
						expect(obj.__proto__).toBe(obj); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj.y).toBe(2);
						expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
						expect(obj).toHavePrototype(Object.prototype);
					}
				});
			});

			describe('props before and after', () => {
				itSerializesEqual('non-circular', {
					in() {
						const obj = {};
						obj.y = 2;
						Object.defineProperty(obj, '__proto__', {value: {x: 1}});
						obj.z = 3;
						return obj;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperties;
							return b(
								a.defineProperty(
									b({},{y:{value:2,writable:true,enumerable:true,configurable:true}}),
									"__proto__",
									{value:{x:1}}
								),
								{z:{value:3,writable:true,enumerable:true,configurable:true}}
							)
						})()`,
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['y', '__proto__', 'z']);
						expect(obj.y).toBe(2);
						expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
						expect(obj.__proto__).toEqual({x: 1}); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj.z).toBe(3);
						expect(obj).toHaveDescriptorModifiersFor('z', true, true, true);
						expect(obj.x).toBeUndefined();
						expect(obj).toHavePrototype(Object.prototype);
					}
				});

				itSerializesEqual('circular', {
					in() {
						const obj = {};
						obj.y = 2;
						Object.defineProperty(obj, '__proto__', {value: obj});
						obj.z = 3;
						return obj;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperties,
							c=a.defineProperty,
							d=b(
								c(
									b({},{y:{value:2,writable:true,enumerable:true,configurable:true}}),
									"__proto__",
									{writable:true,enumerable:true,configurable:true}
								),
								{z:{value:3,writable:true,enumerable:true,configurable:true}}
							);
						c(d,"__proto__",{value:d,writable:false,enumerable:false,configurable:false});
						return d
					})()`,
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['y', '__proto__', 'z']);
						expect(obj.y).toBe(2);
						expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
						expect(obj.__proto__).toBe(obj); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj.z).toBe(3);
						expect(obj).toHaveDescriptorModifiersFor('z', true, true, true);
						expect(obj).toHavePrototype(Object.prototype);
					}
				});
			});
		});

		describe('null prototype object', () => {
			describe('non-circular', () => {
				itSerializesEqual('with no descriptor', {
					in() {
						const obj = Object.create(null);
						obj.__proto__ = {x: 1}; // eslint-disable-line no-proto
						return obj;
					},
					out: `(()=>{
						const a=Object;
						return a.defineProperty(
							a.create(null),
							"__proto__",
							{value:{x:1},writable:true,enumerable:true,configurable:true}
						)
					})()`,
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['__proto__']);
						expect(obj.__proto__).toEqual({x: 1}); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', true, true, true);
						expect(obj.x).toBeUndefined();
						expect(obj).toHavePrototype(null);
					}
				});

				itSerializesEqual('with descriptor', {
					in: () => Object.defineProperty(Object.create(null), '__proto__', {value: {x: 1}}),
					out: `(()=>{
						const a=Object;
						return a.defineProperty(a.create(null),"__proto__",{value:{x:1}})
					})()`,
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['__proto__']);
						expect(obj.__proto__).toEqual({x: 1}); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj.x).toBeUndefined();
						expect(obj).toHavePrototype(null);
					}
				});
			});

			describe('circular', () => {
				itSerializesEqual('with no descriptor', {
					in() {
						const obj = Object.create(null);
						obj.__proto__ = obj; // eslint-disable-line no-proto
						return obj;
					},
					out: `(()=>{
						const a=Object.create(null);
						a.__proto__=a;
						return a
					})()`,
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['__proto__']);
						expect(obj.__proto__).toBe(obj); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', true, true, true);
						expect(obj).toHavePrototype(null);
					}
				});

				itSerializesEqual('with descriptor', {
					in() {
						const obj = Object.create(null);
						Object.defineProperty(obj, '__proto__', {value: obj});
						return obj;
					},
					out: `(()=>{
						const a=Object,
							b=a.create(null);
						a.defineProperty(b,"__proto__",{value:b});
						return b
					})()`,
					validate(obj) {
						expect(obj).toBeObject();
						expect(obj).toHaveOwnPropertyNames(['__proto__']);
						expect(obj.__proto__).toBe(obj); // eslint-disable-line no-proto
						expect(obj).toHaveDescriptorModifiersFor('__proto__', false, false, false);
						expect(obj).toHavePrototype(null);
					}
				});
			});
		});
	});
});
