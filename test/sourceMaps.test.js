/* --------------------
 * livepack module
 * Tests for source maps
 * ------------------*/

/* eslint-disable global-require */

'use strict';

// Modules
const pathJoin = require('path').join,
	{readFileSync} = require('fs'),
	sourceMapFromComment = require('convert-source-map').fromComment,
	{SourceMapConsumer} = require('source-map'),
	serialize = require('livepack');

// Tests

describe('Source maps', () => {
	it('added inline if `files` option false', () => {
		const out = serialize(1, {sourceMaps: true, files: false});
		expect(out).toMatch(/^1\n\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,.+$/);
		expect(sourceMapFromComment(out).toObject()).toEqual({
			version: 3,
			sources: [],
			names: [],
			mappings: ''
		});
	});

	it('output separately if `files` option true', () => {
		const out = serialize(1, {sourceMaps: true, files: true});
		expect(out).toEqual([
			{
				filename: 'index.js',
				content: '1\n//# sourceMappingURL=index.js.map'
			},
			{
				filename: 'index.js.map',
				content: expect.stringMatching(/^\{.+\}$/)
			}
		]);
		const map = JSON.parse(out[1].content);
		expect(map).toEqual({
			version: 3,
			sources: [],
			names: [],
			mappings: ''
		});
	});

	it('reference sources with absolute paths if no `outputDir` option provided', () => {
		const path = pathJoin(__dirname, 'fixtures/source maps/simple/index.js');
		const originalContent = readFileSync(path, 'utf8');

		const input = require('./fixtures/source maps/simple/index.js');
		const out = serialize(input, {sourceMaps: true, files: true});
		expect(out).toEqual([
			{
				filename: 'index.js',
				content: 'function(){throw new Error("oops")}\n//# sourceMappingURL=index.js.map'
			},
			{
				filename: 'index.js.map',
				content: expect.stringMatching(/^\{.+\}$/)
			}
		]);

		const map = JSON.parse(out[1].content);
		expect(map).toEqual({
			version: 3,
			sources: [path],
			names: ['Error'],
			mappings: expect.stringMatching(/./),
			sourcesContent: [originalContent]
		});
	});

	it('reference sources with relative paths if `outputDir` option provided', () => {
		const srcDirPath = pathJoin(__dirname, 'fixtures/source maps/simple');
		const outputDirPath = pathJoin(srcDirPath, '../build');
		const originalContent = readFileSync(pathJoin(srcDirPath, 'index.js'), 'utf8');

		const input = require('./fixtures/source maps/simple/index.js');
		const out = serialize(input, {sourceMaps: true, files: true, outputDir: outputDirPath});
		expect(out).toEqual([
			{
				filename: 'index.js',
				content: 'function(){throw new Error("oops")}\n//# sourceMappingURL=index.js.map'
			},
			{
				filename: 'index.js.map',
				content: expect.stringMatching(/^\{.+\}$/)
			}
		]);

		const map = JSON.parse(out[1].content);
		expect(map).toEqual({
			version: 3,
			sources: ['../simple/index.js'],
			names: ['Error'],
			mappings: expect.stringMatching(/./),
			sourcesContent: [originalContent]
		});
	});

	it('maps error to correct point in source file', () => {
		const srcDirPath = pathJoin(__dirname, 'fixtures/source maps/simple');
		const outputDirPath = pathJoin(srcDirPath, '../build');

		const input = require('./fixtures/source maps/simple/index.js');
		const out = serialize(input, {sourceMaps: true, files: true, outputDir: outputDirPath});

		expect(out[0].content).toBe(
			'function(){throw new Error("oops")}\n//# sourceMappingURL=index.js.map'
		);

		const map = JSON.parse(out[1].content);
		const consumer = new SourceMapConsumer(map);
		expect(consumer.originalPositionFor({line: 1, column: 0})).toEqual({
			line: 3,
			column: 17,
			name: null,
			source: '../simple/index.js'
		});
		expect(consumer.originalPositionFor({line: 1, column: 21})).toEqual({
			line: 4,
			column: 11,
			name: 'Error',
			source: '../simple/index.js'
		});
	});

	describe('where source has existing source map, maps to correct point in original source file', () => {
		it('inline source map', () => {
			const srcDirPath = pathJoin(__dirname, 'fixtures/source maps/existing map/inline');
			const outputDirPath = pathJoin(srcDirPath, '../build');

			const input = require('./fixtures/source maps/existing map/inline/index.js');
			const out = serialize(input, {sourceMaps: true, files: true, outputDir: outputDirPath});

			expect(out[0].content).toBe(
				'(a=>function(){throw new Error(a)})("foo")\n//# sourceMappingURL=index.js.map'
			);

			const map = JSON.parse(out[1].content);
			const consumer = new SourceMapConsumer(map);
			expect(consumer.originalPositionFor({line: 1, column: 4})).toEqual({
				line: 4,
				column: 17,
				name: null,
				source: '../src.js'
			});
			expect(consumer.originalPositionFor({line: 1, column: 15})).toEqual({
				line: 4,
				column: 25,
				name: null,
				source: '../src.js'
			});
		});

		it('external source map', () => {
			const srcDirPath = pathJoin(__dirname, 'fixtures/source maps/existing map/external');
			const outputDirPath = pathJoin(srcDirPath, '../build');

			const input = require('./fixtures/source maps/existing map/external/index.js');
			const out = serialize(input, {sourceMaps: true, files: true, outputDir: outputDirPath});

			expect(out[0].content).toBe(
				'(a=>function(){throw new Error(a)})("foo")\n//# sourceMappingURL=index.js.map'
			);

			const map = JSON.parse(out[1].content);
			const consumer = new SourceMapConsumer(map);
			expect(consumer.originalPositionFor({line: 1, column: 4})).toEqual({
				line: 4,
				column: 17,
				name: null,
				source: '../src.js'
			});
			expect(consumer.originalPositionFor({line: 1, column: 15})).toEqual({
				line: 4,
				column: 25,
				name: null,
				source: '../src.js'
			});
		});
	});
});
