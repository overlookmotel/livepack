/* --------------------
 * livepack module
 * Tests for globals
 * ------------------*/

'use strict';

// Module
const fs = require('fs'),
	parseNodeVersion = require('parse-node-version');

// Imports
const {describeWithAllOptions, stripSourceMapComment} = require('./support/index.js');

// Tests

const itIfNode12Plus = parseNodeVersion(process.version).major > 10 ? it : it.skip;

// `globalThis` is not defined on Node v10
// eslint-disable-next-line node/no-unsupported-features/es-builtins
if (typeof globalThis === 'undefined') global.globalThis = global;

describeWithAllOptions('Globals', ({expectSerializedEqual, run, serialize, minify, mangle, inline}) => {
	it('`globalThis`', () => {
		expectSerializedEqual(global, 'globalThis', (res) => {
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
				expect(stripSourceMapComment(js))
					.toBe('(()=>{const ObjectAssign=Object.assign;return{a:ObjectAssign,b:ObjectAssign}})()');
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
				expect(stripSourceMapComment(js)).toBe('(()=>{const ArrayPrototypeSlice=Array.prototype.slice;return{a:ArrayPrototypeSlice,b:ArrayPrototypeSlice}})()');
			});
		}
	});

	describe('getter + setters', () => {
		it('getter', () => {
			const input = Object.getOwnPropertyDescriptor(fs, 'promises').get;
			run(
				input,
				'Object.getOwnPropertyDescriptor(require("fs"),"promises").get',
				(fn) => {
					expect(fn).toBeFunction();
					expect(fn).toBe(input);
				}
			);
		});

		// Node v10 does not use setters for `fs.ReadStream` etc
		itIfNode12Plus('setter', () => {
			const input = Object.getOwnPropertyDescriptor(fs, 'ReadStream').set;
			run(
				input,
				'Object.getOwnPropertyDescriptor(require("fs"),"ReadStream").set',
				(fn) => {
					expect(fn).toBeFunction(); // eslint-disable-line jest/no-standalone-expect
					expect(fn).toBe(input); // eslint-disable-line jest/no-standalone-expect
				}
			);
		});
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
