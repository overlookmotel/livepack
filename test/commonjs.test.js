/* --------------------
 * livepack module
 * Tests for CommonJS vars (`module` + `exports`)
 * ------------------*/

/* eslint-disable global-require */

'use strict';

// Imports
const {describeWithAllOptions, stripLineBreaks} = require('./support/index.js');

// Tests

describeWithAllOptions('`module`', ({run}) => {
	it('exported directly', () => {
		const input = require('./fixtures/commonjs/module/exported directly/index.js');
		run(
			input,
			'(()=>{const a={};a.exports=a;return a})()',
			(mod, isOutput) => {
				expect(mod).toBeObject();
				if (isOutput) expect(mod).toHaveOwnPropertyNames(['exports']);
				expect(mod.exports).toBe(mod);
			}
		);
	});

	it('from another module', () => {
		const input = require('./fixtures/commonjs/module/from another module/index.js');
		run(
			input,
			'(()=>{const a={};a.exports=a;return(a=>()=>a)(a)})()',
			(fn, isOutput) => {
				expect(fn).toBeFunction();
				const mod = fn();
				expect(mod).toBeObject();
				if (isOutput) expect(mod).toHaveOwnPropertyNames(['exports']);
				expect(mod.exports).toBeObject();
				expect(mod.exports).toBe(mod);
			}
		);
	});

	it('in scope of function', () => {
		const input = require('./fixtures/commonjs/module/in scope of function/index.js');
		run(
			input,
			'(()=>{const a={},b=(a=>()=>a)(a);a.exports=b;return b})()',
			(fn, isOutput) => {
				expect(fn).toBeFunction();
				const mod = fn();
				expect(mod).toBeObject();
				if (isOutput) expect(mod).toHaveOwnPropertyNames(['exports']);
				expect(mod.exports).toBe(fn);
			}
		);
	});

	it('var reassigned', () => {
		const input = require('./fixtures/commonjs/module/var reassigned/index.js');
		run(
			input,
			'(a=>()=>a)(123)',
			(fn) => {
				expect(fn).toBeFunction();
				expect(fn()).toBe(123);
			}
		);
	});
});

describeWithAllOptions('`exports`', ({run}) => {
	it('is resolved correctly in scope of function', () => {
		const input = require('./fixtures/commonjs/exports/index.js');
		run(
			input,
			'(()=>{const a=(a=>[b=>a=b,()=>{a.y=123}])(),b={x:a[1]};a[0](b);return b})()',
			(exp, isOutput) => {
				expect(exp).toBeObject();
				expect(exp).toHaveOwnPropertyNames(['x']);
				const fn = exp.x;
				expect(fn).toBeFunction();
				fn();
				expect(exp).toHaveOwnPropertyNames(['x', 'y']);
				expect(exp.y).toBe(123);

				// Delete prop for next run
				if (!isOutput) delete exp.y;
			}
		);
	});
});

describeWithAllOptions('`__dirname`', ({run, serialize, inline, minify, mangle}) => {
	it('exported directly is source path', () => {
		const input = __dirname;
		run(
			input,
			`${JSON.stringify(__dirname)}`,
			str => expect(str).toBe(__dirname)
		);
	});

	it('in scope of function is build path', () => {
		expect(stripLineBreaks(serialize(() => __dirname))).toBe(
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
	});
});

describeWithAllOptions('`__filename`', ({run, serialize, inline, minify, mangle}) => {
	it('exported directly is source path', () => { // eslint-disable-line jest/no-identical-title
		const input = __filename;
		run(
			input,
			`${JSON.stringify(__filename)}`,
			str => expect(str).toBe(__filename)
		);
	});

	it('in scope of function is build path', () => { // eslint-disable-line jest/no-identical-title
		expect(stripLineBreaks(serialize(() => __filename))).toBe(
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
	});
});
