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

	itSerializes.skip('with `toString` property', {
		in() {
			const str = new String('abc');
			str.toString = () => 'e';
			return str;
		},
		out: 'Object.assign(new String("abc"),{toString:(0,()=>"e")})',
		validate(str) {
			expect(typeof str).toBe('object');
			expect(str).toHavePrototype(String.prototype);
			expect(String.prototype.toString.call(str)).toBe('abc');
			expect(String(str)).toBe('e');
			expect(str).toHaveLength(3);
			expect(str.toString).toBeFunction();
			expect(str).toHaveDescriptorModifiersFor('toString', true, true, true);
			expect(str.toString()).toBe('e');
		}
	});

	itSerializes.skip('String subclass', {
		in() {
			class S extends String {}
			return new S('abc');
		},
		out: `(()=>{
			const a=String,
				b=Object.setPrototypeOf,
				c=(b=>b=class S{
					constructor(...a){return Reflect.construct(Object.getPrototypeOf(b),a,b)}
				})(),
				d=c.prototype;
			b(c,a);
			b(d,a.prototype);
			return b(new a("abc"),d)
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

	itSerializes.skip('with `valueOf` property', {
		in() {
			const bool = new Boolean(true);
			bool.valueOf = () => false;
			return bool;
		},
		out: 'Object.assign(new Boolean(1),{valueOf:(0,()=>false)})',
		validate(bool) {
			expect(typeof bool).toBe('object');
			expect(bool).toHavePrototype(Boolean.prototype);
			expect(Boolean.prototype.valueOf.call(bool)).toBe(true);
			expect(bool + '').toBe('false'); // eslint-disable-line prefer-template
			expect(bool.valueOf).toBeFunction();
			expect(bool).toHaveDescriptorModifiersFor('valueOf', true, true, true);
			expect(bool.valueOf()).toBe(false);
		}
	});

	itSerializesEqual.skip('Boolean subclass', {
		in() {
			class B extends Boolean {}
			return new B(true);
		},
		out: `(()=>{
			const a=Boolean,
				b=Object.setPrototypeOf,
				c=(b=>b=class B{
					constructor(...a){return Reflect.construct(Object.getPrototypeOf(b),a,b)}
				})(),
				d=c.prototype;
			b(c,a);
			b(d,a.prototype);
			return b(new a(1),d)
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
			expect(Number(num)).toBeNaN();
		}
	});

	itSerializes.skip('with `valueOf` property', {
		in() {
			const num = new Number(1);
			num.valueOf = () => 2;
			return num;
		},
		out: 'Object.assign(new Number(1),{valueOf:(0,()=>2)})',
		validate(num) {
			expect(typeof num).toBe('object');
			expect(num).toHavePrototype(Number.prototype);
			expect(Number.prototype.valueOf.call(num)).toBe(1);
			expect(Number(num)).toBe(2);
			expect(num.valueOf).toBeFunction();
			expect(num).toHaveDescriptorModifiersFor('valueOf', true, true, true);
			expect(num.valueOf()).toBe(2);
		}
	});

	itSerializesEqual.skip('Number subclass', {
		in() {
			class N extends Number {}
			return new N(1);
		},
		out: `(()=>{
			const a=Number,
				b=Object.setPrototypeOf,
				c=(b=>b=class N{
					constructor(...a){return Reflect.construct(Object.getPrototypeOf(b),a,b)}
				})(),
				d=c.prototype;
			b(c,a);
			b(d,a.prototype);
			return b(new a(1),d)
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

	itSerializesEqual('huge negative', {
		in: () => Object(BigInt('-100000000000000000000')),
		out: 'Object(-100000000000000000000n)',
		validate(bigInt) {
			expect(typeof bigInt).toBe('object');
			expect(typeof bigInt.valueOf()).toBe('bigint');
			expect(bigInt.valueOf()).toBe(BigInt('-100000000000000000000'));
			expect(bigInt).toHavePrototype(BigInt.prototype);
		}
	});

	itSerializesEqual.skip('BigInt subclass', {
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
				d=(b=>b=class B{
					constructor(...a){return Reflect.construct(Object.getPrototypeOf(b),a,b)}
				})(),
				e=d.prototype;
			b(d,c);
			b(e,c.prototype);
			return b(a(100n),e)
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

describe('Boxed Symbols', () => {
	itSerializesEqual('without description', {
		in: () => Object(Symbol()), // eslint-disable-line symbol-description
		out: 'Object(Symbol())',
		validate(sym) {
			expect(typeof sym).toBe('object');
			expect(sym).toHavePrototype(Symbol.prototype);
			const unboxed = sym[Symbol.toPrimitive]();
			expect(typeof unboxed).toBe('symbol');
			expect(unboxed.description).toBeUndefined();
		}
	});

	itSerializesEqual('with description', {
		in: () => Object(Symbol('x')),
		out: 'Object(Symbol("x"))',
		validate(sym) {
			expect(typeof sym).toBe('object');
			expect(sym).toHavePrototype(Symbol.prototype);
			const unboxed = sym[Symbol.toPrimitive]();
			expect(typeof unboxed).toBe('symbol');
			expect(unboxed.description).toBe('x');
		}
	});

	itSerializesEqual('with empty description', {
		in: () => Object(Symbol('')),
		out: 'Object(Symbol(""))',
		validate(sym) {
			expect(typeof sym).toBe('object');
			expect(sym).toHavePrototype(Symbol.prototype);
			const unboxed = sym[Symbol.toPrimitive]();
			expect(typeof unboxed).toBe('symbol');
			expect(unboxed.description).toBe('');
		}
	});

	itSerializes('when unboxed is equal to symbol which was boxed', {
		in() {
			const sym = Symbol('x'),
				boxedSym = Object(sym);
			return [boxedSym, sym];
		},
		out: '(()=>{const a=Symbol("x");return[Object(a),a]})()',
		validate([boxedSym, sym]) {
			expect(typeof boxedSym).toBe('object');
			expect(boxedSym).toHavePrototype(Symbol.prototype);
			const unboxed = boxedSym[Symbol.toPrimitive]();
			expect(unboxed).toBe(sym);
			expect(typeof unboxed).toBe('symbol');
			expect(unboxed.description).toBe('x');
		}
	});

	itSerializesEqual('global symbol', {
		in: () => Object(Symbol.for('x')),
		out: 'Object(Symbol.for("x"))',
		validate(sym, {isOutput, input}) {
			expect(typeof sym).toBe('object');
			expect(sym).toHavePrototype(Symbol.prototype);
			const unboxed = sym[Symbol.toPrimitive]();
			expect(typeof unboxed).toBe('symbol');
			expect(unboxed.description).toBe('x');
			expect(Symbol.keyFor(unboxed)).toBe('x');

			if (isOutput) expect(unboxed).toBe(input[Symbol.toPrimitive]());
		}
	});

	itSerializesEqual('with `description` property', {
		in() {
			const sym = Object(Symbol('x'));
			Object.defineProperty(
				sym, 'description',
				{value: 'y', writable: true, enumerable: true, configurable: true}
			);
			return sym;
		},
		out: `(()=>{
			const a=Object;
			return a.defineProperties(
				a(Symbol("x")),
				{description:{value:"y",writable:true,enumerable:true,configurable:true}}
			)
		})()`,
		validate(sym) {
			expect(typeof sym).toBe('object');
			expect(sym).toHavePrototype(Symbol.prototype);
			expect(sym).toHaveOwnPropertyNames(['description']);
			expect(sym.description).toBe('y');

			const unboxed = sym[Symbol.toPrimitive]();
			expect(typeof unboxed).toBe('symbol');
			expect(unboxed.description).toBe('x');
		}
	});

	itSerializesEqual('with prototype altered', {
		in() {
			const sym = Object(Symbol('x'));
			Object.setPrototypeOf(sym, Function.prototype);
			return sym;
		},
		out: '(()=>{const a=Object;return a.setPrototypeOf(a(Symbol("x")),Function.prototype)})()',
		validate(sym) {
			expect(typeof sym).toBe('object');
			expect(sym).toHavePrototype(Function.prototype);
			expect(sym.description).toBeUndefined();
			const unboxed = Symbol.prototype[Symbol.toPrimitive].call(sym);
			expect(typeof unboxed).toBe('symbol');
			expect(unboxed.description).toBe('x');
		}
	});
});
