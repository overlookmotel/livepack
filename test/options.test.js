/* --------------------
 * livepack module
 * Tests for options
 * ------------------*/

'use strict';

// Modules
const {serialize} = require('livepack');

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

	describe('exec', () => {
		it('default', () => {
			const fn = (0, function() { console.log('foo'); }); // eslint-disable-line no-console
			expect(serialize(fn)).toBe('function(){console.log("foo")}');
		});

		it('false', () => {
			const fn = (0, function() { console.log('foo'); }); // eslint-disable-line no-console
			expect(serialize(fn, {exec: false})).toBe('function(){console.log("foo")}');
		});

		describe('true', () => {
			describe('unwraps', () => {
				it('single-line pure function', () => {
					const fn = (0, function() { console.log('foo'); }); // eslint-disable-line no-console
					expect(serialize(fn, {exec: true})).toBe('console.log("foo")');
				});

				it('multiple-line pure function', () => {
					const fn = (0, function() {
						const x = 'foo';
						console.log(x); // eslint-disable-line no-console
					});
					expect(serialize(fn, {exec: true})).toBe('const a="foo";console.log(a)');
				});

				it('impure function', () => {
					const x = 'foo';
					const fn = (0, function() {
						console.log(x); // eslint-disable-line no-console
					});
					expect(serialize(fn, {exec: true})).toBe('(a=>function(){console.log(a)})("foo")()');
				});
			});

			describe('does not unwrap', () => {
				it('named function', () => {
					function fn() {
						console.log(fn); // eslint-disable-line no-console
					}
					expect(serialize(fn, {exec: true})).toBe('(function fn(){console.log(fn)})()');
				});

				it('function with parameters', () => {
					const fn = (0, x => console.log(x)); // eslint-disable-line no-console
					expect(serialize(fn, {exec: true})).toBe('(a=>console.log(a))()');
				});

				it('async function', () => {
					const fn = (0, async () => { console.log('foo'); }); // eslint-disable-line no-console
					expect(serialize(fn, {exec: true})).toBe('(async()=>{console.log("foo")})()');
				});

				it('generator function', () => {
					// eslint-disable-next-line no-console, require-yield
					const fn = (0, function*() { console.log('foo'); });
					expect(serialize(fn, {exec: true})).toBe('(function*(){console.log("foo")})()');
				});

				it('async generator function', () => {
					// eslint-disable-next-line no-console, require-yield
					const fn = (0, async function*() { console.log('foo'); });
					expect(serialize(fn, {exec: true})).toBe('(async function*(){console.log("foo")})()');
				});
			});
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
		let obj;
		beforeEach(() => {
			const foo = {};
			obj = {foo, foo2: foo};
		});

		it('default', () => {
			expect(serialize(obj)).toBe('(()=>{const a={};return{foo:a,foo2:a}})()');
		});

		it('true', () => {
			expect(serialize(obj, {mangle: true})).toBe('(()=>{const a={};return{foo:a,foo2:a}})()');
		});

		it('false', () => {
			expect(serialize(obj, {mangle: false})).toBe('(()=>{const foo={};return{foo,foo2:foo}})()');
		});
	});

	describe('comments', () => {
		const fn = (0, () => { /* foobar */ });

		it('default', () => {
			expect(serialize(fn)).toBe('()=>{}');
		});

		it('false', () => {
			expect(serialize(fn, {comments: false})).toBe('()=>{}');
		});

		it('true', () => {
			expect(serialize(fn, {comments: true})).toBe('()=>{/* foobar */}');
		});
	});

	describe('files', () => {
		const fn = (0, function(x) { return x + 10; });

		it('default', () => {
			expect(serialize(fn)).toBe('function(a){return a+10}');
		});

		it('false', () => {
			expect(serialize(fn, {files: false})).toBe('function(a){return a+10}');
		});

		describe('true', () => {
			it('without source maps', () => {
				const out = serialize(fn, {files: true});
				expect(out).toBeArrayOfSize(1);
				expect(out[0]).toEqual({
					filename: 'index.js',
					content: 'function(a){return a+10}'
				});
			});

			it('with source maps', () => {
				const out = serialize(fn, {files: true, sourceMaps: true});
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
		function fn(
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
			expect(serialize(fn)).toBe('function fn(a){return a}');
		});

		describe('does not remove comments which `shouldPrintComment()` returns true for', () => {
			it('single line comments', () => {
				expect(
					serialize(fn, {shouldPrintComment: comment => /single/.test(comment)})
				).toBe('function fn(// single in params\na){// single in body\nreturn a}');
			});

			it('block comments', () => {
				expect(
					serialize(fn, {shouldPrintComment: comment => /block/.test(comment)})
				).toBe('function fn(/* block in params */a){/* block in body */return a}');
			});

			it('multi-line block comments', () => {
				expect(
					serialize(fn, {shouldPrintComment: comment => /multi/.test(comment)})
						.replace(/\n\s+/g, '\n')
				).toBe('function fn(/*\nmulti-line\nin params\n*/a){/*\nmulti-line\nin body\n*/return a}');
			});
		});
	});
});
