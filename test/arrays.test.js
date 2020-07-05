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
						expect(Object.getOwnPropertyNames(arr)).toEqual(['0', '1', '2', 'length', 'x', 'y']);
						expect(Object.getOwnPropertyDescriptor(arr, 'x')).toEqual({
							value: 4, writable: false, enumerable: true, configurable: false
						});
						expect(Object.getOwnPropertyDescriptor(arr, 'y')).toEqual({
							value: 5, writable: true, enumerable: false, configurable: true
						});
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
					expect(arr.x).toBe(arr);
					expect(arr.y).toBe(arr);
					expect(Object.getOwnPropertyNames(arr)).toEqual(['0', '1', '2', 'length', 'x', 'y']);
					expect(Object.getOwnPropertyDescriptor(arr, 'x')).toEqual({
						value: arr, writable: false, enumerable: true, configurable: false
					});
					expect(Object.getOwnPropertyDescriptor(arr, 'y')).toEqual({
						value: arr, writable: true, enumerable: false, configurable: true
					});
				});
			});
		});
	});
});
