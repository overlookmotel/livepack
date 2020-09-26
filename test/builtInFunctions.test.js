/* --------------------
 * livepack module
 * Tests for built-in functions e.g. those returned from `require('util').promisify`
 * ------------------*/

'use strict';

// Modules
const {promisify} = require('util');

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Built-in functions', ({run}) => {
	describe("require('util').promisify", () => {
		it('simple', () => {
			run(
				promisify(cb => cb(null, 1)),
				'require("util").promisify(a=>a(null,1))',
				(fn) => {
					expect(fn).toBeFunction();
					// NB `.isInstanceOf(Promise)` doesn't work in this case
					// as Jest seems to use a `Promise` global from another realm
					expect(fn().then).toBeFunction();
				}
			);
		});

		it('with custom promisified function provided', () => {
			let input = (0, cb => cb(null, 1));
			input[promisify.custom] = () => 2;
			input = promisify(input);

			run(
				input,
				'(()=>{const a=(0,()=>2);Object.defineProperties(a,{[require("util").promisify.custom]:{value:a,configurable:true}});return a})()',
				(fn) => {
					expect(fn).toBeFunction();
					expect(fn()).toBe(2);
					expect(fn).toHaveDescriptorModifiersFor(promisify.custom, false, false, true);
				}
			);
		});
	});
});
