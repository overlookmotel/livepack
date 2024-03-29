/* --------------------
 * livepack module
 * Tests for source maps
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	sourceMapFromComment = require('convert-source-map').fromComment,
	{SourceMapConsumer} = require('source-map'),
	{transformSync} = require('@babel/core'),
	{serialize} = require('livepack');

// Imports
const {withFixtures} = require('./support/index.js');

// Tests

describe('Source maps', () => {
	it("output inline if `sourceMaps` option 'inline'", () => {
		const out = serialize(1, {sourceMaps: 'inline'});
		expect(out).toMatch(/^1\n\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,.+$/);
		expect(sourceMapFromComment(out).toObject()).toEqual({
			version: 3,
			names: [],
			sources: [],
			sourcesContent: [],
			mappings: ''
		});
	});

	it('output separately if `sourceMaps` option true', () => {
		const out = serialize(1, {sourceMaps: true, files: true});
		expect(out).toEqual([
			{
				type: 'entry',
				name: 'index',
				filename: 'index.js',
				content: '1\n//# sourceMappingURL=index.js.map'
			},
			{
				type: 'source map',
				name: null,
				filename: 'index.js.map',
				content: expect.stringMatching(/^\{.+\}$/)
			}
		]);
		const map = JSON.parse(out[1].content);
		expect(map).toEqual({
			version: 3,
			names: [],
			sources: [],
			sourcesContent: [],
			mappings: ''
		});
	});

	it('reference sources with absolute paths if no `outputDir` option provided', () => {
		const code = 'module.exports = function() {};\n';
		withFixtures(code, (fn, {path}) => {
			const out = serialize(fn, {sourceMaps: true, files: true});
			expect(out).toEqual([
				{
					type: 'entry',
					name: 'index',
					filename: 'index.js',
					content: 'function(){}\n//# sourceMappingURL=index.js.map'
				},
				{
					type: 'source map',
					name: null,
					filename: 'index.js.map',
					content: expect.stringMatching(/^\{.+\}$/)
				}
			]);

			const map = JSON.parse(out[1].content);
			expect(map).toEqual({
				version: 3,
				names: [],
				sources: [path],
				sourcesContent: [code],
				mappings: expect.stringMatching(/./)
			});
		});
	});

	it('reference sources with relative paths if `outputDir` option provided', () => {
		const code = 'module.exports = function() {};\n';
		withFixtures(code, (fn, {path}) => {
			const outputDirPath = pathJoin(path, '../build');
			const out = serialize(fn, {sourceMaps: true, files: true, outputDir: outputDirPath});
			expect(out).toEqual([
				{
					type: 'entry',
					name: 'index',
					filename: 'index.js',
					content: 'function(){}\n//# sourceMappingURL=index.js.map'
				},
				{
					type: 'source map',
					name: null,
					filename: 'index.js.map',
					content: expect.stringMatching(/^\{.+\}$/)
				}
			]);

			const map = JSON.parse(out[1].content);
			expect(map).toEqual({
				version: 3,
				sources: ['../index.js'],
				names: [],
				mappings: expect.stringMatching(/./),
				sourcesContent: [code]
			});
		});
	});

	it('maps error to correct point in source file', () => {
		const code = "\n\nmodule.exports = function() {\n\tthrow new Error('oops');\n};\n";
		withFixtures(code, (fn, {path}) => {
			const outputDirPath = pathJoin(path, '../build');
			const out = serialize(fn, {sourceMaps: true, files: true, outputDir: outputDirPath});

			expect(out).toEqual([
				{
					type: 'entry',
					name: 'index',
					filename: 'index.js',
					content: 'function(){throw new Error("oops")}\n//# sourceMappingURL=index.js.map'
				},
				{
					type: 'source map',
					name: null,
					filename: 'index.js.map',
					content: expect.stringMatching(/^\{.+\}$/)
				}
			]);

			const map = JSON.parse(out[1].content);
			const consumer = new SourceMapConsumer(map);
			expect(consumer.originalPositionFor({line: 1, column: 0})).toEqual({
				line: 3,
				column: 17,
				name: null,
				source: '../index.js'
			});
			expect(consumer.originalPositionFor({line: 1, column: 21})).toEqual({
				line: 4,
				column: 11,
				name: 'Error',
				source: '../index.js'
			});
		});
	});

	describe('where source has existing source map, maps to correct point in original source file', () => {
		it('inline source map', () => {
			const srcCode = "const message = 'foo';\nmodule.exports = () => { throw new Error(message); };";

			const {code} = transformSync(srcCode, {
				plugins: ['@babel/plugin-transform-strict-mode', '@babel/plugin-transform-arrow-functions'],
				sourceMaps: 'inline',
				filename: 'src.js'
			});

			expect(code).toStartWith([
				'"use strict";',
				'',
				"const message = 'foo';",
				'module.exports = function () {',
				'  throw new Error(message);',
				'};',
				'//# sourceMappingURL=data:application/json;charset=utf-8;base64,'
			].join('\n'));

			withFixtures(code, (fn, {path}) => {
				const outputDirPath = pathJoin(path, '../build');
				const out = serialize(
					fn, {sourceMaps: true, files: true, outputDir: outputDirPath, strictEnv: true}
				);

				expect(out).toEqual([
					{
						type: 'entry',
						name: 'index',
						filename: 'index.js',
						content: '(a=>function(){throw new Error(a)})("foo")\n//# sourceMappingURL=index.js.map'
					},
					{
						type: 'source map',
						name: null,
						filename: 'index.js.map',
						content: expect.stringMatching(/^\{.+\}$/)
					}
				]);

				const map = JSON.parse(out[1].content);
				expect(map).toEqual({
					version: 3,
					names: ['Error', 'message'],
					sources: ['../src.js', '../index.js'],
					sourcesContent: [srcCode, code],
					mappings: 'IACiB,UCEY,CDFJ,KAAM,IAAI,CAAAA,KAAK,CAACC,CAAO,CCAG,CDAC'
				});

				const consumer = new SourceMapConsumer(map);
				expect(consumer.originalPositionFor({line: 1, column: 4})).toEqual({
					line: 2,
					column: 17,
					name: null,
					source: '../src.js'
				});
				expect(consumer.originalPositionFor({line: 1, column: 15})).toEqual({
					line: 2,
					column: 25,
					name: null,
					source: '../src.js'
				});
			});
		});

		it('external source map', () => {
			const srcCode = "const message = 'foo';\nmodule.exports = () => { throw new Error(message); };";

			const res = transformSync(srcCode, {
				plugins: ['@babel/plugin-transform-strict-mode', '@babel/plugin-transform-arrow-functions'],
				sourceMaps: true,
				filename: 'src.js'
			});

			// Have to add source map comment manually as Babel doesn't when not run from CLI
			// https://github.com/babel/babel/issues/5261
			const code = `${res.code}\n\n//# sourceMappingURL=intermediate.js.map`;

			expect(code).toBe([
				'"use strict";',
				'',
				"const message = 'foo';",
				'module.exports = function () {',
				'  throw new Error(message);',
				'};',
				'',
				'//# sourceMappingURL=intermediate.js.map'
			].join('\n'));

			withFixtures(
				{
					'intermediate.js': code,
					'intermediate.js.map': JSON.stringify(res.map)
				},
				(fn, {path}) => {
					const outputDirPath = pathJoin(path, '../build');
					const out = serialize(
						fn, {sourceMaps: true, files: true, outputDir: outputDirPath, strictEnv: true}
					);

					expect(out).toEqual([
						{
							type: 'entry',
							name: 'index',
							filename: 'index.js',
							content: '(a=>function(){throw new Error(a)})("foo")\n//# sourceMappingURL=index.js.map'
						},
						{
							type: 'source map',
							name: null,
							filename: 'index.js.map',
							content: expect.stringMatching(/^\{.+\}$/)
						}
					]);

					const map = JSON.parse(out[1].content);
					expect(map).toEqual({
						version: 3,
						names: ['Error', 'message'],
						sources: ['../src.js', '../intermediate.js'],
						sourcesContent: [srcCode, code],
						mappings: 'IACiB,UCEY,CDFJ,KAAM,IAAI,CAAAA,KAAK,CAACC,CAAO,CCAG,CDAC'
					});

					const consumer = new SourceMapConsumer(map);
					expect(consumer.originalPositionFor({line: 1, column: 4})).toEqual({
						line: 2,
						column: 17,
						name: null,
						source: '../src.js'
					});
					expect(consumer.originalPositionFor({line: 1, column: 15})).toEqual({
						line: 2,
						column: 25,
						name: null,
						source: '../src.js'
					});
				}
			);
		});
	});
});
