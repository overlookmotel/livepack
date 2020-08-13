/* --------------------
 * livepack module
 * Tests for other built-ins
 * ------------------*/

/* eslint-disable jest/no-identical-title */

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('RegExps', ({expectSerializedEqual}) => {
	it('with no flags', () => {
		expectSerializedEqual(/^foo$/, '/^foo$/', expectToBeRegex);
	});

	it('with flags', () => {
		expectSerializedEqual(/^foo$/gu, '/^foo$/gu', expectToBeRegex);
	});

	it('with escaped chars', () => {
		expectSerializedEqual(/^(foo)\.bar\/qu[xy]$/, '/^(foo)\\.bar\\/qu[xy]$/', expectToBeRegex);
	});

	it('with extra props', () => {
		const input = /^foo$/;
		input.x = 'bar';
		expectSerializedEqual(input, null, (regex) => {
			expectToBeRegex(regex);
			expect(regex.x).toBe('bar');
		});
	});

	it('RegExp subclass', () => { // eslint-disable-line jest/lowercase-name
		class R extends RegExp {}
		expectSerializedEqual(
			new R('^foo$', 'gu'),
			'(()=>{const a=Object.setPrototypeOf,b=RegExp,c=a(class R{constructor(...a){return Reflect.construct(Object.getPrototypeOf(R),a,R)}},b).prototype;a(c,b.prototype);return a(/^foo$/gu,c)})()',
			(regex) => {
				expectToBeRegex(regex);
				expect(regex.source).toBe('^foo$');
				expect(regex.flags).toBe('gu');
				const proto = Object.getPrototypeOf(regex);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('R');
				expect(proto).toHavePrototype(RegExp.prototype);
			}
		);
	});
});

function expectToBeRegex(val) {
	expect(val).toBeInstanceOf(RegExp);
}

describeWithAllOptions('Dates', ({expectSerializedEqual}) => {
	it('without extra props', () => {
		const input = new Date('01/01/2020 12:00:00');
		expectSerializedEqual(input, 'new Date(1577880000000)', (date) => {
			expect(date).toBeValidDate();
			expect(date.toISOString()).toBe('2020-01-01T12:00:00.000Z');
		});
	});

	it('with extra props', () => {
		const input = new Date('01/01/2020 12:00:00');
		input.x = 'bar';
		expectSerializedEqual(input, 'Object.assign(new Date(1577880000000),{x:"bar"})', (date) => {
			expect(date).toBeValidDate();
			expect(date.toISOString()).toBe('2020-01-01T12:00:00.000Z');
			expect(date.x).toBe('bar');
		});
	});

	it('Date subclass', () => { // eslint-disable-line jest/lowercase-name
		class D extends Date {}
		expectSerializedEqual(
			new D('01/01/2020 12:00:00'),
			'(()=>{const a=Date,b=Object.setPrototypeOf,c=b(class D{constructor(...a){return Reflect.construct(Object.getPrototypeOf(D),a,D)}},a).prototype;b(c,a.prototype);return b(new a(1577880000000),c)})()',
			(date) => {
				expect(date.toISOString()).toBe('2020-01-01T12:00:00.000Z');
				const proto = Object.getPrototypeOf(date);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('D');
				expect(proto).toHavePrototype(Date.prototype);
			}
		);
	});
});

describeWithAllOptions('Buffers', ({expectSerializedEqual, run}) => {
	it('without extra props', () => {
		const input = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
		expectSerializedEqual(
			input, 'Buffer.from("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=","base64")',
			(buf) => {
				expectToBeBuffer(buf);
				expect(buf.toString()).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
			}
		);
	});

	it('with extra props', () => {
		const input = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
		input.x = 'bar';
		expectSerializedEqual(
			input,
			'Object.assign(Buffer.from("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=","base64"),{x:"bar"})',
			(buf) => {
				expectToBeBuffer(buf);
				expect(buf.toString()).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
				expect(buf.x).toBe('bar');
			}
		);
	});

	it('Buffer subclass', () => { // eslint-disable-line jest/lowercase-name
		class B extends Buffer {}
		const input = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
		Object.setPrototypeOf(input, B.prototype);

		run(
			input,
			'(()=>{const a=Buffer,b=Object.setPrototypeOf,c=b(class B{constructor(...a){return Reflect.construct(Object.getPrototypeOf(B),a,B)}},a).prototype;b(c,a.prototype);return b(a.from("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=","base64"),c)})()',
			(buf) => {
				expectToBeBuffer(buf);
				expect(buf.toString()).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
				const proto = Object.getPrototypeOf(buf);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('B');
				expect(proto).toHavePrototype(Buffer.prototype);
			}
		);
	});
});

function expectToBeBuffer(val) {
	expect(val).toBeInstanceOf(Buffer);
}

describeWithAllOptions('URLs', ({expectSerializedEqual}) => {
	it('URL', () => { // eslint-disable-line jest/lowercase-name
		expectSerializedEqual(
			new URL('http://foo.com/path/to/file.html?a=1&b=2'),
			'new URL("http://foo.com/path/to/file.html?a=1&b=2")',
			(url) => {
				expect(url).toBeInstanceOf(URL);
				expect(url.toString()).toBe('http://foo.com/path/to/file.html?a=1&b=2');
			}
		);
	});

	it('URL subclass', () => { // eslint-disable-line jest/lowercase-name
		class U extends URL {}
		expectSerializedEqual(
			new U('http://foo.com/path/to/file.html?a=1&b=2'),
			'(()=>{const a=URL,b=Object.setPrototypeOf,c=b(class U{constructor(...a){return Reflect.construct(Object.getPrototypeOf(U),a,U)}},a).prototype;b(c,a.prototype);return b(new a("http://foo.com/path/to/file.html?a=1&b=2"),c)})()',
			(url) => {
				expect(url).toBeInstanceOf(URL);
				expect(url.toString()).toBe('http://foo.com/path/to/file.html?a=1&b=2');
				const proto = Object.getPrototypeOf(url);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('U');
				expect(proto).toHavePrototype(URL.prototype);
			}
		);
	});
});

describeWithAllOptions('URLSearchParams', ({expectSerializedEqual, run}) => {
	it('without context', () => {
		expectSerializedEqual(
			new URLSearchParams('a=1&b=2'),
			'new URLSearchParams("a=1&b=2")',
			(params) => {
				expect(params).toBeInstanceOf(URLSearchParams);
				expect(params.toString()).toBe('a=1&b=2');
			}
		);
	});

	it('with context', () => {
		expectSerializedEqual(
			new URL('http://foo.com/path/to/file.html?a=1&b=2').searchParams,
			'new URL("http://foo.com/path/to/file.html?a=1&b=2").searchParams',
			(params) => {
				expect(params).toBeInstanceOf(URLSearchParams);
				expect(params.toString()).toBe('a=1&b=2');

				const contextSymbol = Object.getOwnPropertySymbols(params)[1];
				expect(contextSymbol.toString()).toBe('Symbol(context)');
				const url = params[contextSymbol];
				expect(url).toBeInstanceOf(URL);
				expect(url.toString()).toBe('http://foo.com/path/to/file.html?a=1&b=2');
			}
		);
	});

	it('URLSearchParams subclass', () => { // eslint-disable-line jest/lowercase-name
		class U extends URLSearchParams {}
		run(
			new U('a=1&b=2'),
			'(()=>{const a=URLSearchParams,b=Object.setPrototypeOf,c=b(class U{constructor(...a){return Reflect.construct(Object.getPrototypeOf(U),a,U)}},a).prototype;b(c,a.prototype);return b(new a("a=1&b=2"),c)})()',
			(params) => {
				expect(params).toBeInstanceOf(URLSearchParams);
				expect(params.toString()).toBe('a=1&b=2');
				const proto = Object.getPrototypeOf(params);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('U');
				expect(proto).toHavePrototype(URLSearchParams.prototype);
			}
		);
	});
});

describeWithAllOptions('TypedArray', ({expectSerializedEqual, run}) => {
	it('class', () => {
		const TypedArray = Object.getPrototypeOf(Uint8Array.prototype).constructor;
		expectSerializedEqual(
			TypedArray,
			'Object.getPrototypeOf(Uint8Array.prototype).constructor',
			(fn) => {
				expect(fn).toBe(TypedArray);
			}
		);
	});

	it('prototype', () => {
		const TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
		run(
			TypedArrayPrototype,
			'Object.getPrototypeOf(Uint8Array.prototype)',
			(fn) => {
				expect(fn).toBe(TypedArrayPrototype);
			}
		);
	});
});
