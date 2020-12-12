/* --------------------
 * livepack module
 * Tests for boxed primitives
 * ------------------*/

/* eslint-disable no-new-wrappers */

'use strict';

// Imports
const {itSerializes, itSerializesEqual} = require('./support/index.js');

// Tests

describe('Boxed Strings', () => {
	itSerializes('non-empty string', {
		in: () => new String('abc'),
		out: 'new String("abc")',
		validate(str) {
			expect(typeof str).toBe('object');
			expect(str).toHavePrototype(String.prototype);
			expect(String(str)).toBe('abc');
			expect(str).toHaveLength(3);
		}
	});

	itSerializes('empty string', {
		in: () => new String(''),
		out: 'new String',
		validate(str) {
			expect(typeof str).toBe('object');
			expect(str).toHavePrototype(String.prototype);
			expect(String(str)).toBe('');
			expect(str).toHaveLength(0);
		}
	});

	itSerializes('with extra integer-keyed properties', {
		in() {
			const str = new String('abc');
			str[3] = 'x';
			return str;
		},
		out: 'Object.assign(new String("abc"),{3:"x"})',
		validate(str) {
			expect(typeof str).toBe('object');
			expect(str).toHavePrototype(String.prototype);
			expect(String(str)).toBe('abc');
			expect(str).toHaveLength(3);
			expect(str[3]).toBe('x');
			expect(str).toHaveDescriptorModifiersFor(3, true, true, true);
		}
	});

	itSerializes('String subclass', {
		in() {
			class S extends String {}
			return new S('abc');
		},
		out: `(()=>{
			const a=String,
				b=Object.setPrototypeOf,
				c=b(
					class S{
						constructor(...a){return Reflect.construct(Object.getPrototypeOf(S),a,S)}
					},a
				).prototype;
			b(c,a.prototype);
			return b(new a("abc"),c)
		})()`,
		validate(str) {
			expect(typeof str).toBe('object');
			expect(String(str)).toBe('abc');
			expect(str).toHaveLength(3);
			const proto = Object.getPrototypeOf(str);
			expect(proto.constructor).toBeFunction();
			expect(proto.constructor.name).toBe('S');
			expect(proto).toHavePrototype(String.prototype);
		}
	});
});

describe('Boxed Booleans', () => {
	itSerializesEqual('true', {
		in: () => new Boolean(true),
		out: 'new Boolean(1)',
		validate(bool) {
			expect(typeof bool).toBe('object');
			expect(bool).toHavePrototype(Boolean.prototype);
			expect(bool.valueOf()).toBe(true);
		}
	});

	itSerializesEqual('false', {
		in: () => new Boolean(false),
		out: 'new Boolean',
		validate(bool) {
			expect(typeof bool).toBe('object');
			expect(bool).toHavePrototype(Boolean.prototype);
			expect(bool.valueOf()).toBe(false);
		}
	});

	itSerializesEqual('Boolean subclass', {
		in() {
			class B extends Boolean {}
			return new B(true);
		},
		out: `(()=>{
			const a=Boolean,
			b=Object.setPrototypeOf,
			c=b(
				class B{
					constructor(...a){return Reflect.construct(Object.getPrototypeOf(B),a,B)}
				},a
			).prototype;
			b(c,a.prototype);
			return b(new a(1),c)
		})()`,
		validate(bool) {
			expect(typeof bool).toBe('object');
			const proto = Object.getPrototypeOf(bool);
			expect(bool.valueOf()).toBe(true);
			expect(proto.constructor).toBeFunction();
			expect(proto.constructor.name).toBe('B');
			expect(proto).toHavePrototype(Boolean.prototype);
		}
	});
});

describe('Boxed Numbers', () => {
	itSerializesEqual('positive integer', {
		in: () => new Number(1),
		out: 'new Number(1)',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number(num)).toBe(1);
		}
	});

	itSerializesEqual('negative integer', {
		in: () => new Number(-1),
		out: 'new Number(-1)',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number(num)).toBe(-1);
		}
	});

	itSerializesEqual('zero', {
		in: () => new Number(0),
		out: 'new Number',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number(num)).toBe(0);
		}
	});

	itSerializesEqual('minus zero', {
		in: () => new Number(-0),
		out: 'new Number(-0)',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number(num)).toBe(-0);
		}
	});

	itSerializesEqual('positive float', {
		in: () => new Number(0.1),
		out: 'new Number(0.1)',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number(num)).toBe(0.1);
		}
	});

	itSerializesEqual('negative float', {
		in: () => new Number(-0.1),
		out: 'new Number(-0.1)',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number(num)).toBe(-0.1);
		}
	});

	itSerializesEqual('Infinity', {
		in: () => new Number(Infinity),
		out: 'new Number(Infinity)',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number(num)).toBe(Infinity);
		}
	});

	itSerializesEqual('negative Infinity', {
		in: () => new Number(-Infinity),
		out: 'new Number(-Infinity)',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number(num)).toBe(-Infinity);
		}
	});

	itSerializesEqual('NaN', {
		in: () => new Number(undefined * 1),
		out: 'new Number(NaN)',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number(num)).toBe(NaN);
		}
	});

	itSerializesEqual('Number subclass', {
		in() {
			class N extends Number {}
			return new N(1);
		},
		out: `(()=>{
			const a=Number,
				b=Object.setPrototypeOf,
				c=b(
					class N{
						constructor(...a){return Reflect.construct(Object.getPrototypeOf(N),a,N)}
					},a
				).prototype;
			b(c,a.prototype);
			return b(new a(1),c)
		})()`,
		validate(num) {
			expect(typeof num).toBe('object');
			expect(Number(num)).toBe(1);
			const proto = Object.getPrototypeOf(num);
			expect(proto.constructor).toBeFunction();
			expect(proto.constructor.name).toBe('N');
			expect(proto).toHavePrototype(Number.prototype);
		}
	});
});

/* eslint-disable node/no-unsupported-features/es-builtins */
describe('Boxed BigInts', () => {
	itSerializesEqual('zero', {
		in: () => Object(BigInt(0)),
		out: 'Object(0n)',
		validate(bigInt) {
			expect(typeof bigInt).toBe('object');
			expect(typeof bigInt.valueOf()).toBe('bigint');
			expect(bigInt.valueOf()).toBe(BigInt(0));
			expect(bigInt).toHavePrototype(BigInt.prototype);
		}
	});

	itSerializesEqual('small', {
		in: () => Object(BigInt(100)),
		out: 'Object(100n)',
		validate(bigInt) {
			expect(typeof bigInt).toBe('object');
			expect(typeof bigInt.valueOf()).toBe('bigint');
			expect(bigInt.valueOf()).toBe(BigInt(100));
			expect(bigInt).toHavePrototype(BigInt.prototype);
		}
	});

	itSerializesEqual('negative', {
		in: () => Object(BigInt(-100)),
		out: 'Object(-100n)',
		validate(bigInt) {
			expect(typeof bigInt).toBe('object');
			expect(typeof bigInt.valueOf()).toBe('bigint');
			expect(bigInt.valueOf()).toBe(BigInt(-100));
			expect(bigInt).toHavePrototype(BigInt.prototype);
		}
	});

	itSerializesEqual('huge', {
		in: () => Object(BigInt('100000000000000000000')),
		out: 'Object(100000000000000000000n)',
		validate(bigInt) {
			expect(typeof bigInt).toBe('object');
			expect(typeof bigInt.valueOf()).toBe('bigint');
			expect(bigInt.valueOf()).toBe(BigInt('100000000000000000000'));
			expect(bigInt).toHavePrototype(BigInt.prototype);
		}
	});

	itSerializesEqual('BigInt subclass', {
		in() {
			class B extends BigInt {}
			const bigInt = Object(BigInt(100));
			Object.setPrototypeOf(bigInt, B.prototype);
			return bigInt;
		},
		out: `(()=>{
			const a=Object,
				b=a.setPrototypeOf,
				c=BigInt,
				d=b(
					class B{
						constructor(...a){return Reflect.construct(Object.getPrototypeOf(B),a,B)}
					},c
				).prototype;
			b(d,c.prototype);
			return b(a(100n),d)
		})()`,
		validate(bigInt) {
			expect(typeof bigInt).toBe('object');
			expect(typeof bigInt.valueOf()).toBe('bigint');
			expect(bigInt.valueOf()).toBe(BigInt(100));
			const proto = Object.getPrototypeOf(bigInt);
			expect(proto.constructor).toBeFunction();
			expect(proto.constructor.name).toBe('B');
			expect(proto).toHavePrototype(BigInt.prototype);
		}
	});
});
/* eslint-enable node/no-unsupported-features/es-builtins */
