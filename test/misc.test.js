/* --------------------
 * livepack module
 * Tests for miscellaneous other
 * ------------------*/

'use strict';

// Imports
const {itSerializes} = require('./support/index.js');

// Tests

describe('Internal vars created by instrumentation do not interfere with code', () => {
	itSerializes('`tracker`', {
		in: `
			'use strict';
			module.exports = () => typeof livepack_tracker;
		`,
		out: '()=>typeof livepack_tracker',
		validate(fn, {transpiled}) {
			expect(fn()).toBe('undefined');

			// Check the temp var name which instrumentation creates matches the one being tested for
			expect(transpiled).toInclude('const [livepack1_tracker, livepack1_getScopeId] = require(');
		}
	});

	itSerializes('`scopeId`', {
		in: `
			'use strict';
			const ext = {};
			module.exports = () => ext && typeof livepack_scopeId_2;
		`,
		out: '(a=>()=>a&&typeof livepack_scopeId_2)({})',
		validate(fn, {transpiled}) {
			expect(fn()).toBe('undefined');

			// Check the temp var name which instrumentation creates matches the one being tested for
			expect(transpiled).toInclude('const livepack1_scopeId_2 = livepack1_getScopeId();');
		}
	});

	itSerializes('`temp`', {
		in: `
			'use strict';
			module.exports = Object.setPrototypeOf(
				{x() { return super.x(typeof livepack_temp_6); }},
				{x(v) { return v; }}
			);
		`,
		out: `(()=>{
			const a=(
					a=>[
						b=>a=b,
						{
							x(){
								return Reflect.get(Object.getPrototypeOf(a),"x",this).call(this,typeof livepack_temp_6)
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
		validate(obj, {transpiled}) {
			expect(obj.x()).toBe('undefined');

			// Check the temp var name which instrumentation creates matches the one being tested for
			expect(transpiled).toInclude('Object.setPrototypeOf(livepack1_temp_6 =');
		}
	});
});
