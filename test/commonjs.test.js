/* --------------------
 * livepack module
 * Tests for CommonJS vars (`module` + `exports`)
 * ------------------*/

'use strict';

// Imports
const {itSerializes, itSerializesEqual, stripLineBreaks} = require('./support/index.js');

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
		// `Object.setPrototypeOf` necessary because Jest creates `module.exports` in another
		// execution context, so prototype of `export` object is a *different* `Object.prototype`.
		// This is just an artefact of the testing environment - does not affect real code.
		in: `
			'use strict';
			Object.setPrototypeOf(exports, Object.prototype);
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
		validateOutput(fn, {outputJs, minify, inline, mangle}) {
			expect(stripLineBreaks(outputJs)).toBe(
				minify
					? inline
						? '()=>__dirname'
						: mangle
							? '(()=>{const a=(0,()=>__dirname);return a})()'
							: '(()=>{const index=(0,()=>__dirname);return index})()'
					: inline
						? '() => __dirname'
						: mangle
							? '(() => {const a = (0, () => __dirname);return a;})()'
							: '(() => {const index = (0, () => __dirname);return index;})()'
			);
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
		validateOutput(fn, {outputJs, minify, inline, mangle}) {
			expect(stripLineBreaks(outputJs)).toBe(
				minify
					? inline
						? '()=>__filename'
						: mangle
							? '(()=>{const a=(0,()=>__filename);return a})()'
							: '(()=>{const index=(0,()=>__filename);return index})()'
					: inline
						? '() => __filename'
						: mangle
							? '(() => {const a = (0, () => __filename);return a;})()'
							: '(() => {const index = (0, () => __filename);return index;})()'
			);
		}
	});
});
