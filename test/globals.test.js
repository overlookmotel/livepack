/* --------------------
 * livepack module
 * Tests for globals
 * ------------------*/

'use strict';

// Module
const fs = require('fs'),
	parseNodeVersion = require('parse-node-version');

// Imports
const {itSerializesEqual, stripSourceMapComment} = require('./support/index.js');

// Tests

const itSerializesEqualIfNode12 = parseNodeVersion(process.version).major >= 12
	? itSerializesEqual
	: itSerializesEqual.skip;

// `globalThis` is not defined on Node v10
// eslint-disable-next-line node/no-unsupported-features/es-builtins
if (typeof globalThis === 'undefined') global.globalThis = global;

describe('Globals', () => {
	itSerializesEqual('`globalThis`', {
		in: () => global,
		out: 'globalThis',
		validate: _global => expect(_global).toBe(global)
	});

	describe('top level globals', () => {
		itSerializesEqual('single occurance', {
			in: () => Object,
			out: 'Object',
			validate: _Object => expect(_Object).toBe(Object)
		});

		itSerializesEqual('multiple occurances', {
			in: () => ({Object, Object2: Object, Object3: Object}),
			out: '(()=>{const a=Object;return{Object:a,Object2:a,Object3:a}})()',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['Object', 'Object2', 'Object3']);
				expect(obj.Object).toBe(Object);
				expect(obj.Object2).toBe(Object);
				expect(obj.Object3).toBe(Object);
			}
		});
	});

	describe('level 1 globals', () => {
		describe('are serialized', () => {
			itSerializesEqual('single occurance', {
				in: () => Object.assign,
				out: 'Object.assign',
				validate: assign => expect(assign).toBe(Object.assign)
			});

			itSerializesEqual('multiple occurances', {
				in: () => ({x: Object.assign, y: Object.assign, z: Object.assign}),
				out: '(()=>{const a=Object.assign;return{x:a,y:a,z:a}})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['x', 'y', 'z']);
					expect(obj.x).toBe(Object.assign);
					expect(obj.y).toBe(Object.assign);
					expect(obj.z).toBe(Object.assign);
				}
			});
		});

		itSerializesEqual('vars named with full path', {
			minify: true,
			inline: true,
			mangle: false,
			in: () => ({a: Object.assign, b: Object.assign}),
			validateOutput(obj, {outputJs}) {
				expect(stripSourceMapComment(outputJs))
					.toBe('(()=>{const ObjectAssign=Object.assign;return{a:ObjectAssign,b:ObjectAssign}})()');
			}
		});
	});

	describe('level 2 globals', () => {
		describe('are serialized', () => {
			itSerializesEqual('single occurance', {
				in: () => Array.prototype.slice,
				out: 'Array.prototype.slice',
				validate: slice => expect(slice).toBe(Array.prototype.slice)
			});

			itSerializesEqual('multiple occurances', {
				in() {
					const {slice} = Array.prototype;
					return {x: slice, y: slice, z: slice};
				},
				out: '(()=>{const a=Array.prototype.slice;return{x:a,y:a,z:a}})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['x', 'y', 'z']);
					const {slice} = Array.prototype;
					expect(obj.x).toBe(slice);
					expect(obj.y).toBe(slice);
					expect(obj.z).toBe(slice);
				}
			});
		});

		itSerializesEqual('vars named with full path', {
			minify: true,
			inline: true,
			mangle: false,
			in: () => ({a: Array.prototype.slice, b: Array.prototype.slice}),
			validateOutput(obj, {outputJs}) {
				expect(stripSourceMapComment(outputJs))
					.toBe('(()=>{const ArrayPrototypeSlice=Array.prototype.slice;return{a:ArrayPrototypeSlice,b:ArrayPrototypeSlice}})()');
			}
		});
	});

	describe('getter + setters', () => {
		itSerializesEqual('getter', {
			in: () => Object.getOwnPropertyDescriptor(fs, 'promises').get,
			out: 'Object.getOwnPropertyDescriptor(require("fs"),"promises").get',
			validate(fn, {isOutput, input}) {
				expect(fn).toBeFunction();
				if (isOutput) expect(fn).toBe(input);
			}
		});

		// Node v10 does not use setters for `fs.ReadStream` etc
		itSerializesEqualIfNode12('setter', {
			in: () => Object.getOwnPropertyDescriptor(fs, 'ReadStream').set,
			out: 'Object.getOwnPropertyDescriptor(require("fs"),"ReadStream").set',
			validate(fn, {isOutput, input}) {
				expect(fn).toBeFunction(); // eslint-disable-line jest/no-standalone-expect
				if (isOutput) expect(fn).toBe(input); // eslint-disable-line jest/no-standalone-expect
			}
		});
	});

	describe('values behind getters', () => {
		itSerializesEqual('fs.ReadStream', {
			in: () => fs.ReadStream,
			out: 'require("fs").ReadStream',
			validate: ReadStream => expect(ReadStream).toBe(fs.ReadStream)
		});

		itSerializesEqual('fs.WriteStream', {
			in: () => fs.WriteStream,
			out: 'require("fs").WriteStream',
			validate: WriteStream => expect(WriteStream).toBe(fs.WriteStream)
		});
	});

	describe('shimmed globals', () => {
		itSerializesEqual('Symbol', {
			in: () => Symbol,
			out: 'Symbol'
		});

		itSerializesEqual('Symbol.for', {
			in: () => Symbol.for,
			out: 'Symbol.for'
		});

		itSerializesEqual('Function.prototype.bind', {
			in: () => Function.prototype.bind,
			out: 'Function.prototype.bind'
		});
	});
});
