/* --------------------
 * livepack module
 * Tests for arrays
 * ------------------*/

'use strict';

// Imports
const {itSerializesEqual} = require('./support/index.js');

// Tests

describe('Arrays', () => {
	itSerializesEqual('empty array', {
		in: () => [],
		out: '[]'
	});

	describe('entries', () => {
		itSerializesEqual('one entry', {
			in: () => [1],
			out: '[1]'
		});

		itSerializesEqual('multiple entries', {
			in: () => [1, 2, 3],
			out: '[1,2,3]'
		});

		itSerializesEqual('sparse entries', {
			in({ctx}) {
				const arr = [, , 1, , , 2, , , 3]; // eslint-disable-line no-sparse-arrays
				arr.length = 11;
				ctx.input = arr;
				return arr;
			},
			out: '[,,1,,,2,,,3,,,]',
			validate(arr, {ctx: {input}}) {
				expect(arr).toBeArrayOfSize(11);

				for (let i = 0; i < arr.length; i++) {
					expect(i in arr).toBe(!!input[i]);
				}
			}
		});
	});

	describe('nested arrays', () => {
		itSerializesEqual('one nested array', {
			in: () => [[1], 2],
			out: '[[1],2]'
		});

		itSerializesEqual('multiple nested arrays', {
			in: () => [
				[1],
				[2],
				3
			],
			out: '[[1],[2],3]'
		});

		itSerializesEqual('multiple layers of nesting', {
			in: () => [
				[
					[
						[1, 2],
						[],
						3
					],
					[
						[4],
						5
					],
					[],
					6
				],
				[
					[
						[7, 8]
					],
					9
				]
			],
			out: '[[[[1,2],[],3],[[4],5],[],6],[[[7,8]],9]]'
		});

		describe('duplicated references', () => {
			itSerializesEqual('where nested before', {
				in() {
					const a = [1];
					return [
						[a],
						a,
						a
					];
				},
				out: '(()=>{const a=[1];return[[a],a,a]})()',
				validate(arr) {
					expect(arr[1]).toEqual([1]);
					expect(arr[2]).toBe(arr[1]);
					expect(arr[0][0]).toBe(arr[1]);
				}
			});

			itSerializesEqual('where nested after', {
				in() {
					const a = [1];
					return [
						a,
						a,
						[a]
					];
				},
				out: '(()=>{const a=[1];return[a,a,[a]]})()',
				validate(arr) {
					expect(arr[0]).toEqual([1]);
					expect(arr[1]).toBe(arr[0]);
					expect(arr[2][0]).toBe(arr[0]);
				}
			});
		});

		describe('circular references', () => {
			describe('direct', () => {
				itSerializesEqual('one level deep', {
					in() {
						const arr = [];
						arr[0] = arr;
						return arr;
					},
					out: '(()=>{const a=[];a[0]=a;return a})()',
					validate: arr => expect(arr[0]).toBe(arr)
				});

				itSerializesEqual('multiple levels deep', {
					in() {
						const arr = [[[]]];
						arr[0][0][0] = arr;
						return arr;
					},
					out: '(()=>{const a=[],b=[[a]];a[0]=b;return b})()',
					validate: arr => expect(arr[0][0][0]).toBe(arr)
				});
			});

			describe('inside another array', () => {
				itSerializesEqual('one level deep', {
					in() {
						const x = [];
						x[0] = x;
						return [x];
					},
					out: '(()=>{const a=[];a[0]=a;return[a]})()',
					validate: arr => expect(arr[0][0]).toBe(arr[0])
				});

				itSerializesEqual('multiple levels deep', {
					in() {
						const x = [[[]]];
						x[0][0][0] = x;
						return [x];
					},
					out: '(()=>{const a=[],b=[[a]];a[0]=b;return[b]})()',
					validate: arr => expect(arr[0][0][0][0]).toBe(arr[0])
				});
			});
		});
	});

	describe('extra properties', () => {
		describe('non-circular', () => {
			describe('without descriptors', () => {
				itSerializesEqual('string keys', {
					in() {
						const arr = [1, 2, 3];
						arr.x = 4;
						arr.y = 5;
						return arr;
					},
					out: 'Object.assign([1,2,3],{x:4,y:5})'
				});

				itSerializesEqual("including prop called '__proto__'", {
					in() {
						const arr = [1, 2, 3];
						arr.x = 4;
						Object.defineProperty(
							arr, '__proto__',
							{value: 5, writable: true, enumerable: true, configurable: true}
						);
						arr.y = 6;
						return arr;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperties;
						return b(
							a.defineProperty(
								b(
									[1,2,3],
									{x:{value:4,writable:true,enumerable:true,configurable:true}}
								),
								"__proto__",
								{value:5,writable:true,enumerable:true,configurable:true}
							),
							{y:{value:6,writable:true,enumerable:true,configurable:true}}
						)
					})()`,
					validate(arr) {
						expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', '__proto__', 'y']);
						expect(arr.x).toBe(4);
						expect(arr.__proto__).toBe(5); // eslint-disable-line no-proto
						expect(arr.y).toBe(6);
						expect(arr).toHaveDescriptorModifiersFor('x', true, true, true);
						expect(arr).toHaveDescriptorModifiersFor('__proto__', true, true, true);
						expect(arr).toHaveDescriptorModifiersFor('y', true, true, true);
					}
				});
			});

			describe('with descriptors', () => {
				itSerializesEqual('string keys', {
					in() {
						const arr = [1, 2, 3];
						Object.defineProperty(arr, 'x', {value: 4, enumerable: true});
						Object.defineProperty(arr, 'y', {value: 5, writable: true, configurable: true});
						return arr;
					},
					out: `Object.defineProperties(
						[1,2,3],
						{x:{value:4,enumerable:true},y:{value:5,writable:true,configurable:true}}
					)`,
					validate(arr) {
						expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', 'y']);
						expect(arr.x).toBe(4);
						expect(arr.y).toBe(5);
						expect(arr).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(arr).toHaveDescriptorModifiersFor('y', true, false, true);
					}
				});

				itSerializesEqual("including prop called '__proto__'", {
					in() {
						const arr = [1, 2, 3];
						Object.defineProperty(arr, 'x', {value: 4, enumerable: true});
						Object.defineProperty(arr, '__proto__', {value: 5, configurable: true});
						Object.defineProperty(arr, 'y', {value: 6, writable: true, configurable: true});
						return arr;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperties;
						return b(
							a.defineProperty(
								b([1,2,3],{x:{value:4,enumerable:true}}),
								"__proto__",
								{value:5,configurable:true}
							),
							{y:{value:6,writable:true,configurable:true}}
						)
					})()`,
					validate(arr) {
						expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', '__proto__', 'y']);
						expect(arr.x).toBe(4);
						expect(arr.__proto__).toBe(5); // eslint-disable-line no-proto
						expect(arr.y).toBe(6);
						expect(arr).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(arr).toHaveDescriptorModifiersFor('__proto__', false, false, true);
						expect(arr).toHaveDescriptorModifiersFor('y', true, false, true);
					}
				});
			});
		});

		describe('circular references', () => {
			describe('without descriptors', () => {
				itSerializesEqual('string keys', {
					in() {
						const arr = [1, 2, 3];
						arr.x = arr;
						arr.y = arr;
						return arr;
					},
					out: '(()=>{const a=[1,2,3];a.x=a;a.y=a;return a})()',
					validate(arr) {
						expect(arr.x).toBe(arr);
						expect(arr.y).toBe(arr);
					}
				});

				itSerializesEqual("including prop called '__proto__'", {
					in() {
						const arr = [1, 2, 3];
						arr.x = arr;
						Object.defineProperty(
							arr, '__proto__',
							{value: arr, writable: true, enumerable: true, configurable: true}
						);
						arr.y = 4;
						return arr;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperties,
							c=b(
								a.defineProperty(
									b([1,2,3],{x:{writable:true,enumerable:true,configurable:true}}),
									"__proto__",
									{writable:true,enumerable:true,configurable:true}
								),
								{y:{value:4,writable:true,enumerable:true,configurable:true}}
							);
						c.x=c;
						c.__proto__=c;
						return c
					})()`,
					validate(arr) {
						expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', '__proto__', 'y']);
						expect(arr.x).toBe(arr);
						expect(arr.__proto__).toBe(arr); // eslint-disable-line no-proto
						expect(arr.y).toBe(4);
						expect(arr).toHaveDescriptorModifiersFor('x', true, true, true);
						expect(arr).toHaveDescriptorModifiersFor('__proto__', true, true, true);
						expect(arr).toHaveDescriptorModifiersFor('y', true, true, true);
					}
				});
			});

			describe('with descriptors', () => {
				itSerializesEqual('string keys', {
					in() {
						const arr = [1, 2, 3];
						Object.defineProperty(arr, 'x', {value: arr, enumerable: true});
						Object.defineProperty(arr, 'y', {value: arr, writable: true, configurable: true});
						return arr;
					},
					out: `(()=>{
						const a=[1,2,3];
						Object.defineProperties(a,{
							x:{value:a,enumerable:true},
							y:{value:a,writable:true,configurable:true}
						});
						return a
					})()`,
					validate(arr) {
						expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', 'y']);
						expect(arr.x).toBe(arr);
						expect(arr.y).toBe(arr);
						expect(arr).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(arr).toHaveDescriptorModifiersFor('y', true, false, true);
					}
				});

				itSerializesEqual("including prop called '__proto__'", {
					in() {
						const arr = [1, 2, 3];
						Object.defineProperty(arr, 'x', {value: arr, enumerable: true});
						Object.defineProperty(arr, '__proto__', {value: arr, configurable: true});
						Object.defineProperty(arr, 'y', {value: 4, writable: true, configurable: true});
						return arr;
					},
					out: `(()=>{
						const a=Object,
							b=a.defineProperties,
							c=a.defineProperty,
							d=b(
								c(
									b([1,2,3],{x:{writable:true,enumerable:true,configurable:true}}),
									"__proto__",
									{writable:true,enumerable:true,configurable:true}
								),
								{y:{value:4,writable:true,configurable:true}}
							);
						c(
							b(d,{x:{value:d,writable:false,configurable:false}}),
							"__proto__",
							{value:d,writable:false,enumerable:false}
						);
						return d
					})()`,
					validate(arr) {
						expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', '__proto__', 'y']);
						expect(arr.x).toBe(arr);
						expect(arr.__proto__).toBe(arr); // eslint-disable-line no-proto
						expect(arr.y).toBe(4);
						expect(arr).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(arr).toHaveDescriptorModifiersFor('__proto__', false, false, true);
						expect(arr).toHaveDescriptorModifiersFor('y', true, false, true);
					}
				});
			});
		});
	});

	describe('descriptors', () => {
		describe('modifiers', () => {
			itSerializesEqual('non-circular', {
				in() {
					const arr = [1, 2, 3];
					Object.defineProperty(arr, 0, {writable: false});
					Object.defineProperty(arr, 1, {enumerable: false});
					Object.defineProperty(arr, 2, {configurable: false});
					return arr;
				},
				out: `Object.defineProperties(
					[1,2,3],
					{0:{writable:false},1:{enumerable:false},2:{configurable:false}}
				)`,
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					expect(arr[0]).toBe(1);
					expect(arr[1]).toBe(2);
					expect(arr[2]).toBe(3);
					expect(arr).toHaveDescriptorModifiersFor(0, false, true, true);
					expect(arr).toHaveDescriptorModifiersFor(1, true, false, true);
					expect(arr).toHaveDescriptorModifiersFor(2, true, true, false);
				}
			});

			itSerializesEqual('circular', {
				in() {
					const arr = [, 2]; // eslint-disable-line no-sparse-arrays
					Object.defineProperty(arr, 0, {value: arr, enumerable: true, configurable: true});
					arr[1] = 2;
					Object.defineProperty(arr, 2, {value: arr, writable: true, enumerable: true});
					return arr;
				},
				out: `(()=>{
					const a=[,2];
					Object.defineProperties(a,{
						0:{value:a,enumerable:true,configurable:true},
						2:{value:a,writable:true,enumerable:true}
					});
					return a
				})()`,
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					expect(arr).toEqual([arr, 2, arr]);
					expect(arr[0]).toBe(arr);
					expect(arr[2]).toBe(arr);
					expect(arr).toHaveDescriptorModifiersFor(0, false, true, true);
					expect(arr).toHaveDescriptorModifiersFor(1, true, true, true);
					expect(arr).toHaveDescriptorModifiersFor(2, true, true, false);
				}
			});
		});

		itSerializesEqual.skip('getters + setters', {
			in() {
				const arr = [1, 2, 3];
				Object.defineProperties(arr, {
					0: {get() { return 11; }, set(v) { this[1] = v * 2; }},
					2: {get() { return 33; }, set(v) { this[1] = v * 3; }}
				});
				return arr;
			},
			out: `Object.defineProperties(
				[,2],
				{
					0:{get(){return 11},set(a){this[1]=a*2},enumerable:true,configurable:true},
					2:{get(){return 33},set(a){this[1]=a*3},enumerable:true,configurable:true}
				}
			)`,
			validate(arr) {
				expect(arr).toBeArrayOfSize(3);
				expect(arr[0]).toBe(11);
				expect(arr[1]).toBe(2);
				expect(arr[2]).toBe(33);
				arr[0] = 2;
				expect(arr[1]).toBe(4);
				arr[2] = 2;
				expect(arr[1]).toBe(6);
				expect(Object.getOwnPropertyDescriptor(arr, 0).get).toBeFunction();
				expect(Object.getOwnPropertyDescriptor(arr, 0).set).toBeFunction();
				expect(Object.getOwnPropertyDescriptor(arr, 2).get).toBeFunction();
				expect(Object.getOwnPropertyDescriptor(arr, 2).set).toBeFunction();
				expect(arr).toHaveDescriptorModifiersFor(0, undefined, true, true);
				expect(arr).toHaveDescriptorModifiersFor(1, true, true, true);
				expect(arr).toHaveDescriptorModifiersFor(2, undefined, true, true);
			}
		});
	});

	describe('prototype altered', () => {
		describe('to null', () => {
			itSerializesEqual('with no extra properties', {
				in: () => Object.setPrototypeOf([1, 2, 3], null),
				out: 'Object.setPrototypeOf([1,2,3],null)',
				validate(arr) {
					expect(arr).toHavePrototype(null);
				}
			});

			itSerializesEqual("with extra properties including one named '__proto__'", {
				in() {
					const arr = [1, 2, 3];
					Object.setPrototypeOf(arr, null);
					arr.x = 4;
					arr.__proto__ = 5; // eslint-disable-line no-proto
					arr.y = 6;
					return arr;
				},
				out: `(()=>{
					const a=Object,
						b=a.defineProperties;
					return b(
						a.defineProperty(
							b(
								a.setPrototypeOf([1,2,3],null),
								{x:{value:4,writable:true,enumerable:true,configurable:true}}
							),
							"__proto__",
							{value:5,writable:true,enumerable:true,configurable:true}
						),
						{y:{value:6,writable:true,enumerable:true,configurable:true}}
					)
				})()`,
				validate(arr) {
					expect(arr).toHavePrototype(null);
					expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', '__proto__', 'y']);
					expect(arr.x).toBe(4);
					expect(arr.__proto__).toBe(5); // eslint-disable-line no-proto
					expect(arr.y).toBe(6);
					expect(arr).toHaveDescriptorModifiersFor('x', true, true, true);
					expect(arr).toHaveDescriptorModifiersFor('__proto__', true, true, true);
					expect(arr).toHaveDescriptorModifiersFor('y', true, true, true);
				}
			});

			itSerializesEqual("with extra circular properties including one named '__proto__'", {
				in() {
					const arr = [1, 2, 3];
					Object.setPrototypeOf(arr, null);
					arr.x = arr;
					arr.__proto__ = arr; // eslint-disable-line no-proto
					arr.y = 4;
					return arr;
				},
				out: `(()=>{
					const a=Object,
						b=a.defineProperties,
						c=b(
							a.defineProperty(
								b(
									a.setPrototypeOf([1,2,3],null),
									{x:{writable:true,enumerable:true,configurable:true}}
								),
								"__proto__",
								{writable:true,enumerable:true,configurable:true}
							),
							{y:{value:4,writable:true,enumerable:true,configurable:true}});
					c.x=c;
					c.__proto__=c;
					return c
				})()`,
				validate(arr) {
					expect(arr).toHavePrototype(null);
					expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', '__proto__', 'y']);
					expect(arr.x).toBe(arr);
					expect(arr.__proto__).toBe(arr); // eslint-disable-line no-proto
					expect(arr.y).toBe(4);
					expect(arr).toHaveDescriptorModifiersFor('x', true, true, true);
					expect(arr).toHaveDescriptorModifiersFor('__proto__', true, true, true);
					expect(arr).toHaveDescriptorModifiersFor('y', true, true, true);
				}
			});
		});

		describe('to Object.prototype', () => {
			itSerializesEqual('with no extra properties', {
				in: () => Object.setPrototypeOf([1, 2, 3], Object.prototype),
				out: '(()=>{const a=Object;return a.setPrototypeOf([1,2,3],a.prototype)})()',
				validate(arr) {
					expect(arr).toHavePrototype(Object.prototype);
				}
			});

			itSerializesEqual("with extra properties including one named '__proto__'", {
				in() {
					const arr = [1, 2, 3];
					Object.setPrototypeOf(arr, Object.prototype);
					arr.x = 4;
					Object.defineProperty(
						arr, '__proto__',
						{value: arr, writable: true, enumerable: true, configurable: true}
					);
					arr.__proto__ = 5; // eslint-disable-line no-proto
					arr.y = 6;
					return arr;
				},
				out: `(()=>{
					const a=Object,
						b=a.defineProperties;
					return b(
						a.defineProperty(
							b(
								a.setPrototypeOf([1,2,3],a.prototype),
								{x:{value:4,writable:true,enumerable:true,configurable:true}}
							),
							"__proto__",
							{value:5,writable:true,enumerable:true,configurable:true}
						),
						{y:{value:6,writable:true,enumerable:true,configurable:true}}
					)
				})()`,
				validate(arr) {
					expect(arr).toHavePrototype(Object.prototype);
					expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', '__proto__', 'y']);
					expect(arr.x).toBe(4);
					expect(arr.__proto__).toBe(5); // eslint-disable-line no-proto
					expect(arr.y).toBe(6);
					expect(arr).toHaveDescriptorModifiersFor('x', true, true, true);
					expect(arr).toHaveDescriptorModifiersFor('__proto__', true, true, true);
					expect(arr).toHaveDescriptorModifiersFor('y', true, true, true);
				}
			});

			itSerializesEqual("with extra circular properties including one named '__proto__'", {
				in() {
					const arr = [1, 2, 3];
					Object.setPrototypeOf(arr, Object.prototype);
					arr.x = arr;
					Object.defineProperty(
						arr, '__proto__',
						{value: arr, writable: true, enumerable: true, configurable: true}
					);
					arr.y = 4;
					return arr;
				},
				out: `(()=>{
					const a=Object,
						b=a.defineProperties,
						c=b(
							a.defineProperty(
								b(
									a.setPrototypeOf([1,2,3],a.prototype),
									{x:{writable:true,enumerable:true,configurable:true}}
								),
								"__proto__",
								{writable:true,enumerable:true,configurable:true}
							),
							{y:{value:4,writable:true,enumerable:true,configurable:true}}
						);
					c.x=c;
					c.__proto__=c;
					return c
				})()`,
				validate(arr) {
					expect(arr).toHavePrototype(Object.prototype);
					expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', '__proto__', 'y']);
					expect(arr.x).toBe(arr);
					expect(arr.__proto__).toBe(arr); // eslint-disable-line no-proto
					expect(arr.y).toBe(4);
					expect(arr).toHaveDescriptorModifiersFor('x', true, true, true);
					expect(arr).toHaveDescriptorModifiersFor('__proto__', true, true, true);
					expect(arr).toHaveDescriptorModifiersFor('y', true, true, true);
				}
			});
		});
	});

	describe.skip('array subclass', () => {
		itSerializesEqual('empty array', {
			in() {
				class A extends Array {}
				return new A();
			},
			out: `(()=>{
				const a=Object.setPrototypeOf,
					b=Array,
					c=(b=>b=class A{
						constructor(...a){return Reflect.construct(Object.getPrototypeOf(b),a,b)}
					})(),
					d=c.prototype;
				a(c,b);
				a(d,b.prototype);
				return a([],d)
			})()`,
			validate(arr) {
				expect(arr).toBeArrayOfSize(0);
				const proto = Object.getPrototypeOf(arr);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('A');
				expect(proto).toHavePrototype(Array.prototype);
				arr[0] = 123;
				expect(arr).toHaveLength(1);
			}
		});

		itSerializesEqual('non-circular entries', {
			in() {
				class A extends Array {}
				return new A(1, 2, 3);
			},
			out: `(()=>{
				const a=Object.setPrototypeOf,
					b=Array,
					c=(b=>b=class A{
						constructor(...a){return Reflect.construct(Object.getPrototypeOf(b),a,b)}
					})(),
					d=c.prototype;
				a(c,b);
				a(d,b.prototype);
				return a([1,2,3],d)
			})()`,
			validate(arr) {
				expect(arr).toBeArrayOfSize(3);
				expect(arr).toEqual([1, 2, 3]);
				const proto = Object.getPrototypeOf(arr);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('A');
				expect(proto).toHavePrototype(Array.prototype);
				arr[3] = 123;
				expect(arr).toHaveLength(4);
			}
		});

		itSerializesEqual('circular entries', {
			in() {
				class A extends Array {}
				const arr = new A();
				arr[0] = arr;
				arr[1] = 2;
				arr[2] = arr;
				return arr;
			},
			out: `(()=>{
				const a=Object.setPrototypeOf,
					b=Array,
					c=(b=>b=class A{
						constructor(...a){return Reflect.construct(Object.getPrototypeOf(b),a,b)}
					})(),
					d=c.prototype,
					e=a([,2],d);
				a(c,b);
				a(d,b.prototype);
				e[0]=e;
				e[2]=e;
				return e
			})()`,
			validate(arr) {
				expect(arr).toBeArrayOfSize(3);
				expect(arr[0]).toBe(arr);
				expect(arr[1]).toBe(2);
				expect(arr[2]).toBe(arr);
				const proto = Object.getPrototypeOf(arr);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('A');
				expect(proto).toHavePrototype(Array.prototype);
				arr[3] = 123;
				expect(arr).toHaveLength(4);
			}
		});
	});
});
