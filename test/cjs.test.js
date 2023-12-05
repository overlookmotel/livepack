/* --------------------
 * livepack module
 * Tests for CJS format
 * ------------------*/

'use strict';

// Imports
const {itSerializesEqual, stripSourceMapComment} = require('./support/index.js');

// Tests

describe('CJS output format', () => {
	itSerializesEqual('protects `module` var', {
		in() {
			const module = {a: 1};
			return {module, module2: module};
		},
		format: 'cjs',
		out: 'const a={a:1};module.exports={module:a,module2:a}',
		validateOutput(obj, {outputJs, minify, mangle}) {
			if (minify && !mangle) {
				expect(stripSourceMapComment(outputJs))
					.toBe('const module$0={a:1};module.exports={module:module$0,module2:module$0}');
			}
		}
	});

	itSerializesEqual('protects `exports` var', {
		in() {
			const exports = {a: 1};
			return {exports, exports2: exports};
		},
		format: 'cjs',
		out: 'const a={a:1};module.exports={exports:a,exports2:a}',
		validateOutput(obj, {outputJs, minify, mangle}) {
			if (minify && !mangle) {
				expect(stripSourceMapComment(outputJs))
					.toBe('const exports$0={a:1};module.exports={exports:exports$0,exports2:exports$0}');
			}
		}
	});

	itSerializesEqual('protects `require` var', {
		in() {
			const require = {a: 1};
			return {require, require2: require};
		},
		format: 'cjs',
		out: 'const a={a:1};module.exports={require:a,require2:a}',
		validateOutput(obj, {outputJs, minify, mangle}) {
			if (minify && !mangle) {
				expect(stripSourceMapComment(outputJs))
					.toBe('const require$0={a:1};module.exports={require:require$0,require2:require$0}');
			}
		}
	});

	itSerializesEqual('protects `__dirname` var', {
		in() {
			const __dirname = {a: 1};
			return {__dirname, __dirname2: __dirname};
		},
		format: 'cjs',
		out: 'const a={a:1};module.exports={__dirname:a,__dirname2:a}',
		validateOutput(obj, {outputJs, minify, mangle}) {
			if (minify && !mangle) {
				expect(stripSourceMapComment(outputJs))
					.toBe('const __dirname$0={a:1};module.exports={__dirname:__dirname$0,__dirname2:__dirname$0}');
			}
		}
	});

	itSerializesEqual('protects `__filename` var', {
		in() {
			const __filename = {a: 1};
			return {__filename, __filename2: __filename};
		},
		format: 'cjs',
		out: 'const a={a:1};module.exports={__filename:a,__filename2:a}',
		validateOutput(obj, {outputJs, minify, mangle}) {
			if (minify && !mangle) {
				expect(stripSourceMapComment(outputJs)).toBe(
					'const __filename$0={a:1};module.exports={__filename:__filename$0,__filename2:__filename$0}'
				);
			}
		}
	});
});
