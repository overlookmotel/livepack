/* --------------------
 * livepack module
 * Tests for CJS format
 * ------------------*/

'use strict';

// Imports
const {itSerializesEqual, stripSourceMapComment} = require('./support/index.js');

// Tests

describe.skip('CJS output format', () => {
	itSerializesEqual('protects `module` var', {
		in: () => ({module: {a: 1}}),
		format: 'cjs',
		out: 'module.exports={module:{a:1}}',
		validateOutput(obj, {outputJs, minify, inline, mangle}) {
			if (minify && !inline && !mangle) {
				expect(stripSourceMapComment(outputJs))
					.toBe('const module$0={a:1},index={module:module$0};module.exports=index');
			}
		}
	});

	itSerializesEqual('protects `exports` var', {
		in: () => ({exports: {a: 1}}),
		format: 'cjs',
		out: 'module.exports={exports:{a:1}}',
		validateOutput(obj, {outputJs, minify, inline, mangle}) {
			if (minify && !inline && !mangle) {
				expect(stripSourceMapComment(outputJs))
					.toBe('const exports$0={a:1},index={exports:exports$0};module.exports=index');
			}
		}
	});

	itSerializesEqual('protects `require` var', {
		in: () => ({require: {a: 1}}),
		format: 'cjs',
		out: 'module.exports={require:{a:1}}',
		validateOutput(obj, {outputJs, minify, inline, mangle}) {
			if (minify && !inline && !mangle) {
				expect(stripSourceMapComment(outputJs))
					.toBe('const require$0={a:1},index={require:require$0};module.exports=index');
			}
		}
	});

	itSerializesEqual('protects `__dirname` var', {
		in: () => ({__dirname: {a: 1}}),
		format: 'cjs',
		out: 'module.exports={__dirname:{a:1}}',
		validateOutput(obj, {outputJs, minify, inline, mangle}) {
			if (minify && !inline && !mangle) {
				expect(stripSourceMapComment(outputJs))
					.toBe('const __dirname$0={a:1},index={__dirname:__dirname$0};module.exports=index');
			}
		}
	});

	itSerializesEqual('protects `__filename` var', {
		in: () => ({__filename: {a: 1}}),
		format: 'cjs',
		out: 'module.exports={__filename:{a:1}}',
		validateOutput(obj, {outputJs, minify, inline, mangle}) {
			if (minify && !inline && !mangle) {
				expect(stripSourceMapComment(outputJs))
					.toBe('const __filename$0={a:1},index={__filename:__filename$0};module.exports=index');
			}
		}
	});
});
