/* --------------------
 * livepack module
 * Tests for loader
 * ------------------*/

'use strict';

// Modules
const {createRequire} = require('module'),
	parseNodeVersion = require('parse-node-version'),
	{serialize} = require('livepack');

// Imports
const {itSerializes, createFixturesFunctions, tryCatch} = require('./support/index.js');

const {importFixtures, createFixture, createFixtures} = createFixturesFunctions(__filename);

const isTopLevelAwaitSupported = (() => {
	const {major, minor} = parseNodeVersion(process.version);
	return major > 14 || (major === 14 && minor >= 3);
})();
const itSerializesIfTopLevelAwaitSupported = isTopLevelAwaitSupported ? itSerializes : itSerializes.skip;

// Tests

describe('Loader', () => {
	describe('loads', () => {
		describe('ESM from ESM', () => { // eslint-disable-line jest/lowercase-name
			itSerializes('with static import', {
				in: () => importFixtures({
					'index.mjs': `
						import def, {x, y} from './imported.mjs';
						export default {def, x, y};
					`,
					'imported.mjs': `
						export default {zz: 3};
						export const x = {xx: 1}, y = {yy: 2};
					`
				}),
				out: '{def:{zz:3},x:{xx:1},y:{yy:2}}',
				validate(obj) {
					expect(obj).toEqual({def: {zz: 3}, x: {xx: 1}, y: {yy: 2}});
				}
			});

			itSerializes('with dynamic import', {
				in: () => importFixtures({
					'index.mjs': `
						export default (async () => {
							const mod = await import('./imported.mjs');
							return {def: mod.default, x: mod.x, y: mod.y};
						})()
					`,
					'imported.mjs': `
						export default {zz: 3};
						export const x = {xx: 1}, y = {yy: 2};
					`
				}),
				out: '{def:{zz:3},x:{xx:1},y:{yy:2}}',
				validate(obj) {
					expect(obj).toEqual({def: {zz: 3}, x: {xx: 1}, y: {yy: 2}});
				}
			});
		});

		describe('CommonJS from ESM', () => { // eslint-disable-line jest/lowercase-name
			itSerializes('with static import', {
				in: () => importFixtures({
					'index.mjs': `
						import def, {x, y} from './imported.js';
						export default {def, x, y}
					`,
					'imported.js': `
						exports.x = {xx: 1};
						exports.y = {yy: 2};
					`
				}),
				out: '(()=>{const a={xx:1},b={yy:2};return{def:{x:a,y:b},x:a,y:b}})()',
				validate(obj) {
					expect(obj).toEqual({
						def: {x: {xx: 1}, y: {yy: 2}},
						x: {xx: 1},
						y: {yy: 2}
					});
					expect(obj.def.x).toBe(obj.x);
					expect(obj.def.y).toBe(obj.y);
				}
			});

			itSerializes('with dynamic import', {
				in: () => importFixtures({
					'index.mjs': `
						export default (async () => {
							const mod = await import('./imported.js');
							return {def: mod.default, x: mod.x, y: mod.y};
						})()
					`,
					'imported.js': `
						exports.x = {xx: 1};
						exports.y = {yy: 2};
					`
				}),
				out: '(()=>{const a={xx:1},b={yy:2};return{def:{x:a,y:b},x:a,y:b}})()',
				validate(obj) {
					expect(obj).toEqual({
						def: {x: {xx: 1}, y: {yy: 2}},
						x: {xx: 1},
						y: {yy: 2}
					});
					expect(obj.def.x).toBe(obj.x);
					expect(obj.def.y).toBe(obj.y);
				}
			});

			itSerializes('with require', {
				in: () => importFixtures({
					'index.mjs': `
						import {createRequire} from 'module';
						const require = createRequire(import.meta.url);
						export default require('./imported.js')
					`,
					'imported.js': `
						exports.x = {xx: 1};
						exports.y = {yy: 2};
					`
				}),
				out: '{x:{xx:1},y:{yy:2}}',
				validate(obj) {
					expect(obj).toEqual({x: {xx: 1}, y: {yy: 2}});
				}
			});
		});

		describe('ESM from CommonJS', () => { // eslint-disable-line jest/lowercase-name
			itSerializes('with dynamic import', {
				in: () => importFixtures({
					'index.js': `
						module.exports = (async () => {
							const mod = await import('./imported.mjs');
							return {def: mod.default, x: mod.x, y: mod.y};
						})()
					`,
					'imported.mjs': `
						export default {zz: 3};
						export const x = {xx: 1}, y = {yy: 2};
					`
				}),
				out: '{def:{zz:3},x:{xx:1},y:{yy:2}}',
				validate(obj) {
					expect(obj).toEqual({def: {zz: 3}, x: {xx: 1}, y: {yy: 2}});
				}
			});
		});

		describe('CommonJS from CommonJS', () => { // eslint-disable-line jest/lowercase-name
			itSerializes('with dynamic import', {
				in: () => importFixtures({
					'index.js': `
						module.exports = (async () => {
							const mod = await import('./imported.js');
							return {def: mod.default, x: mod.x, y: mod.y};
						})()
					`,
					'imported.js': `
						exports.x = {xx: 1};
						exports.y = {yy: 2};
					`
				}),
				out: '(()=>{const a={xx:1},b={yy:2};return{def:{x:a,y:b},x:a,y:b}})()',
				validate(obj) {
					expect(obj).toEqual({
						def: {x: {xx: 1}, y: {yy: 2}},
						x: {xx: 1},
						y: {yy: 2}
					});
					expect(obj.def.x).toBe(obj.x);
					expect(obj.def.y).toBe(obj.y);
				}
			});

			itSerializes('with require', {
				in: () => importFixtures({
					'index.js': "module.exports = require('./imported.js')",
					'imported.js': `
						exports.x = {xx: 1};
						exports.y = {yy: 2};
					`
				}),
				out: '{x:{xx:1},y:{yy:2}}',
				validate(obj) {
					expect(obj).toEqual({x: {xx: 1}, y: {yy: 2}});
				}
			});
		});
	});

	describe('functions are', () => {
		itSerializes('sloppy mode in CommonJS files', {
			in: () => importFixtures({
				'index.js': 'module.exports = () => delete Object.prototype;'
			}),
			strictEnv: false,
			out: '()=>delete Object.prototype',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBeFalse();
			}
		});

		itSerializes('strict mode in ESM files', {
			in: () => importFixtures({
				'index.mjs': 'export default (0, () => delete Object.prototype);'
			}),
			strictEnv: false,
			out: '()=>{"use strict";return delete Object.prototype}',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn).toThrowWithMessage(
					TypeError, "Cannot delete property 'prototype' of function Object() { [native code] }"
				);
			}
		});
	});

	itSerializes('`require()` produces same object for same file', {
		in: () => importFixtures({
			'index.js': `
				module.exports = {
					imported: require('./imported.js'),
					imported2: require('./imported.js'),
					intermediate: require('./intermediate.js')
				};
			`,
			'intermediate.js': "module.exports = require('./imported.js');",
			'imported.js': 'module.exports = {x: 1};'
		}),
		out: '(()=>{const a={x:1};return{imported:a,imported2:a,intermediate:a}})()',
		validate(obj) {
			expect(obj).toEqual({
				imported: {x: 1},
				imported2: {x: 1},
				intermediate: {x: 1}
			});
			expect(obj.imported2).toBe(obj.imported);
			expect(obj.intermediate).toBe(obj.imported);
		}
	});

	itSerializesIfTopLevelAwaitSupported('ESM supports top-level await', {
		in: () => importFixtures({
			'index.mjs': `
				const v = {x: await Promise.resolve(1)};
				export default v
			`
		}),
		out: '{x:1}',
		validate: v => expect(v).toEqual({x: 1})
	});

	itSerializes('`import()` shim calls `.toString()` on specifier only once', {
		in: () => importFixtures({
			'index.mjs': `
				export default (async () => {
					let counter = 0;
					const specifier = {
						toString() {
							counter++;
							return './imported.mjs';
						}
					};
					const mod = await import(specifier);
					return counter;
				})()
			`,
			'imported.mjs': 'export default 1;'
		}),
		out: '1',
		validate(counter) {
			expect(counter).toBe(1);
		}
	});

	describe('allows serializing modules used internally in Livepack', () => {
		itSerializes('is-it-type', {
			in: () => require('is-it-type').isType, // eslint-disable-line global-require
			out: '(c=>function isType(a,b){return c(b)===a})(function getType(a){return typeof a})',
			validate(isType) {
				expect(isType).toBeFunction();
				expect(isType('string', 'abc')).toBeTrue();
			}
		});

		itSerializes('simple-invariant', {
			in: () => require('simple-invariant'), // eslint-disable-line global-require
			out: '(d=>function invariant(a,b){if(!a){const c=new Error(b||d);Error.captureStackTrace(c,invariant);throw c}})("Invariant failed")',
			validate(invariant) {
				expect(invariant).toBeFunction();
				expect(invariant(true)).toBeUndefined();
				expect(() => invariant(false)).toThrowWithMessage(Error, 'Invariant failed');
			}
		});
	});

	describe('allows serializing modules used internally in Babel', () => {
		const babelRegisterPath = require.resolve('@babel/register'),
			babelCorePath = createRequire(babelRegisterPath).resolve('@babel/core'),
			babelTypesPath = createRequire(babelCorePath).resolve('@babel/types');

		it('to-fast-properties', () => {
			const js = serialize(createRequire(babelTypesPath)('to-fast-properties'));
			expect(js).toStartWith('(()=>{const a=((c,d)=>{');
		});

		it('convert-source-map', () => {
			const js = serialize(createRequire(babelCorePath)('convert-source-map'));
			expect(js).toStartWith('(()=>{"use strict";const a=(');
		});

		it('source-map', () => {
			const js = serialize(createRequire(babelCorePath)('source-map'));
			expect(js).toStartWith('(()=>{const a=function urlGenerate(a){');
		});
	});

	describe('source maps', () => {
		describe('can be retrieved from source-map-support for', () => {
			const {retrieveSourceMap} = require('source-map-support'); // eslint-disable-line global-require

			it('CommonJS', () => { // eslint-disable-line jest/lowercase-name
				const srcPath = createFixture('module.exports = function foo() {};', 'index.js');
				require(srcPath); // eslint-disable-line global-require, import/no-dynamic-require

				const {map} = retrieveSourceMap(srcPath);
				expect(map.sources).toEqual(['index.js']);
				expect(map.names).toEqual(['module', 'exports', 'foo']);
				expect(map.sourcesContent).toEqual(['module.exports = function foo() {};']);
			});

			it('ESM', async () => { // eslint-disable-line jest/lowercase-name
				const srcPath = createFixture('export default function foo() {};', 'index.mjs');
				await import(srcPath);

				const {map} = retrieveSourceMap(srcPath);
				expect(map.sources).toEqual(['index.mjs']);
				expect(map.names).toEqual(['foo']);
				expect(map.sourcesContent).toEqual(['export default function foo() {};']);
			});
		});

		describe('used in stack traces for', () => {
			describe('CommonJS loaded with', () => { // eslint-disable-line jest/lowercase-name
				const fileContent = "module.exports = () => { throw new Error('oops'); };";

				it('require', () => { // eslint-disable-line jest/expect-expect
					const srcPath = createFixture(fileContent, 'index.js');
					const fn = require(srcPath); // eslint-disable-line global-require, import/no-dynamic-require
					expectCorrectStackTrace(fn, srcPath);
				});

				it('static import', async () => { // eslint-disable-line jest/expect-expect
					const srcPaths = createFixtures({
						'index.mjs': "import fn from './imported.js'; export default fn;",
						'imported.js': fileContent
					});
					const fn = (await import(srcPaths['index.mjs'])).default;
					expectCorrectStackTrace(fn, srcPaths['imported.js']);
				});

				it('dynamic import from CommonJS', async () => { // eslint-disable-line jest/expect-expect
					const srcPath = createFixture(fileContent, 'index.js');
					const fn = (await import(srcPath)).default;
					expectCorrectStackTrace(fn, srcPath);
				});

				it('dynamic import from ESM', async () => { // eslint-disable-line jest/expect-expect
					const srcPaths = createFixtures({
						'index.mjs': "export default import('./imported.js');",
						'imported.js': fileContent
					});
					const fn = (await (await import(srcPaths['index.mjs'])).default).default;
					expectCorrectStackTrace(fn, srcPaths['imported.js']);
				});
			});

			describe('ESM loaded with', () => { // eslint-disable-line jest/lowercase-name
				const fileContent = "export default (xx) => { throw new Error('oops'); };";

				it('static import', async () => { // eslint-disable-line jest/expect-expect
					const srcPaths = createFixtures({
						'index.mjs': "import fn from './imported.mjs'; export default fn;",
						'imported.mjs': fileContent
					});
					const fn = (await import(srcPaths['index.mjs'])).default;
					expectCorrectStackTrace(fn, srcPaths['imported.mjs']);
				});

				it('dynamic import from CommonJS', async () => { // eslint-disable-line jest/expect-expect
					const srcPath = createFixture(fileContent, 'index.mjs');
					const fn = (await import(srcPath)).default;
					expectCorrectStackTrace(fn, srcPath);
				});

				it('dynamic import from ESM', async () => { // eslint-disable-line jest/expect-expect
					const srcPaths = createFixtures({
						'index.mjs': "export default import('./imported.mjs');",
						'imported.mjs': fileContent
					});
					const fn = (await (await import(srcPaths['index.mjs'])).default).default;
					expectCorrectStackTrace(fn, srcPaths['imported.mjs']);
				});
			});

			function expectCorrectStackTrace(fn, path) {
				const err = tryCatch(() => fn());
				expect(err).toBeInstanceOf(Error);
				expect(err.stack).toBeString();
				const stackLines = err.stack.split(/\r?\n/);
				expect(stackLines[0]).toBe('Error: oops');
				expect(stackLines[1].trim()).toBe(`at fn (${path}:1:32)`);
			}
		});
	});
});
