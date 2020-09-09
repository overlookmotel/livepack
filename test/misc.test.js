/* --------------------
 * livepack module
 * Tests for miscellaneous other
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js'),
	{transpiledFiles} = require('../lib/internal.js');

// Tests
const ext = {};

describeWithAllOptions('Internal vars created by Babel plugin do not interfere with code', ({run}) => {
	it('`tracker`', () => {
		// Check the temp var name which Babel transform creates matches the one being tested for
		// NB code for this file is injected into `files` in babel transform
		// (see `test/support/transform.js`)
		expect(transpiledFiles[__filename].code).toMatch(/const( )livepack1_tracker = require\("/);

		run(
			() => typeof livepack_tracker, // eslint-disable-line camelcase
			'()=>typeof livepack_tracker',
			fn => expect(fn()).toBe('undefined')
		);
	});

	it('`scopeId`', () => {
		// Check the temp var name which Babel transform creates matches the one being tested for
		// NB code for this file is injected into `files` in babel transform
		// (see `test/support/transform.js`)
		expect(transpiledFiles[__filename].code)
			.toMatch(/const( )livepack1_scopeId_1 = livepack1_tracker\(\);/);

		run(
			() => ext && typeof livepack_scopeId_1, // eslint-disable-line camelcase
			'(a=>()=>a&&typeof livepack_scopeId_1)({})',
			fn => expect(fn()).toBe('undefined')
		);
	});

	it('`temp`', () => {
		// Check the temp var name which Babel transform creates matches the one being tested for
		// NB code for this file is injected into `files` in babel transform
		// (see `test/support/transform.js`)
		expect(transpiledFiles[__filename].code).toMatch(/\/\*livepack_temp:assign\*\/livepack1_temp_11/);

		run(
			Object.setPrototypeOf(
				{x() { return super.x(typeof livepack_temp_11); }}, // eslint-disable-line camelcase
				{x(v) { return v; }}
			),
			'(()=>{const a=(a=>[b=>a=b,{x(){return Reflect.get(Object.getPrototypeOf(a),"x",this).call(this,typeof livepack_temp_11)}}.x])(),b=Object,c=b.assign(b.create({x(a){return a}}),{x:a[1]});a[0](c);return c})()',
			obj => expect(obj.x()).toBe('undefined')
		);
	});
});
