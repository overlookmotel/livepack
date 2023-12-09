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
