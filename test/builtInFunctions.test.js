/* --------------------
 * livepack module
 * Tests for built-in functions e.g. those returned from `require('util').promisify`
 * ------------------*/

'use strict';

// Modules
// eslint-disable-next-line node/no-deprecated-api
const {promisify, callbackify, debuglog, debug} = require('util');

// Imports
const {itSerializes} = require('./support/index.js');

// Tests

describe('Built-in functions', () => {
	describe("require('util').promisify", () => {
		itSerializes('simple', {
			in: () => promisify(cb => cb(null, 1)),
			out: 'require("util").promisify(a=>a(null,1))',
			async validate(fn) {
				expect(fn).toBeFunction();
				const promise = fn();
				expect(promise).toBeInstanceOf(Promise);
				expect(await promise).toBe(1);
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
				expect(fn[promisify.custom]).toBe(fn);
				expect(fn).toHaveDescriptorModifiersFor(promisify.custom, false, false, true);
			}
		});
	});

	itSerializes("require('util').callbackify", {
		in: () => callbackify(async () => 1),
		out: 'require("util").callbackify(async()=>1)',
		async validate(fn) {
			expect(fn).toBeFunction();
			const value = await new Promise((resolve, reject) => {
				fn((err, res) => {
					if (err) {
						reject(err);
					} else {
						resolve(res);
					}
				});
			});
			expect(value).toBe(1);
		}
	});

	describe("require('util').debuglog", () => {
		itSerializes('without callback', {
			in: () => debuglog('foo'),
			out: 'require("util").debug("foo")',
			validate: fn => expect(fn).toBeFunction()
		});

		itSerializes('with callback', {
			in: () => debuglog('foo', () => {}),
			out: 'require("util").debug("foo",()=>{})',
			validate: fn => expect(fn).toBeFunction()
		});
	});

	describe("require('util').debug", () => {
		itSerializes('without callback', {
			in: () => debug('foo'),
			out: 'require("util").debug("foo")',
			validate: fn => expect(fn).toBeFunction()
		});

		itSerializes('with callback', {
			in: () => debug('foo', () => {}),
			out: 'require("util").debug("foo",()=>{})',
			validate: fn => expect(fn).toBeFunction()
		});
	});
});
