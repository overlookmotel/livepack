/* --------------------
 * livepack module
 * Tests for boxed primitives
 * ------------------*/

/* eslint-disable no-new-wrappers */

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Boxed Strings', ({run}) => {
	it('non-empty string', () => {
		run(
			new String('abc'),
			'new String("abc")',
			(str) => {
				expect(typeof str).toBe('object');
				expect(str).toHavePrototype(String.prototype);
				expect(String(str)).toBe('abc');
				expect(str).toHaveLength(3);
			}
		);
	});

	it('empty string', () => {
		run(
			new String(''),
			'new String',
			(str) => {
				expect(typeof str).toBe('object');
				expect(str).toHavePrototype(String.prototype);
				expect(String(str)).toBe('');
				expect(str).toHaveLength(0);
			}
		);
	});

	it('with extra integer-keyed properties', () => {
		const input = new String('abc');
		input[3] = 'x';

		run(
			input,
			'Object.assign(new String("abc"),{3:"x"})',
			(str) => {
				expect(typeof str).toBe('object');
				expect(str).toHavePrototype(String.prototype);
				expect(String(str)).toBe('abc');
				expect(str).toHaveLength(3);
				expect(str[3]).toBe('x');
				expect(str).toHaveDescriptorModifiersFor(3, true, true, true);
			}
		);
	});

	it('String subclass', () => { // eslint-disable-line jest/lowercase-name
		class S extends String {}
		run(
			new S('abc'),
			'(()=>{const a=String,b=Object.setPrototypeOf,c=b(class S{constructor(...a){return Reflect.construct(Object.getPrototypeOf(S),a,S)}},a).prototype;b(c,a.prototype);return b(new a("abc"),c)})()',
			(str) => {
				expect(typeof str).toBe('object');
				expect(String(str)).toBe('abc');
				expect(str).toHaveLength(3);
				const proto = Object.getPrototypeOf(str);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('S');
				expect(proto).toHavePrototype(String.prototype);
			}
		);
	});
});

describeWithAllOptions('Boxed Booleans', ({expectSerializedEqual}) => {
	it('true', () => {
		expectSerializedEqual(
			new Boolean(true),
			'new Boolean(1)',
			(bool) => {
				expect(typeof bool).toBe('object');
				expect(bool).toHavePrototype(Boolean.prototype);
				expect(bool.valueOf()).toBe(true);
			}
		);
	});

	it('false', () => {
		expectSerializedEqual(
			new Boolean(false),
			'new Boolean',
			(bool) => {
				expect(typeof bool).toBe('object');
				expect(bool).toHavePrototype(Boolean.prototype);
				expect(bool.valueOf()).toBe(false);
			}
		);
	});

	it('Boolean subclass', () => { // eslint-disable-line jest/lowercase-name
		class B extends Boolean {}
		expectSerializedEqual(
			new B(true),
			'(()=>{const a=Boolean,b=Object.setPrototypeOf,c=b(class B{constructor(...a){return Reflect.construct(Object.getPrototypeOf(B),a,B)}},a).prototype;b(c,a.prototype);return b(new a(1),c)})()',
			(bool) => {
				expect(typeof bool).toBe('object');
				const proto = Object.getPrototypeOf(bool);
				expect(bool.valueOf()).toBe(true);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('B');
				expect(proto).toHavePrototype(Boolean.prototype);
			}
		);
	});
});

describeWithAllOptions('Boxed Numbers', ({expectSerializedEqual}) => { // TODO
	it('positive integer', () => {
		expectSerializedEqual(
			new Number(1),
			'new Number(1)',
			(num) => {
				expect(typeof num).toBe('object');
				expect(num).toHavePrototype(Number.prototype);
				expect(Number(num)).toBe(1);
			}
		);
	});

	it('negative integer', () => {
		expectSerializedEqual(
			new Number(-1),
			'new Number(-1)',
			(num) => {
				expect(typeof num).toBe('object');
				expect(num).toHavePrototype(Number.prototype);
				expect(Number(num)).toBe(-1);
			}
		);
	});

	it('zero', () => {
		expectSerializedEqual(
			new Number(0),
			'new Number',
			(num) => {
				expect(typeof num).toBe('object');
				expect(num).toHavePrototype(Number.prototype);
				expect(Number(num)).toBe(0);
			}
		);
	});

	it('minus zero', () => {
		expectSerializedEqual(
			new Number(-0),
			'new Number(-0)',
			(num) => {
				expect(typeof num).toBe('object');
				expect(num).toHavePrototype(Number.prototype);
				expect(Number(num)).toBe(-0);
			}
		);
	});

	it('positive float', () => {
		expectSerializedEqual(
			new Number(0.1),
			'new Number(0.1)',
			(num) => {
				expect(typeof num).toBe('object');
				expect(num).toHavePrototype(Number.prototype);
				expect(Number(num)).toBe(0.1);
			}
		);
	});

	it('negative float', () => {
		expectSerializedEqual(
			new Number(-0.1),
			'new Number(-0.1)',
			(num) => {
				expect(typeof num).toBe('object');
				expect(num).toHavePrototype(Number.prototype);
				expect(Number(num)).toBe(-0.1);
			}
		);
	});

	it('Infinity', () => { // eslint-disable-line jest/lowercase-name
		expectSerializedEqual(
			new Number(Infinity),
			'new Number(Infinity)',
			(num) => {
				expect(typeof num).toBe('object');
				expect(num).toHavePrototype(Number.prototype);
				expect(Number(num)).toBe(Infinity);
			}
		);
	});

	it('negative Infinity', () => {
		expectSerializedEqual(
			new Number(-Infinity),
			'new Number(-Infinity)',
			(num) => {
				expect(typeof num).toBe('object');
				expect(num).toHavePrototype(Number.prototype);
				expect(Number(num)).toBe(-Infinity);
			}
		);
	});

	it('NaN', () => { // eslint-disable-line jest/lowercase-name
		expectSerializedEqual(
			new Number(undefined * 1),
			'new Number(NaN)',
			(num) => {
				expect(typeof num).toBe('object');
				expect(num).toHavePrototype(Number.prototype);
				expect(Number(num)).toBe(NaN);
			}
		);
	});

	it('Number subclass', () => { // eslint-disable-line jest/lowercase-name
		class N extends Number {}
		expectSerializedEqual(
			new N(1),
			'(()=>{const a=Number,b=Object.setPrototypeOf,c=b(class N{constructor(...a){return Reflect.construct(Object.getPrototypeOf(N),a,N)}},a).prototype;b(c,a.prototype);return b(new a(1),c)})()',
			(num) => {
				expect(typeof num).toBe('object');
				expect(Number(num)).toBe(1);
				const proto = Object.getPrototypeOf(num);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('N');
				expect(proto).toHavePrototype(Number.prototype);
			}
		);
	});
});
