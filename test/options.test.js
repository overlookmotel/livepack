/* --------------------
 * livepack module
 * Tests for options
 * ------------------*/

/* eslint-disable strict */

// Modules
const {serialize} = require('livepack');

// Tests

describe('Options', () => {
	describe('format', () => {
		it('default', () => {
			expect(serialize(1)).toBe('1');
		});

		it('js', () => {
			expect(serialize(1, {format: 'js'})).toBe('1');
		});

		it('cjs', () => {
			expect(serialize(1, {format: 'cjs'})).toBe('module.exports=1');
		});

		it('esm', () => {
			expect(serialize(1, {format: 'esm'})).toBe('export default 1');
		});
	});

	describe('ext', () => {
		it('default', () => {
			expect(serialize(1, {files: true, sourceMaps: true})).toEqual([
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
					content: '{"version":3,"names":[],"sources":[],"sourcesContent":[],"mappings":""}'
				}
			]);
		});

		it('js', () => {
			expect(serialize(1, {ext: 'js', files: true, sourceMaps: true})).toEqual([
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
					content: '{"version":3,"names":[],"sources":[],"sourcesContent":[],"mappings":""}'
				}
			]);
		});

		it('cjs', () => {
			expect(serialize(1, {ext: 'cjs', files: true, sourceMaps: true})).toEqual([
				{
					type: 'entry',
					name: 'index',
					filename: 'index.cjs',
					content: '1\n//# sourceMappingURL=index.cjs.map'
				},
				{
					type: 'source map',
					name: null,
					filename: 'index.cjs.map',
					content: '{"version":3,"names":[],"sources":[],"sourcesContent":[],"mappings":""}'
				}
			]);
		});

		it('mjs', () => {
			expect(serialize(1, {ext: 'mjs', files: true, sourceMaps: true})).toEqual([
				{
					type: 'entry',
					name: 'index',
					filename: 'index.mjs',
					content: '1\n//# sourceMappingURL=index.mjs.map'
				},
				{
					type: 'source map',
					name: null,
					filename: 'index.mjs.map',
					content: '{"version":3,"names":[],"sources":[],"sourcesContent":[],"mappings":""}'
				}
			]);
		});
	});

	describe('mapExt', () => {
		it('default', () => {
			expect(serialize(1, {files: true, sourceMaps: true})).toEqual([
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
					content: '{"version":3,"names":[],"sources":[],"sourcesContent":[],"mappings":""}'
				}
			]);
		});

		it('map', () => {
			expect(serialize(1, {mapExt: 'map', files: true, sourceMaps: true})).toEqual([
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
					content: '{"version":3,"names":[],"sources":[],"sourcesContent":[],"mappings":""}'
				}
			]);
		});

		it('custom', () => {
			expect(serialize(1, {mapExt: 'm', files: true, sourceMaps: true})).toEqual([
				{
					type: 'entry',
					name: 'index',
					filename: 'index.js',
					content: '1\n//# sourceMappingURL=index.js.m'
				},
				{
					type: 'source map',
					name: null,
					filename: 'index.js.m',
					content: '{"version":3,"names":[],"sources":[],"sourcesContent":[],"mappings":""}'
				}
			]);
		});

		it('custom with custom `ext` option', () => {
			expect(serialize(1, {ext: 'mjs', mapExt: 'm', files: true, sourceMaps: true})).toEqual([
				{
					type: 'entry',
					name: 'index',
					filename: 'index.mjs',
					content: '1\n//# sourceMappingURL=index.mjs.m'
				},
				{
					type: 'source map',
					name: null,
					filename: 'index.mjs.m',
					content: '{"version":3,"names":[],"sources":[],"sourcesContent":[],"mappings":""}'
				}
			]);
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
			it('throws error if format is js', () => {
				expect(() => serialize(() => {}, {exec: true})).toThrowWithMessage(
					Error, "options.exec cannot be true if options.format is 'js'"
				);
			});

			describe('does not throw if format is', () => {
				it('cjs', () => {
					expect(serialize(() => {}, {exec: true, format: 'cjs'})).toBe('');
				});

				it('esm', () => {
					expect(serialize(() => { 'use strict'; }, {exec: true, format: 'esm'})).toBe('');
				});
			});

			describe('unwraps', () => {
				it('single-line pure function', () => {
					const fn = (0, function() { console.log('foo'); }); // eslint-disable-line no-console
					expect(serialize(fn, {exec: true, format: 'cjs'})).toBe('console.log("foo")');
				});

				it('multiple-line pure function', () => {
					const fn = (0, function() {
						const x = 'foo';
						console.log(x); // eslint-disable-line no-console
					});
					expect(serialize(fn, {exec: true, format: 'cjs'})).toBe('const a="foo";console.log(a)');
				});

				it('removes final semicolon when minify option used if not required', () => {
					const fn = (0, function() {
						const f = () => {};
						f();
					});
					expect(serialize(fn, {exec: true, format: 'cjs', minify: true})).toBe(
						'const a=()=>{};a()'
					);
				});

				it('preserves final semicolon when minify option used if required', () => {
					const fn = (0, function() {
						if (true) ; // eslint-disable-line no-constant-condition
					});
					expect(serialize(fn, {exec: true, format: 'cjs', minify: true})).toBe(
						'if(true);'
					);
				});
			});

			describe('does not unwrap', () => {
				it('named function', () => {
					// TODO: No reason why this couldn't be unwrapped
					const fn = function fn() {
						console.log(1); // eslint-disable-line no-console
					};
					expect(serialize(fn, {exec: true, format: 'cjs'})).toBe(
						'(function fn(){console.log(1)})()'
					);
				});

				it('function with parameters', () => {
					const fn = (0, x => console.log(x)); // eslint-disable-line no-console
					expect(serialize(fn, {exec: true, format: 'cjs'})).toBe('(a=>console.log(a))()');
				});

				it('function with external scope', () => {
					const x = 'foo';
					const fn = (0, function() {
						console.log(x); // eslint-disable-line no-console
					});
					expect(serialize(fn, {exec: true, format: 'cjs'})).toBe(
						'(a=>function(){console.log(a)})("foo")()'
					);
				});

				it('async function', () => {
					const fn = (0, async () => { console.log('foo'); }); // eslint-disable-line no-console
					expect(serialize(fn, {exec: true, format: 'cjs'})).toBe('(async()=>{console.log("foo")})()');
				});

				it('generator function', () => {
					// eslint-disable-next-line no-console, require-yield
					const fn = (0, function*() { console.log('foo'); });
					expect(serialize(fn, {exec: true, format: 'cjs'})).toBe('(function*(){console.log("foo")})()');
				});

				it('async generator function', () => {
					// eslint-disable-next-line no-console, require-yield
					const fn = (0, async function*() { console.log('foo'); });
					expect(serialize(fn, {exec: true, format: 'cjs'})).toBe(
						'(async function*(){console.log("foo")})()'
					);
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
					type: 'entry',
					name: 'index',
					filename: 'index.js',
					content: 'function(a){return a+10}'
				});
			});

			it('with source maps', () => {
				const out = serialize(fn, {files: true, sourceMaps: true});
				expect(out).toBeArrayOfSize(2);
				expect(out[0]).toEqual({
					type: 'entry',
					name: 'index',
					filename: 'index.js',
					content: 'function(a){return a+10}\n//# sourceMappingURL=index.js.map'
				});
				expect(out[1]).toEqual({
					type: 'source map',
					name: null,
					filename: 'index.js.map',
					content: expect.stringMatching(/\{"version":3,"names":\[/)
				});
			});
		});
	});

	describe('stats', () => {
		it('default', () => {
			expect(serialize({x: 1}, {files: true})).toEqual([{
				type: 'entry',
				name: 'index',
				filename: 'index.js',
				content: '{x:1}'
			}]);
		});

		it('false', () => {
			expect(serialize({x: 1}, {stats: false, files: true})).toEqual([{
				type: 'entry',
				name: 'index',
				filename: 'index.js',
				content: '{x:1}'
			}]);
		});

		it('true', () => {
			expect(serialize({x: 1}, {stats: true, files: true})).toEqual([
				{
					type: 'entry',
					name: 'index',
					filename: 'index.js',
					content: '{x:1}'
				},
				{
					type: 'stats',
					name: null,
					filename: 'livepack-stats.json',
					content: '{"files":[{"type":"entry","name":"index","filename":"index.js"}]}'
				}
			]);
		});

		it('string', () => {
			expect(serialize({x: 1}, {stats: 'stats.json', files: true})).toEqual([
				{
					type: 'entry',
					name: 'index',
					filename: 'index.js',
					content: '{x:1}'
				},
				{
					type: 'stats',
					name: null,
					filename: 'stats.json',
					content: '{"files":[{"type":"entry","name":"index","filename":"index.js"}]}'
				}
			]);
		});
	});

	describe('strictEnv', () => {
		'use strict';

		describe('`js` format', () => {
			it('default', () => {
				expect(serialize(() => 1)).toBe('()=>{"use strict";return 1}');
			});

			it('false', () => {
				expect(serialize(() => 1, {strictEnv: false})).toBe('()=>{"use strict";return 1}');
			});

			it('true', () => {
				expect(serialize(() => 1, {strictEnv: true})).toBe('()=>1');
			});
		});

		describe('`cjs` format', () => {
			it('default', () => {
				expect(serialize(() => 1, {format: 'cjs'})).toBe('"use strict";module.exports=()=>1');
			});

			it('false', () => {
				expect(
					serialize(() => 1, {format: 'cjs', strictEnv: false})
				).toBe('"use strict";module.exports=()=>1');
			});

			it('true (throws error)', () => {
				expect(
					() => serialize(() => 1, {format: 'cjs', strictEnv: true})
				).toThrow(new Error('options.strictEnv cannot be true for CommonJS format'));
			});
		});

		describe('`esm` format', () => {
			it('default', () => {
				expect(serialize(() => 1, {format: 'esm'})).toBe('export default(0,()=>1)');
			});

			it('false (throws error)', () => {
				expect(
					() => serialize(() => 1, {format: 'esm', strictEnv: false})
				).toThrow(new Error('options.strictEnv cannot be false for ESM format'));
			});

			it('true', () => {
				expect(serialize(() => 1, {format: 'esm', strictEnv: true})).toBe('export default(0,()=>1)');
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
