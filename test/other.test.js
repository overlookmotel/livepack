/* --------------------
 * livepack module
 * Tests for other built-ins
 * ------------------*/

'use strict';

// Modules
const parseNodeVersion = require('parse-node-version');

// Imports
const {itSerializes, itSerializesEqual} = require('./support/index.js');

// Tests

// `url[Symbol('context')]` property was removed in NodeJS v20.0.0.
const urlsHaveContext = parseNodeVersion(process.version).major < 20,
	itSerializesEqualIfUrlsHaveContext = urlsHaveContext ? itSerializesEqual : itSerializesEqual.skip;

describe('RegExps', () => {
	itSerializesEqual('with no flags', {
		in: () => /^foo$/,
		out: '/^foo$/',
		validate: regex => expect(regex).toBeInstanceOf(RegExp)
	});

	itSerializesEqual('with flags', {
		in: () => /^foo$/gu,
		out: '/^foo$/gu',
		validate: regex => expect(regex).toBeInstanceOf(RegExp)
	});

	itSerializesEqual('with escaped chars', {
		in: () => /^(foo)\.bar\/qu[xy]$/,
		out: '/^(foo)\\.bar\\/qu[xy]$/',
		validate: regex => expect(regex).toBeInstanceOf(RegExp)
	});

	itSerializesEqual('with extra props', {
		in() {
			const regex = /^foo$/;
			regex.x = 'bar';
			return regex;
		},
		out: 'Object.assign(/^foo$/,{x:"bar"})',
		validate(regex) {
			expect(regex).toBeInstanceOf(RegExp);
			expect(regex.x).toBe('bar');
		}
	});

	itSerializesEqual('RegExp subclass', {
		in() {
			class R extends RegExp {}
			return new R('^foo$', 'gu');
		},
		out: `(()=>{
			const a=Object.setPrototypeOf,
				b=RegExp,
				c=a(class R extends class{}{},b).prototype;
			a(c,b.prototype);
			return a(/^foo$/gu,c)
		})()`,
		validate(regex) {
			expect(regex).toBeInstanceOf(RegExp);
			expect(regex.source).toBe('^foo$');
			expect(regex.flags).toBe('gu');
			const proto = Object.getPrototypeOf(regex);
			expect(proto.constructor).toBeFunction();
			expect(proto.constructor.name).toBe('R');
			expect(proto).toHavePrototype(RegExp.prototype);
		}
	});
});

describe('Dates', () => {
	itSerializesEqual('without extra props', {
		in: () => new Date('01/01/2020 12:00:00'),
		out: 'new Date(1577880000000)',
		validate(date) {
			expect(date).toBeValidDate();
			expect(date.toISOString()).toBe('2020-01-01T12:00:00.000Z');
		}
	});

	itSerializesEqual('with extra props', {
		in() {
			const date = new Date('01/01/2020 12:00:00');
			date.x = 'bar';
			return date;
		},
		out: 'Object.assign(new Date(1577880000000),{x:"bar"})',
		validate(date) {
			expect(date).toBeValidDate();
			expect(date.toISOString()).toBe('2020-01-01T12:00:00.000Z');
			expect(date.x).toBe('bar');
		}
	});

	describe('invalid date', () => {
		itSerializes('alone', {
			in: () => new Date(Number.MAX_SAFE_INTEGER),
			out: 'new Date(NaN)',
			validate(date) {
				expect(date).toHavePrototype(Date.prototype);
				expect(date).not.toBeValidDate();
				expect(date.getTime()).toBeNaN();
			}
		});

		itSerializes('with local variable called `NaN`', {
			in() {
				const date = new Date(Number.MAX_SAFE_INTEGER);
				const obj = {toString() { return 0; }};
				return {
					NaN: obj,
					obj,
					date
				};
			},
			out: '(()=>{const a={toString(){return 0}};return{NaN:a,obj:a,date:new Date(NaN)}})()',
			validate({date}) {
				expect(date).toHavePrototype(Date.prototype);
				expect(date).not.toBeValidDate();
				expect(date.getTime()).toBeNaN();
			}
		});
	});

	itSerializesEqual('Date subclass', {
		in() {
			class D extends Date {}
			return new D('01/01/2020 12:00:00');
		},
		out: `(()=>{
			const a=Date,
				b=Object.setPrototypeOf,
				c=b(class D extends class{}{},a).prototype;
			b(c,a.prototype);
			return b(new a(1577880000000),c)
		})()`,
		validate(date) {
			expect(date.toISOString()).toBe('2020-01-01T12:00:00.000Z');
			const proto = Object.getPrototypeOf(date);
			expect(proto.constructor).toBeFunction();
			expect(proto.constructor.name).toBe('D');
			expect(proto).toHavePrototype(Date.prototype);
		}
	});
});

describe('URLs', () => {
	itSerializesEqual('URL', {
		in: () => new URL('http://foo.com/path/to/file.html?a=1&b=2'),
		out: 'new URL("http://foo.com/path/to/file.html?a=1&b=2")',
		validate(url) {
			expect(url).toBeInstanceOf(URL);
			expect(url.toString()).toBe('http://foo.com/path/to/file.html?a=1&b=2');
		}
	});

	itSerializesEqual('URL subclass', {
		in() {
			class U extends URL {}
			return new U('http://foo.com/path/to/file.html?a=1&b=2');
		},
		out: `(()=>{
			const a=URL,
				b=Object.setPrototypeOf,
				c=b(class U extends class{}{},a).prototype;
			b(c,a.prototype);
			return b(new a("http://foo.com/path/to/file.html?a=1&b=2"),c)
		})()`,
		validate(url) {
			expect(url).toBeInstanceOf(URL);
			expect(url.toString()).toBe('http://foo.com/path/to/file.html?a=1&b=2');
			const proto = Object.getPrototypeOf(url);
			expect(proto.constructor).toBeFunction();
			expect(proto.constructor.name).toBe('U');
			expect(proto).toHavePrototype(URL.prototype);
		}
	});
});

describe('URLSearchParams', () => {
	itSerializesEqual('without context', {
		in: () => new URLSearchParams('a=1&b=2'),
		out: 'new URLSearchParams("a=1&b=2")',
		validate(params) {
			expect(params).toBeInstanceOf(URLSearchParams);
			expect(params.toString()).toBe('a=1&b=2');
		}
	});

	// This test only makes sense in NodeJS v18.
	// `url[Symbol('context')]` was removed in NodeJS v20.0.0.
	itSerializesEqualIfUrlsHaveContext('with context', {
		in: () => new URL('http://foo.com/path/to/file.html?a=1&b=2').searchParams,
		out: 'new URL("http://foo.com/path/to/file.html?a=1&b=2").searchParams',
		/* eslint-disable jest/no-standalone-expect */
		validate(params) {
			expect(params).toBeInstanceOf(URLSearchParams);
			expect(params.toString()).toBe('a=1&b=2');

			const contextSymbol = Object.getOwnPropertySymbols(params)[1];
			expect(contextSymbol.toString()).toBe('Symbol(context)');
			const url = params[contextSymbol];
			expect(url).toBeInstanceOf(URL);
			expect(url.toString()).toBe('http://foo.com/path/to/file.html?a=1&b=2');
		}
		/* eslint-enable jest/no-standalone-expect */
	});

	itSerializes('URLSearchParams subclass', {
		in() {
			class U extends URLSearchParams {}
			return new U('a=1&b=2');
		},
		out: `(()=>{
			const a=URLSearchParams,
				b=Object.setPrototypeOf,
				c=b(class U extends class{}{},a).prototype;
			b(c,a.prototype);
			return b(new a("a=1&b=2"),c)
		})()`,
		validate(params) {
			expect(params).toBeInstanceOf(URLSearchParams);
			expect(params.toString()).toBe('a=1&b=2');
			const proto = Object.getPrototypeOf(params);
			expect(proto.constructor).toBeFunction();
			expect(proto.constructor.name).toBe('U');
			expect(proto).toHavePrototype(URLSearchParams.prototype);
		}
	});
});

describe('TypedArray', () => {
	itSerializesEqual('class', {
		in: () => Object.getPrototypeOf(Uint8Array), // TypedArray
		out: 'Object.getPrototypeOf(Uint8Array)',
		validateOutput: (fn, {input}) => expect(fn).toBe(input)
	});

	itSerializes('prototype', {
		in: () => Object.getPrototypeOf(Uint8Array.prototype), // TypedArray.prototype
		out: 'Object.getPrototypeOf(Uint8Array.prototype)',
		validateOutput: (fn, {input}) => expect(fn).toBe(input)
	});
});
