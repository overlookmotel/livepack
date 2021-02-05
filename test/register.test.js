/* --------------------
 * livepack module
 * Tests for `register()`
 * ------------------*/

'use strict';

// Modules
const Module = require('module');

// Imports
const {createFixturesFunctions} = require('./support/index.js');

const {serializeInNewProcess} = createFixturesFunctions(__filename);

// Tests

describe('register', () => {
	it('allows serializing functions', async () => {
		const js = await serializeInNewProcess(
			'const extA = 123;\n'
			+ 'module.exports = () => extA;'
		);
		expect(js).toBe('(a=>()=>a)(123)');
	});

	describe('allows serializing modules used internally in Babel', () => {
		const babelRegisterPath = require.resolve('@babel/register'),
			babelCorePath = resolveFrom('@babel/core', babelRegisterPath),
			babelTypesPath = resolveFrom('@babel/types', babelCorePath);

		it('lodash/cloneDeep', async () => {
			const path = resolveFrom('lodash/cloneDeep', babelRegisterPath);

			const js = await serializeInNewProcess(
				`module.exports = require(${JSON.stringify(path)});`
			);
			expect(js).toStartWith('(()=>{const a=function isObject(a){');
		});

		it('lodash/isPlainObject', async () => {
			const path = resolveFrom('lodash/isPlainObject', babelTypesPath);

			const js = await serializeInNewProcess(
				`module.exports = require(${JSON.stringify(path)});`
			);
			expect(js).toStartWith('(()=>{const a=Symbol.toStringTag,');
		});

		it('to-fast-properties', async () => {
			const path = resolveFrom('to-fast-properties', babelTypesPath);

			const js = await serializeInNewProcess(
				`module.exports = require(${JSON.stringify(path)});`
			);
			expect(js).toStartWith('(()=>{const a=((c,d)=>[');
		});

		it('convert-source-map', async () => {
			const path = resolveFrom('convert-source-map', babelCorePath);

			const js = await serializeInNewProcess(
				`module.exports = require(${JSON.stringify(path)});`
			);
			expect(js).toStartWith('(()=>{const a=void 0,b=(');
		});

		it('source-map', async () => {
			const path = resolveFrom('source-map', babelCorePath);

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

function resolveFrom(specifier, fromPath) {
	// TODO Remove `createRequireFromPath` fallback once support for Node < v12.2.0 is dropped
	// eslint-disable-next-line node/no-unsupported-features/node-builtins, node/no-deprecated-api
	const createRequire = Module.createRequire || Module.createRequireFromPath;
	return createRequire(fromPath).resolve(specifier);
}
