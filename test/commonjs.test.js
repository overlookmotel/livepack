/* --------------------
 * livepack module
 * Tests for CommonJS vars (`module` + `exports`)
 * ------------------*/

'use strict';

// Modules
const Module = require('module');

// Imports
const {serialize} = require('livepack'),
	{itSerializes, itSerializesEqual, withFixtures, stripLineBreaks} = require('./support/index.js');

// Tests

describe('`module`', () => {
	itSerializes('exported directly', {
		in: 'module.exports = module;',
		out: '(()=>{const a={};a.exports=a;return a})()',
		validate(mod, {isOutput}) {
			expect(mod).toBeObject();
			if (isOutput) expect(mod).toHaveOwnPropertyNames(['exports']);
			expect(mod.exports).toBe(mod);
		}
	});

	itSerializes('from another module', {
		in: {
			'index.js': `
				'use strict';
				const otherModule = require('./other.js');
				module.exports = () => otherModule;
			`,
			'other.js': 'module.exports = module;'
		},
		out: '(()=>{const a={};a.exports=a;return(a=>()=>a)(a)})()',
		validate(fn, {isOutput}) {
			expect(fn).toBeFunction();
			const mod = fn();
			expect(mod).toBeObject();
			if (isOutput) expect(mod).toHaveOwnPropertyNames(['exports']);
			expect(mod.exports).toBeObject();
			expect(mod.exports).toBe(mod);
		}
	});

	itSerializes('from another module where loading module threw', {
		in: {
			'index.js': `
				try {
					require('./other.js');
				} catch {}
				module.exports = require('./store.js').module;
			`,
			'other.js': `
				const store = require('./store.js');
				store.module = module;
				module.exports = {x: 1};
				throw new Error('foo');
			`,
			'store.js': 'module.exports = {};'
		},
		out: '{exports:{x:1}}',
		validate(mod, {isOutput}) {
			expect(mod).toBeObject();
			if (isOutput) expect(mod).toHaveOwnPropertyNames(['exports']);
			expect(mod.exports).toEqual({x: 1});
		}
	});

	itSerializes('in scope of function', {
		in: "'use strict';module.exports = () => module;",
		out: '(()=>{const a={},b=(a=>()=>a)(a);a.exports=b;return b})()',
		validate(fn, {isOutput}) {
			expect(fn).toBeFunction();
			const mod = fn();
			expect(mod).toBeObject();
			if (isOutput) expect(mod).toHaveOwnPropertyNames(['exports']);
			expect(mod.exports).toBe(fn);
		}
	});

	itSerializes('var reassigned', {
		in: `
			'use strict';
			module.exports = () => module;
			module = 123;
		`,
		out: '(a=>()=>a)(123)',
		validate(fn) {
			expect(fn).toBeFunction();
			expect(fn()).toBe(123);
		}
	});

	itSerializes('var overriden by function declaration and module object exported', {
		in: `
			'use strict';
			function module() { return 123; }
			// arguments[2] is module object
			arguments[2].exports = arguments[2];
		`,
		out: '(()=>{const a={};a.exports=a;return a})()',
		validate(mod, {isOutput}) {
			expect(mod).toBeObject();
			if (isOutput) expect(mod).toHaveOwnPropertyNames(['exports']);
			expect(mod.exports).toBe(mod);
		}
	});

	itSerializes('var overriden by function declaration and function exported', {
		in: `
			'use strict';
			function module() { return 123; }
			exports.x = module;
		`,
		out: '{x:function module(){return 123}}',
		validate(obj) {
			expect(obj).toBeObject();
			expect(obj).toHaveOwnPropertyNames(['x']);
			const fn = obj.x;
			expect(fn).toBeFunction();
			expect(fn.name).toBe('module');
			expect(fn()).toBe(123);
		}
	});
});

describe('`exports`', () => {
	itSerializes('is resolved correctly in scope of function', {
		in: `
			'use strict';
			exports.x = () => {
				exports.y = 123;
			};
		`,
		out: '(()=>{const a=(a=>[b=>a=b,()=>{a.y=123}])(),b={x:a[1]};a[0](b);return b})()',
		validate(exp, {isInput}) {
			expect(exp).toBeObject();
			expect(exp).toHaveOwnPropertyNames(['x']);
			const fn = exp.x;
			expect(fn).toBeFunction();
			fn();
			expect(exp).toHaveOwnPropertyNames(['x', 'y']);
			expect(exp.y).toBe(123);

			// Delete prop for next run
			if (isInput) delete exp.y;
		}
	});
});

describe('`__dirname`', () => {
	itSerializesEqual('exported directly is source path', {
		in: () => __dirname,
		out: `${JSON.stringify(__dirname)}`,
		validate: str => expect(str).toBe(__dirname)
	});

	itSerializes('in scope of function is build path', {
		in() {
			return () => __dirname;
		},
		out: '()=>__dirname',
		validateOutput(fn, {outputJs, minify}) {
			expect(stripLineBreaks(outputJs)).toBe(minify ? '()=>__dirname' : '() => __dirname');
		}
	});
});

describe('`__filename`', () => {
	itSerializesEqual('exported directly is source path', {
		in: () => __filename,
		out: `${JSON.stringify(__filename)}`,
		validate: str => expect(str).toBe(__filename)
	});

	itSerializes('in scope of function is build path', {
		in() {
			return () => __filename;
		},
		out: '()=>__filename',
		validateOutput(fn, {outputJs, minify}) {
			expect(stripLineBreaks(outputJs)).toBe(minify ? '()=>__filename' : '() => __filename');
		}
	});
});

describe('`require`', () => {
	describe('from same file', () => {
		it('cannot be serialized directly', () => {
			expect(() => serialize(require)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});

		it('cannot be serialized in function scope', () => {
			expect(() => serialize(() => require)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});
	});

	describe('from another file', () => {
		it('cannot be serialized directly', () => {
			withFixtures(
				'module.exports = require;',
				(otherRequire) => {
					expect(() => serialize(otherRequire)).toThrowWithMessage(
						Error, /^Cannot serialize `require` or `import` \(in /
					);
				}
			);
		});

		it('cannot be serialized in function scope', () => {
			withFixtures(
				'module.exports = require;',
				(otherRequire) => {
					expect(() => serialize(() => otherRequire)).toThrowWithMessage(
						Error, /^Cannot serialize `require` or `import` \(in /
					);
				}
			);
		});
	});

	describe('created by `Module.createRequire()`', () => {
		it('cannot be serialized directly', () => {
			const otherRequire = Module.createRequire(__filename);
			expect(() => serialize(otherRequire)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});

		it('cannot be serialized in function scope', () => {
			const otherRequire = Module.createRequire(__filename);
			expect(() => serialize(() => otherRequire)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});
	});

	describe('local functions called `require` do not break instrumentation', () => {
		describe('1 function', () => {
			itSerializes('sloppy mode', {
				in: `
					module.exports = require;
					const ext = {x: 1};
					function require() {
						return ext;
					}
				`,
				strictEnv: false,
				out: '(a=>function require(){return a})({x:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('require');
					expect(fn()).toEqual({x: 1});
				}
			});

			itSerializes('strict mode', {
				in: `
					'use strict';
					module.exports = require;
					const ext = {x: 1};
					function require() {
						return ext;
					}
				`,
				out: '(a=>function require(){return a})({x:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('require');
					expect(fn()).toEqual({x: 1});
				}
			});
		});

		describe('multiple functions', () => {
			itSerializes('sloppy mode', {
				in: `
					module.exports = require;
					const extA = {x: 1},
						extB = {y: 2},
						extC = {z: 3};
					function require() {
						return extA;
					}
					function require() {
						return extB;
					}
					function require() {
						return extC;
					}
				`,
				strictEnv: false,
				out: '(a=>function require(){return a})({z:3})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('require');
					expect(fn()).toEqual({z: 3});
				}
			});

			itSerializes('strict mode', {
				in: `
					'use strict';
					module.exports = require;
					const extA = {x: 1},
						extB = {y: 2};
					function require() {
						return extA;
					}
					function require() {
						return extB;
					}
				`,
				out: '(a=>function require(){return a})({y:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('require');
					expect(fn()).toEqual({y: 2});
				}
			});
		});

		itSerializes('function prefixed with label', {
			in: `
				module.exports = require;
				const ext = {x: 1};
				foo: function require() {
					return ext;
				}
			`,
			strictEnv: false,
			out: '(a=>function require(){return a})({x:1})',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn.name).toBe('require');
				expect(fn()).toEqual({x: 1});
			}
		});

		describe('function in nested block is not hoisted', () => {
			itSerializes('when no top level function', {
				in: {
					'index.js': `
						let inner;
						{
							inner = require;
							function require() {
								return 456;
							}
						}
						module.exports = [require('./other.js'), inner];
					`,
					'other.js': 'module.exports = 123;'
				},
				out: '[123,function require(){return 456}]',
				strictEnv: false,
				validate([num, fn]) {
					expect(num).toBe(123);
					expect(fn).toBeFunction();
					expect(fn.name).toBe('require');
					expect(fn()).toBe(456);
				}
			});

			itSerializes('when also top level function', {
				in: `
					let inner;
					{
						inner = require;
						function require() {
							return 456;
						}
					}
					function require() {
						return 123;
					}
					module.exports = [require, inner];
				`,
				out: '[function require(){return 123},function require(){return 456}]',
				strictEnv: false,
				validate([fn, inner]) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('require');
					expect(fn()).toBe(123);
					expect(inner).toBeFunction();
					expect(inner.name).toBe('require');
					expect(inner()).toBe(456);
				}
			});
		});
	});
});

describe('`require.resolve`', () => {
	describe('from same file', () => {
		it('cannot be serialized directly', () => {
			expect(() => serialize(require.resolve)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});

		it('cannot be serialized in function scope', () => {
			const {resolve} = require;
			expect(() => serialize(() => resolve)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});
	});

	describe('from another file', () => {
		it('cannot be serialized directly', () => {
			withFixtures(
				'module.exports = require.resolve;',
				(otherResolve) => {
					expect(() => serialize(otherResolve)).toThrowWithMessage(
						Error, /^Cannot serialize `require` or `import` \(in /
					);
				}
			);
		});

		it('cannot be serialized in function scope', () => {
			withFixtures(
				'module.exports = require.resolve;',
				(otherResolve) => {
					expect(() => serialize(() => otherResolve)).toThrowWithMessage(
						Error, /^Cannot serialize `require` or `import` \(in /
					);
				}
			);
		});
	});

	describe('created by `Module.createRequire()`', () => {
		it('cannot be serialized directly', () => {
			const otherResolve = Module.createRequire(__filename).resolve;
			expect(() => serialize(otherResolve)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});

		it('cannot be serialized in function scope', () => {
			const otherResolve = Module.createRequire(__filename).resolve;
			expect(() => serialize(() => otherResolve)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});
	});
});

describe('`require.resolve.paths`', () => {
	describe('from same file', () => {
		it('cannot be serialized directly', () => {
			expect(() => serialize(require.resolve.paths)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});

		it('cannot be serialized in function scope', () => {
			const {paths} = require.resolve;
			expect(() => serialize(() => paths)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});
	});

	describe('from another file', () => {
		it('cannot be serialized directly', () => {
			withFixtures(
				'module.exports = require.resolve.paths;',
				(otherPaths) => {
					expect(() => serialize(otherPaths)).toThrowWithMessage(
						Error, /^Cannot serialize `require` or `import` \(in /
					);
				}
			);
		});

		it('cannot be serialized in function scope', () => {
			withFixtures(
				'module.exports = require.resolve.paths;',
				(otherPaths) => {
					expect(() => serialize(() => otherPaths)).toThrowWithMessage(
						Error, /^Cannot serialize `require` or `import` \(in /
					);
				}
			);
		});
	});

	describe('created by `Module.createRequire()`', () => {
		it('cannot be serialized directly', () => {
			const otherPaths = Module.createRequire(__filename).resolve.paths;
			expect(() => serialize(otherPaths)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});

		it('cannot be serialized in function scope', () => {
			const otherPaths = Module.createRequire(__filename).resolve.paths;
			expect(() => serialize(() => otherPaths)).toThrowWithMessage(
				Error, /^Cannot serialize `require` or `import` \(in /
			);
		});
	});
});
