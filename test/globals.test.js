/* --------------------
 * livepack module
 * Tests for globals
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Globals', ({expectSerializedEqual, serialize, minify, mangle, inline}) => {
	it('`global`', () => {
		expectSerializedEqual(global, 'global', (res) => {
			expect(res).toBe(global);
		});
	});

	describe('top level globals', () => {
		it('single occurance', () => {
			expectSerializedEqual(Object, 'Object', (res) => {
				expect(res).toBe(Object);
			});
		});

		it('multiple occurances', () => {
			expectSerializedEqual(
				{Object, Object2: Object, Object3: Object},
				'(()=>{const a=Object;return{Object:a,Object2:a,Object3:a}})()',
				(res) => {
					expect(res).toBeObject();
					expect(res).toContainAllKeys(['Object', 'Object2', 'Object3']);
					expect(res.Object).toBe(Object);
					expect(res.Object2).toBe(Object);
					expect(res.Object3).toBe(Object);
				}
			);
		});
	});

	describe('level 1 globals', () => {
		describe('are serialized', () => {
			it('single occurance', () => {
				expectSerializedEqual(Object.assign, 'Object.assign', (res) => {
					expect(res).toBe(Object.assign);
				});
			});

			it('multiple occurances', () => {
				expectSerializedEqual(
					{x: Object.assign, y: Object.assign, z: Object.assign},
					'(()=>{const a=Object.assign;return{x:a,y:a,z:a}})()',
					(res) => {
						expect(res).toBeObject();
						expect(res).toContainAllKeys(['x', 'y', 'z']);
						expect(res.x).toBe(Object.assign);
						expect(res.y).toBe(Object.assign);
						expect(res.z).toBe(Object.assign);
					}
				);
			});
		});

		if (minify && !mangle && inline) {
			it('vars named with full path', () => {
				const js = serialize({a: Object.assign, b: Object.assign});
				expect(js).toBe(
					'(()=>{const ObjectAssign=Object.assign;return{a:ObjectAssign,b:ObjectAssign}})()'
				);
			});
		}
	});

	describe('level 2 globals', () => {
		describe('are serialized', () => {
			it('single occurance', () => {
				expectSerializedEqual(Array.prototype.slice, 'Array.prototype.slice', (res) => {
					expect(res).toBe(Array.prototype.slice);
				});
			});

			it('multiple occurances', () => {
				const {slice} = Array.prototype;
				expectSerializedEqual(
					{x: slice, y: slice, z: slice},
					'(()=>{const a=Array.prototype.slice;return{x:a,y:a,z:a}})()',
					(res) => {
						expect(res).toBeObject();
						expect(res).toContainAllKeys(['x', 'y', 'z']);
						expect(res.x).toBe(slice);
						expect(res.y).toBe(slice);
						expect(res.z).toBe(slice);
					}
				);
			});
		});

		if (minify && !mangle && inline) {
			it('vars named with full path', () => {
				const {slice} = Array.prototype;
				const js = serialize({a: slice, b: slice});
				expect(js).toBe(
					'(()=>{const ArrayPrototypeSlice=Array.prototype.slice;return{a:ArrayPrototypeSlice,b:ArrayPrototypeSlice}})()'
				);
			});
		}
	});

	describe('shimmed globals', () => {
		it('Symbol', () => { // eslint-disable-line jest/lowercase-name
			expectSerializedEqual(Symbol, 'Symbol');
		});

		it('Symbol.for', () => { // eslint-disable-line jest/lowercase-name
			expectSerializedEqual(Symbol.for, 'Symbol.for');
		});

		it('Function.prototype.bind', () => { // eslint-disable-line jest/lowercase-name
			expectSerializedEqual(Function.prototype.bind, 'Function.prototype.bind');
		});
	});
});
