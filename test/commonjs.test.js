/* --------------------
 * livepack module
 * Tests for CommonJS vars (`module` + `exports`)
 * ------------------*/

/* eslint-disable global-require */

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

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
