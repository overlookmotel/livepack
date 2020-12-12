/* --------------------
 * livepack module
 * Tests for built-in functions e.g. those returned from `require('util').promisify`
 * ------------------*/

'use strict';

// Modules
const {promisify, debuglog} = require('util');

// Imports
const {itSerializes} = require('./support/index.js');

// Tests

describe('Built-in functions', () => {
	describe("require('util').promisify", () => {
		itSerializes('simple', {
			in: () => promisify(cb => cb(null, 1)),
			out: 'require("util").promisify(a=>a(null,1))',
			validate(fn) {
				expect(fn).toBeFunction();
				// NB `.isInstanceOf(Promise)` doesn't work in this case
				// as Jest seems to use a `Promise` global from another realm
				expect(fn().then).toBeFunction();
			}
		});

		itSerializes('with custom promisified function provided', {
			in() {
				const fn = cb => cb(null, 1);
				fn[promisify.custom] = () => 2;
				return promisify(fn);
			},
			out: `(()=>{
				const a=(0,()=>2);
				Object.defineProperties(a,{
					[require("util").promisify.custom]:{value:a,configurable:true}
				});
				return a
			})()`,
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(2);
				expect(fn).toHaveDescriptorModifiersFor(promisify.custom, false, false, true);
			}
		});
	});

	describe("require('util').debuglog", () => {
		itSerializes('without callback', {
			in: () => debuglog('foo'),
			out: 'require("util").debuglog("foo")',
			validate: fn => expect(fn).toBeFunction()
		});

		itSerializes('with callback', {
			in: () => debuglog('foo', () => {}),
			out: 'require("util").debuglog("foo",()=>{})',
			validate: fn => expect(fn).toBeFunction()
		});
	});
});
