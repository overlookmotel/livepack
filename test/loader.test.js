/* --------------------
 * livepack module
 * Tests for loader
 * ------------------*/

'use strict';

// Imports
const {createFixturesFunctions} = require('./support/index.js');

const {serializeInNewProcess} = createFixturesFunctions(__filename);

// Tests

describe('Loader', () => {
	describe('loads entry point', () => {
		describe('as CommonJS if', () => {
			it('`.cjs` extension', async () => {
				const js = await serializeInNewProcess({
					'index.cjs': "require('./imported.cjs')",
					'imported.cjs': 'module.exports = __filename'
				});
				expect(js).toEndWith('imported.cjs"');
			});

			it('`.js` extension and no package.json type field', async () => {
				const js = await serializeInNewProcess({
					'index.js': "require('./imported.js')",
					'imported.js': 'module.exports = __filename'
				});
				expect(js).toEndWith('imported.js"');
			});

			it('`.js` extension and package.json type field = commonjs', async () => {
				const js = await serializeInNewProcess({
					'index.js': "require('./imported.js')",
					'imported.js': 'module.exports = __filename',
					'package.json': '{"type": "commonjs"}'
				});
				expect(js).toEndWith('imported.js"');
			});
		});

		describe('as ESM if', () => {
			it('`.mjs` extension', async () => {
				const js = await serializeInNewProcess({
					'index.mjs': `
							import x from './imported.mjs';
							x
						`,
					'imported.mjs': 'export default import.meta.url'
				}, {esm: true});
				expect(js).toEndWith('imported.mjs"');
			});

			it('`.js` extension and package.json type field = module', async () => {
				const js = await serializeInNewProcess({
					'index.js': `
							import x from './imported.js';
							x
						`,
					'imported.js': 'export default import.meta.url',
					'package.json': '{"type": "module"}'
				}, {esm: true});
				expect(js).toEndWith('imported.js"');
			});
		});
	});

	describe('functions in entry points can be serialized', () => {
		it('CommonJS', async () => { // eslint-disable-line jest/lowercase-name
			const js = await serializeInNewProcess(`
				const extA = 123;
				() => extA
			`);
			expect(js).toBe('(a=>()=>a)(123)');
		});

		it('ESM', async () => { // eslint-disable-line jest/lowercase-name
			const js = await serializeInNewProcess({
				'index.mjs': `
					const extA = 123;
					() => extA
				`
			}, {esm: true});
			expect(js).toBe('(a=>{"use strict";return()=>a})(123)');
		});
	});

	// TODO Tests for `jsx` option
	// TODO Tests for `configFile` option
	// TODO Tests for `babelrc` option
	// TODO Tests for `shouldIgnorePath` option
});
