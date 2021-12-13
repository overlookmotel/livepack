/* --------------------
 * livepack module
 * Tests for miscellaneous other
 * ------------------*/

'use strict';

// Imports
const {itSerializes, transpiledFiles} = require('./support/index.js');

// Tests
const ext = {};

describe('Internal vars created by Babel plugin do not interfere with code', () => {
	itSerializes('`tracker`', {
		in() {
			return () => typeof livepack_tracker; // eslint-disable-line camelcase
		},
		out: '()=>typeof livepack_tracker',
		validate(fn) {
			// Check the temp var name which Babel transform creates matches the one being tested for
			// NB code for this file is injected into `files` in babel transform
			// (see `test/support/transform.js`)
			expect(transpiledFiles[__filename]).toMatch(
				/const \[livepack1_tracker, livepack1_getScopeId\] = require\("/
			);

			expect(fn()).toBe('undefined');
		}
	});

	itSerializes('`scopeId`', {
		in() {
			return () => ext && typeof livepack_scopeId_1; // eslint-disable-line camelcase
		},
		out: '(a=>()=>a&&typeof livepack_scopeId_1)({})',
		validate(fn) {
			// Check the temp var name which Babel transform creates matches the one being tested for
			// NB code for this file is injected into `files` in babel transform
			// (see `test/support/transform.js`)
			expect(transpiledFiles[__filename])
				.toMatch(/const( )livepack1_scopeId_1 = livepack1_getScopeId\(\);/);

			expect(fn()).toBe('undefined');
		}
	});

	itSerializes('`temp`', {
		in: () => Object.setPrototypeOf(
			{x() { return super.x(typeof livepack_temp_16); }}, // eslint-disable-line camelcase
			{x(v) { return v; }}
		),
		out: `(()=>{
			const a=(
					a=>[
						b=>a=b,
						{
							x(){
								return Reflect.get(Object.getPrototypeOf(a),"x",this).call(this,typeof livepack_temp_16)
							}
						}.x
					]
				)(),
				b=Object,
				c=b.assign(
					b.create({x(a){return a}}),
					{x:a[1]}
				);
			a[0](c);
			return c
		})()`,
		validate(obj) {
			// Check the temp var name which Babel transform creates matches the one being tested for
			// NB code for this file is injected into `files` in babel transform
			// (see `test/support/transform.js`)
			expect(transpiledFiles[__filename]).toMatch(/Object.setPrototypeOf\(livepack1_temp_16 =/);

			expect(obj.x()).toBe('undefined');
		}
	});
});
