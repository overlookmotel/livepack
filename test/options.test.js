/* --------------------
 * livepack module
 * Tests for options
 * ------------------*/

'use strict';

// Modules
const serialize = require('livepack');

// Tests

describe('Options', () => {
	describe('format', () => {
		it('default', () => {
			expect(serialize(1)).toBe('1');
		});

		it('js', () => {
			expect(serialize(1)).toBe('1');
		});

		it('cjs', () => {
			expect(serialize(1, {format: 'cjs'})).toBe('module.exports=1');
		});

		it('esm', () => {
			expect(serialize(1, {format: 'esm'})).toBe('export default 1');
		});
	});

	describe('minify', () => {
		it('default', () => {
			expect(serialize({a: 1})).toBe('{a:1}');
		});

		it('true', () => {
			expect(serialize({a: 1}, {minify: true})).toBe('{a:1}');
		});

		it('false', () => {
			expect(serialize({a: 1}, {minify: false, inline: true})).toBe('{\n  a: 1\n}\n');
		});
	});

	describe('inline', () => {
		it('default', () => {
			expect(serialize({a: {b: 1}})).toBe('{a:{b:1}}');
		});

		it('true', () => {
			expect(serialize({a: {b: 1}}, {inline: true})).toBe('{a:{b:1}}');
		});

		it('false', () => {
			expect(serialize({a: {b: 1}}, {inline: false})).toBe('(()=>{const a={b:1},b={a};return b})()');
		});
	});

	describe('mangle', () => {
		let input;
		beforeEach(() => {
			const foo = {};
			input = {foo, foo2: foo};
		});

		it('default', () => {
			expect(serialize(input)).toBe('(()=>{const a={};return{foo:a,foo2:a}})()');
		});

		it('true', () => {
			expect(serialize(input, {mangle: true})).toBe('(()=>{const a={};return{foo:a,foo2:a}})()');
		});

		it('false', () => {
			expect(serialize(input, {mangle: false})).toBe('(()=>{const foo={};return{foo,foo2:foo}})()');
		});
	});

	describe('comments', () => {
		const input = (0, () => { /* foobar */ });

		it('default', () => {
			expect(serialize(input)).toBe('()=>{}');
		});

		it('false', () => {
			expect(serialize(input, {comments: false})).toBe('()=>{}');
		});

		it('true', () => {
			expect(serialize(input, {comments: true})).toBe('()=>{/* foobar */}');
		});
	});

	describe('files', () => {
		const input = (0, function(x) { return x + 10; });

		it('default', () => {
			expect(serialize(input)).toBe('function(a){return a+10}');
		});

		it('false', () => {
			expect(serialize(input, {files: false})).toBe('function(a){return a+10}');
		});

		describe('true', () => {
			it('without source maps', () => {
				const out = serialize(input, {files: true});
				expect(out).toBeArrayOfSize(1);
				expect(out[0]).toEqual({
					filename: 'index.js',
					content: 'function(a){return a+10}'
				});
			});

			it('with source maps', () => {
				const out = serialize(input, {files: true, sourceMaps: true});
				expect(out).toBeArrayOfSize(2);
				expect(out[0]).toEqual({
					filename: 'index.js',
					content: 'function(a){return a+10}\n//# sourceMappingURL=index.js.map'
				});
				expect(out[1]).toBeObject();
				expect(out[1]).toContainKeys(['filename', 'content']);
				expect(out[1].filename).toBe('index.js.map');
				expect(out[1].content).toBeString();
			});
		});
	});

	describe('shouldPrintComment', () => {
		function input(
			// single in params
			/* block in params */
			/*
			multi-line
			in params
			*/
			x
		) {
			// single in body
			/* block in body */
			/*
			multi-line
			in body
			*/
			return x;
		}

		it('default removes all comments', () => {
			expect(serialize(input)).toBe('function input(a){return a}');
		});

		describe('does not remove comments which `shouldPrintComment()` returns true for', () => {
			it('single line comments', () => {
				expect(
					serialize(input, {shouldPrintComment: comment => /single/.test(comment)})
				).toBe('function input(// single in params\na){// single in body\nreturn a}');
			});

			it('block comments', () => {
				expect(
					serialize(input, {shouldPrintComment: comment => /block/.test(comment)})
				).toBe('function input(/* block in params */a){/* block in body */return a}');
			});

			it('multi-line block comments', () => {
				expect(
					serialize(input, {shouldPrintComment: comment => /multi/.test(comment)})
						.replace(/\n\s+/g, '\n')
				).toBe('function input(/*\nmulti-line\nin params\n*/a){/*\nmulti-line\nin body\n*/return a}');
			});
		});
	});
});
