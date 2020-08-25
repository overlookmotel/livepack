/* --------------------
 * livepack module
 * Tests for arrays
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Arrays', ({expectSerializedEqual}) => {
	it('empty array', () => {
		expectSerializedEqual([], '[]');
	});

	describe('entries', () => {
		it('one entry', () => {
			expectSerializedEqual([1], '[1]');
		});

		it('multiple entries', () => {
			expectSerializedEqual([1, 2, 3], '[1,2,3]');
		});

		it('sparse entries', () => {
			const input = [, , 1, , , 2, , , 3]; // eslint-disable-line no-sparse-arrays
			input.length = 11;

			const output = expectSerializedEqual(input, '[,,1,,,2,,,3,,,]');
			expect(output).toBeArrayOfSize(11);

			for (let i = 0; i < input.length; i++) {
				expect(i in output).toBe(!!input[i]);
			}
		});
	});

	describe('nested arrays', () => {
		it('one nested array', () => {
			expectSerializedEqual([
				[1],
				2
			], '[[1],2]');
		});

		it('multiple nested arrays', () => {
			expectSerializedEqual([
				[1],
				[2],
				3
			], '[[1],[2],3]');
		});

		it('multiple layers of nesting', () => {
			expectSerializedEqual([
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
			], '[[[[1,2],[],3],[[4],5],[],6],[[[7,8]],9]]');
		});

		describe('duplicated references', () => {
			it('where nested before', () => {
				const a = [1];
				const input = [
					[a],
					a,
					a
				];
				const output = expectSerializedEqual(input, '(()=>{const a=[1];return[[a],a,a]})()');
				expect(output[1]).toEqual(a);
				expect(output[2]).toBe(output[1]);
				expect(output[0][0]).toBe(output[1]);
			});

			it('where nested after', () => {
				const a = [1];
				const input = [
					a,
					a,
					[a]
				];
				const output = expectSerializedEqual(input, '(()=>{const a=[1];return[a,a,[a]]})()');
				expect(output[0]).toEqual(a);
				expect(output[1]).toBe(output[0]);
				expect(output[2][0]).toBe(output[0]);
			});
		});

		describe('circular references', () => {
			describe('direct', () => {
				it('one level deep', () => {
					const input = [];
					input[0] = input;

					const output = expectSerializedEqual(input, '(()=>{const a=[];a[0]=a;return a})()');
					expect(output[0]).toBe(output);
				});

				it('multiple levels deep', () => {
					const input = [[[]]];
					input[0][0][0] = input;

					const output = expectSerializedEqual(input, '(()=>{const a=[],b=[[a]];a[0]=b;return b})()');
					expect(output[0][0][0]).toBe(output);
				});
			});

			describe('inside another array', () => {
				it('one level deep', () => {
					const a = [];
					a[0] = a;
					const input = [a];

					const output = expectSerializedEqual(input, '(()=>{const a=[];a[0]=a;return[a]})()');
					expect(output[0][0]).toBe(output[0]);
				});

				it('multiple levels deep', () => {
					const a = [[[]]];
					a[0][0][0] = a;
					const input = [a];

					const output = expectSerializedEqual(input, '(()=>{const a=[],b=[[a]];a[0]=b;return[b]})()');
					expect(output[0][0][0][0]).toBe(output[0]);
				});
			});
		});
	});

	describe('extra properties', () => {
		describe('non-circular', () => {
			it('without descriptors', () => {
				const input = [1, 2, 3];
				input.x = 4;
				input.y = 5;
				expectSerializedEqual(input, 'Object.assign([1,2,3],{x:4,y:5})');
			});

			it('with descriptors', () => {
				const input = [1, 2, 3];
				Object.defineProperty(input, 'x', {value: 4, enumerable: true});
				Object.defineProperty(input, 'y', {value: 5, writable: true, configurable: true});
				expectSerializedEqual(
					input,
					'Object.defineProperties([1,2,3],{x:{value:4,enumerable:true},y:{value:5,writable:true,configurable:true}})',
					(arr) => {
						expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', 'y']);
						expect(arr.x).toBe(4);
						expect(arr.y).toBe(5);
						expect(arr).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(arr).toHaveDescriptorModifiersFor('y', true, false, true);
					}
				);
			});
		});

		describe('circular references', () => {
			it('without descriptors', () => {
				const input = [1, 2, 3];
				input.x = input;
				input.y = input;
				expectSerializedEqual(input, '(()=>{const a=[1,2,3];a.x=a;a.y=a;return a})()', (arr) => {
					expect(arr.x).toBe(arr);
					expect(arr.y).toBe(arr);
				});
			});

			it('with descriptors', () => {
				const input = [1, 2, 3];
				Object.defineProperty(input, 'x', {value: input, enumerable: true});
				Object.defineProperty(input, 'y', {value: input, writable: true, configurable: true});
				expectSerializedEqual(input, null, (arr) => {
					expect(arr).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'x', 'y']);
					expect(arr.x).toBe(arr);
					expect(arr.y).toBe(arr);
					expect(arr).toHaveDescriptorModifiersFor('x', false, true, false);
					expect(arr).toHaveDescriptorModifiersFor('y', true, false, true);
				});
			});
		});
	});

	describe('descriptors', () => {
		describe('modifiers', () => {
			it('non-circular', () => {
				const input = [1, 2, 3];
				Object.defineProperty(input, 0, {writable: false});
				Object.defineProperty(input, 1, {enumerable: false});
				Object.defineProperty(input, 2, {configurable: false});
				expectSerializedEqual(
					input,
					'Object.defineProperties([1,2,3],{0:{writable:false},1:{enumerable:false},2:{configurable:false}})',
					(arr) => {
						expect(arr).toBeArrayOfSize(3);
						expect(arr).toEqual([1, 2, 3]);
						expect(arr).toHaveDescriptorModifiersFor(0, false, true, true);
						expect(arr).toHaveDescriptorModifiersFor(1, true, false, true);
						expect(arr).toHaveDescriptorModifiersFor(2, true, true, false);
					}
				);
			});

			it('circular', () => {
				const input = [, 2]; // eslint-disable-line no-sparse-arrays
				Object.defineProperty(input, 0, {value: input, enumerable: true, configurable: true});
				input[1] = 2;
				Object.defineProperty(input, 2, {value: input, writable: true, enumerable: true});
				expectSerializedEqual(
					input,
					'(()=>{const a=[,2];Object.defineProperties(a,{0:{value:a,enumerable:true,configurable:true},2:{value:a,writable:true,enumerable:true}});return a})()',
					(arr) => {
						expect(arr).toBeArrayOfSize(3);
						expect(arr).toEqual([arr, 2, arr]);
						expect(arr[0]).toBe(arr);
						expect(arr[2]).toBe(arr);
						expect(arr).toHaveDescriptorModifiersFor(0, false, true, true);
						expect(arr).toHaveDescriptorModifiersFor(1, true, true, true);
						expect(arr).toHaveDescriptorModifiersFor(2, true, true, false);
					}
				);
			});
		});

		it('getters + setters', () => {
			const input = [1, 2, 3];
			Object.defineProperties(input, {
				0: {get() { return 11; }, set(v) { this[1] = v * 2; }},
				2: {get() { return 33; }, set(v) { this[1] = v * 3; }}
			});
			expectSerializedEqual(
				input,
				'Object.defineProperties([,2],{0:{get(){return 11},set(a){this[1]=a*2},enumerable:true,configurable:true},2:{get(){return 33},set(a){this[1]=a*3},enumerable:true,configurable:true}})',
				(arr) => {
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
			);
		});
	});

	describe('Array subclass', () => {
		it('empty array', () => {
			class A extends Array {}
			expectSerializedEqual(
				new A(),
				'(()=>{const a=Object.setPrototypeOf,b=Array,c=a(class A{constructor(...a){return Reflect.construct(Object.getPrototypeOf(A),a,A)}},b).prototype;a(c,b.prototype);return a([],c)})()',
				(arr) => {
					expect(arr).toBeArrayOfSize(0);
					const proto = Object.getPrototypeOf(arr);
					expect(proto.constructor).toBeFunction();
					expect(proto.constructor.name).toBe('A');
					expect(proto).toHavePrototype(Array.prototype);
					arr[0] = 123;
					expect(arr).toHaveLength(1);
				}
			);
		});

		it('non-circular entries', () => {
			class A extends Array {}
			expectSerializedEqual(
				new A(1, 2, 3),
				'(()=>{const a=Object.setPrototypeOf,b=Array,c=a(class A{constructor(...a){return Reflect.construct(Object.getPrototypeOf(A),a,A)}},b).prototype;a(c,b.prototype);return a([1,2,3],c)})()',
				(arr) => {
					expect(arr).toBeArrayOfSize(3);
					expect(arr).toEqual([1, 2, 3]);
					const proto = Object.getPrototypeOf(arr);
					expect(proto.constructor).toBeFunction();
					expect(proto.constructor.name).toBe('A');
					expect(proto).toHavePrototype(Array.prototype);
					arr[3] = 123;
					expect(arr).toHaveLength(4);
				}
			);
		});

		it('circular entries', () => {
			class A extends Array {}
			const input = new A();
			input[0] = input;
			input[1] = 2;
			input[2] = input;

			expectSerializedEqual(
				input,
				'(()=>{const a=Object.setPrototypeOf,b=Array,c=a(class A{constructor(...a){return Reflect.construct(Object.getPrototypeOf(A),a,A)}},b).prototype,d=a([,2],c);a(c,b.prototype);d[0]=d;d[2]=d;return d})()',
				(arr) => {
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
			);
		});
	});
});
