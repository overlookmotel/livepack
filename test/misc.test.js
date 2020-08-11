/* --------------------
 * livepack module
 * Tests for miscellaneous other
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests
const ext = {};

describeWithAllOptions('Internal vars created by Babel plugin do not interfere with code', ({run}) => {
	it('`tracker`', () => {
		run(
			() => typeof tracker,
			'()=>typeof tracker',
			fn => expect(fn()).toBe('undefined')
		);
	});

	it('`scopeId`', () => {
		run(
			() => ext && typeof scopeId_1, // eslint-disable-line camelcase
			'(a=>()=>a&&typeof scopeId_1)({})',
			fn => expect(fn()).toBe('undefined')
		);
	});

	it('`temp`', () => {
		// Check the temp var name which Babel transform creates matches the one being tested for
		// NB `__codeAfterBabelTransform__` var is injected in babel transform
		// (see `test/support/transform.js`)
		// eslint-disable-next-line no-undef
		expect(__codeAfterBabelTransform__).toMatch(/\/\*livepack_temp:assign\*\/temp1_11/);

		run(
			Object.setPrototypeOf(
				{x() { return super.x(typeof temp_11); }}, // eslint-disable-line camelcase
				{x(v) { return v; }}
			),
			'(()=>{const a=(a=>[b=>a=b,{x(){return Reflect.get(Object.getPrototypeOf(a),"x",this).call(this,typeof temp_11)}}.x])(),b=Object,c=b.assign(b.create({x(a){return a}}),{x:a[1]});a[0](c);return c})()',
			obj => expect(obj.x()).toBe('undefined')
		);
	});
});
