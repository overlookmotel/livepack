/* --------------------
 * livepack module
 * Tests for CommonJS vars (`module` + `exports`)
 * ------------------*/

/* eslint-disable global-require */

'use strict';

// Imports
const {itSerializes, itSerializesEqual, stripLineBreaks} = require('./support/index.js');

// Tests

describe('`module`', () => {
	itSerializes('exported directly', {
		in: () => require('./fixtures/commonjs/module/exported directly/index.js'),
		out: '(()=>{const a={};a.exports=a;return a})()',
		validate(mod, {isOutput}) {
			expect(mod).toBeObject();
			if (isOutput) expect(mod).toHaveOwnPropertyNames(['exports']);
			expect(mod.exports).toBe(mod);
		}
	});

	itSerializes('from another module', {
		in: () => require('./fixtures/commonjs/module/from another module/index.js'),
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
		in: () => require('./fixtures/commonjs/module/in scope of function/index.js'),
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
		in: () => require('./fixtures/commonjs/module/var reassigned/index.js'),
		out: '(a=>()=>a)(123)',
		validate(fn) {
			expect(fn).toBeFunction();
			expect(fn()).toBe(123);
		}
	});
});

describe('`exports`', () => {
	itSerializes('is resolved correctly in scope of function', {
		in: () => require('./fixtures/commonjs/exports/index.js'),
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
				minify // eslint-disable-line no-nested-ternary
					? inline // eslint-disable-line no-nested-ternary
						? '()=>__dirname'
						: mangle
							? '(()=>{const a=(0,()=>__dirname);return a})()'
							: '(()=>{const exports$0=(0,()=>__dirname);return exports$0})()'
					: inline // eslint-disable-line no-nested-ternary
						? '() => __dirname'
						: mangle
							? '(() => {const a = (0, () => __dirname);return a;})()'
							: '(() => {const exports$0 = (0, () => __dirname);return exports$0;})()'
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
				minify // eslint-disable-line no-nested-ternary
					? inline // eslint-disable-line no-nested-ternary
						? '()=>__filename'
						: mangle
							? '(()=>{const a=(0,()=>__filename);return a})()'
							: '(()=>{const exports$0=(0,()=>__filename);return exports$0})()'
					: inline // eslint-disable-line no-nested-ternary
						? '() => __filename'
						: mangle
							? '(() => {const a = (0, () => __filename);return a;})()'
							: '(() => {const exports$0 = (0, () => __filename);return exports$0;})()'
			);
		}
	});
});
