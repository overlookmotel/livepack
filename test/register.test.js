/* --------------------
 * livepack module
 * Tests for `register()`
 * ------------------*/

'use strict';

// Modules
const {createRequire} = require('module');

// Imports
const {createFixturesFunctions} = require('./support/index.js');

const {serializeInNewProcess} = createFixturesFunctions(__filename);

// Tests

describe.skip('register', () => { // eslint-disable-line jest/no-disabled-tests
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
				'(d=>{"use strict";return function invariant(a,b){if(!a){const c=new Error(b||d);Error.captureStackTrace(c,invariant);throw c}}})("Invariant failed")'
			);
		});
	});

	describe('allows serializing modules used internally in Babel', () => {
		const babelRegisterPath = require.resolve('@babel/register'),
			babelCorePath = createRequire(babelRegisterPath).resolve('@babel/core'),
			babelTypesPath = createRequire(babelCorePath).resolve('@babel/types');

		it('to-fast-properties', async () => {
			const path = createRequire(babelTypesPath).resolve('to-fast-properties');

			const js = await serializeInNewProcess(
				`module.exports = require(${JSON.stringify(path)});`
			);
			expect(js).toStartWith('(()=>{const a=((c,d)=>{');
		});

		it('convert-source-map', async () => {
			const path = createRequire(babelCorePath).resolve('convert-source-map');

			const js = await serializeInNewProcess(
				`module.exports = require(${JSON.stringify(path)});`
			);
			expect(js).toStartWith('(()=>{"use strict";const a=(');
		});

		it('source-map', async () => {
			const path = createRequire(babelCorePath).resolve('source-map');

			const js = await serializeInNewProcess(
				`module.exports = require(${JSON.stringify(path)});`
			);
			expect(js).toStartWith('(()=>{const a=function urlGenerate(a){');
		});
	});

	it('exposes source-map-support', async () => {
		const js = await serializeInNewProcess({
			'index.js': [
				"require('./other.js');",
				"const {retrieveSourceMap} = require('source-map-support');",
				"module.exports = retrieveSourceMap(require.resolve('./other.js'));"
			].join('\n'),
			'other.js': 'module.exports = function foo() {};'
		});

		const {map} = (0, eval)(`(${js})`); // eslint-disable-line no-eval
		expect(map.sources).toEqual(['other.js']);
		expect(map.names).toEqual(['module', 'exports', 'foo']);
		expect(map.sourcesContent).toEqual(['module.exports = function foo() {};']);
	});
});
