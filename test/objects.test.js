/* --------------------
 * livepack module
 * Tests for objects
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Objects', ({expectSerializedEqual}) => {
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
});
