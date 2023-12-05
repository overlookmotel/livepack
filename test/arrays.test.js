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
			itSerializesEqual('without descriptors', {
				in() {
					const arr = [1, 2, 3];
					arr.x = 4;
					arr.y = 5;
					return arr;
				},
				out: 'Object.assign([1,2,3],{x:4,y:5})'
			});

			itSerializesEqual('with descriptors', {
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
		});

		describe('circular references', () => {
			itSerializesEqual('without descriptors', {
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

			itSerializesEqual('with descriptors', {
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

		itSerializesEqual('getters + setters', {
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

	describe('array subclass', () => {
		itSerializesEqual('empty array', {
			in() {
				class A extends Array {}
				return new A();
			},
			out: `(()=>{
				const a=Object.setPrototypeOf,
					b=Array,
					c=a(class A extends null{},b).prototype;
				a(c,b.prototype);
				return a([],c)
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
					c=a(class A extends null{},b).prototype;
				a(c,b.prototype);
				return a([1,2,3],c)
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
					c=a(class A extends null{},b).prototype,
					d=a([,2],c);
				a(c,b.prototype);
				d[0]=d;
				d[2]=d;
				return d
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
