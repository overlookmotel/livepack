/* --------------------
 * livepack module
 * Tests for `register()`
 * ------------------*/

'use strict';

// Modules
const Module = require('module'),
	pathSep = require('path').sep;

// Imports
const {serializeInNewProcess} = require('./support/index.js');

// Tests

describe('register', () => {
	it('allows serializing functions', async () => {
		const js = await serializeInNewProcess(
			'const extA = 123;\n'
			+ 'module.exports = () => extA;'
		);
		expect(js).toBe('(a=>()=>a)(123)');
	});

	it('handles files with a hashbang', async () => {
		const js = await serializeInNewProcess(
			'#!/usr/bin/env node\n'
			+ 'const extA = 123;\n'
			+ 'module.exports = () => extA;'
		);
		expect(js).toBe('(a=>()=>a)(123)');
	});

	describe('allows serializing modules used internally in Livepack', () => {
		it('is-it-type', async () => {
			const js = await serializeInNewProcess(
				"module.exports = require('is-it-type').isType;"
			);
			expect(js).toBe(
				'(()=>{"use strict";return(c=>function isType(a,b){return c(b)===a})(function getType(a){return typeof a})})()'
			);
		});

		it('simple-invariant', async () => {
			const js = await serializeInNewProcess(
				"module.exports = require('simple-invariant');"
			);
			expect(js).toBe(
				'(e=>{"use strict";return d=>d=function invariant(a,b){if(!a){const c=new Error(b||e);Error.captureStackTrace(c,d);throw c}}})("Invariant failed")()'
			);
		});

		it('source-map', async () => {
			const js = await serializeInNewProcess(
				"module.exports = require('source-map');"
			);
			expect(js).toStartWith('(()=>{const a=(');
		});

		it('convert-source-map', async () => {
			const js = await serializeInNewProcess(
				'module.exports = require(\'convert-source-map\');'
			);
			expect(js).toStartWith('(()=>{"use strict";const a=(');
		});
	});

	describe('allows serializing modules used internally in Babel', () => {
		it('to-fast-properties', async () => {
			const path = resolveFrom('to-fast-properties', require.resolve('@babel/types'));

			const js = await serializeInNewProcess(
				`module.exports = require(${JSON.stringify(path)});`
			);
			expect(js).toStartWith('(()=>{const a=((c,d)=>{');
		});
	});

	it('exposes source-map-support', async () => {
		const js = await serializeInNewProcess({
			'index.js': [
				"require('./other.js');",
				"const {retrieveSourceMap} = require('source-map-support');",
				"const path = require.resolve('./other.js');",
				'module.exports = {path, map: retrieveSourceMap(path).map};'
			].join('\n'),
			'other.js': 'module.exports = function foo() {};'
		});

		const {path, map} = (0, eval)(`(${js})`); // eslint-disable-line no-eval
		expect(path.endsWith(`${pathSep}other.js`)).toBeTrue();
		expect(map.sources).toEqual([path]);
		// @babel/generator v7.21.0 introduced a bug where `names` includes vars which don't exist in source.
		// https://github.com/babel/babel/issues/15601
		// TODO: Remove this workaround once it's fixed.
		expect(map.names.filter(n => ['exports', 'foo', 'module'].includes(n)).sort())
			.toEqual(['exports', 'foo', 'module']);
		expect(map.sourcesContent).toEqual(['module.exports = function foo() {};']);
	});
});

function resolveFrom(specifier, fromPath) {
	return Module.createRequire(fromPath).resolve(specifier);
}
