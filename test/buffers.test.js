/* --------------------
 * livepack module
 * Tests for Buffers
 * ------------------*/

'use strict';

// Imports
const {itSerializes, itSerializesEqual} = require('./support/index.js');

// Tests

describe('Buffers', () => {
	describe('nodeJS Buffers', () => {
		itSerializesEqual('without extra props', {
			in: () => Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
			out: 'Buffer.from("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=","base64")',
			validate(buf) {
				expect(buf).toBeInstanceOf(Buffer);
				expect(buf.toString()).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
			}
		});

		itSerializesEqual('with extra props', {
			in() {
				const buf = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
				buf.x = 'bar';
				return buf;
			},
			out: 'Object.assign(Buffer.from("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=","base64"),{x:"bar"})',
			validate(buf) {
				expect(buf).toBeInstanceOf(Buffer);
				expect(buf.toString()).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
				expect(buf.x).toBe('bar');
			}
		});

		itSerializes.skip('Buffer subclass', {
			in() {
				class B extends Buffer {}
				const buf = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
				Object.setPrototypeOf(buf, B.prototype);
				return buf;
			},
			out: `(()=>{
				const a=Buffer,
					b=Object.setPrototypeOf,
					c=(b=>b=class B{
						constructor(...a){return Reflect.construct(Object.getPrototypeOf(b),a,b)}
					})(),
					d=c.prototype;
				b(c,a);
				b(d,a.prototype);
				return b(a.from("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=","base64"),d)
			})()`,
			validate(buf) {
				expect(buf).toBeInstanceOf(Buffer);
				expect(buf.toString()).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
				const proto = Object.getPrototypeOf(buf);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('B');
				expect(proto).toHavePrototype(Buffer.prototype);
			}
		});
	});

	describe('typedArrays', () => {
		describe('zero length', () => {
			itSerializesEqual('Uint8Array', {
				in: () => new Uint8Array([]),
				out: 'new Uint8Array',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint8Array);
					expect(buf).toHaveLength(0);
				}
			});

			itSerializesEqual('Int8Array', {
				in: () => new Int8Array([]),
				out: 'new Int8Array',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int8Array);
					expect(buf).toHaveLength(0);
				}
			});

			itSerializesEqual('Uint16Array', {
				in: () => new Uint16Array([]),
				out: 'new Uint16Array',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint16Array);
					expect(buf).toHaveLength(0);
				}
			});

			itSerializesEqual('Int16Array', {
				in: () => new Int16Array([]),
				out: 'new Int16Array',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int16Array);
					expect(buf).toHaveLength(0);
				}
			});

			itSerializesEqual('Uint32Array', {
				in: () => new Uint32Array([]),
				out: 'new Uint32Array',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint32Array);
					expect(buf).toHaveLength(0);
				}
			});

			itSerializesEqual('Int32Array', {
				in: () => new Int32Array([]),
				out: 'new Int32Array',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int32Array);
					expect(buf).toHaveLength(0);
				}
			});
		});

		describe('zeroed', () => {
			itSerializesEqual('Uint8Array', {
				in: () => new Uint8Array([0, 0, 0, 0]),
				out: 'new Uint8Array(4)',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint8Array);
					expect([...buf]).toEqual([0, 0, 0, 0]);
				}
			});

			itSerializesEqual('Int8Array', {
				in: () => new Int8Array([0, 0, 0, 0]),
				out: 'new Int8Array(4)',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int8Array);
					expect([...buf]).toEqual([0, 0, 0, 0]);
				}
			});

			itSerializesEqual('Uint16Array', {
				in: () => new Uint16Array([0, 0, 0, 0]),
				out: 'new Uint16Array(4)',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint16Array);
					expect([...buf]).toEqual([0, 0, 0, 0]);
				}
			});

			itSerializesEqual('Int16Array', {
				in: () => new Int16Array([0, 0, 0, 0]),
				out: 'new Int16Array(4)',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int16Array);
					expect([...buf]).toEqual([0, 0, 0, 0]);
				}
			});

			itSerializesEqual('Uint32Array', {
				in: () => new Uint32Array([0, 0, 0, 0]),
				out: 'new Uint32Array(4)',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint32Array);
					expect([...buf]).toEqual([0, 0, 0, 0]);
				}
			});

			itSerializesEqual('Int32Array', {
				in: () => new Int32Array([0, 0, 0, 0]),
				out: 'new Int32Array(4)',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int32Array);
					expect([...buf]).toEqual([0, 0, 0, 0]);
				}
			});
		});

		describe('standard', () => {
			itSerializesEqual('Uint8Array', {
				in: () => new Uint8Array([100, 0, 200]),
				out: 'new Uint8Array([100,,200])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint8Array);
					expect([...buf]).toEqual([100, 0, 200]);
				}
			});

			itSerializesEqual('Int8Array', {
				in: () => new Int8Array([100, 0, -56]),
				out: 'new Int8Array([100,,-56])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int8Array);
					expect([...buf]).toEqual([100, 0, -56]);
				}
			});

			itSerializesEqual('Uint16Array', {
				in: () => new Uint16Array([1000, 0, 40000]),
				out: 'new Uint16Array([1000,,40000])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint16Array);
					expect([...buf]).toEqual([1000, 0, 40000]);
				}
			});

			itSerializesEqual('Int16Array', {
				in: () => new Int16Array([1000, 0, -1000]),
				out: 'new Int16Array([1000,,-1000])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int16Array);
					expect([...buf]).toEqual([1000, 0, -1000]);
				}
			});

			itSerializesEqual('Uint32Array', {
				in: () => new Uint32Array([100000, 0, 40000000]),
				out: 'new Uint32Array([100000,,40000000])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint32Array);
					expect([...buf]).toEqual([100000, 0, 40000000]);
				}
			});

			itSerializesEqual('Int32Array', {
				in: () => new Int32Array([100000, 0, -100000]),
				out: 'new Int32Array([100000,,-100000])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int32Array);
					expect([...buf]).toEqual([100000, 0, -100000]);
				}
			});
		});

		describe('in middle of ArrayBuffer', () => {
			itSerializesEqual('Uint8Array', {
				in() {
					const arr = new ArrayBuffer(16);
					const buf = new Uint8Array(arr, 4, 2);
					buf[0] = 100;
					buf[1] = 200;
					return buf;
				},
				out: 'new Uint8Array([100,200])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint8Array);
					expect([...buf]).toEqual([100, 200]);
				}
			});

			itSerializesEqual('Int8Array', {
				in() {
					const arr = new ArrayBuffer(16);
					const buf = new Int8Array(arr, 4, 2);
					buf[0] = 100;
					buf[1] = -56;
					return buf;
				},
				out: 'new Int8Array([100,-56])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int8Array);
					expect([...buf]).toEqual([100, -56]);
				}
			});

			itSerializesEqual('Uint16Array', {
				in() {
					const arr = new ArrayBuffer(16);
					const buf = new Uint16Array(arr, 4, 2);
					buf[0] = 1000;
					buf[1] = 40000;
					return buf;
				},
				out: 'new Uint16Array([1000,40000])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint16Array);
					expect([...buf]).toEqual([1000, 40000]);
				}
			});

			itSerializesEqual('Int16Array', {
				in() {
					const arr = new ArrayBuffer(16);
					const buf = new Int16Array(arr, 4, 2);
					buf[0] = 1000;
					buf[1] = -1000;
					return buf;
				},
				out: 'new Int16Array([1000,-1000])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int16Array);
					expect([...buf]).toEqual([1000, -1000]);
				}
			});

			itSerializesEqual('Uint32Array', {
				in() {
					const arr = new ArrayBuffer(16);
					const buf = new Uint32Array(arr, 4, 2);
					buf[0] = 100000;
					buf[1] = 40000000;
					return buf;
				},
				out: 'new Uint32Array([100000,40000000])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Uint32Array);
					expect([...buf]).toEqual([100000, 40000000]);
				}
			});

			itSerializesEqual('Int32Array', {
				in() {
					const arr = new ArrayBuffer(16);
					const buf = new Int32Array(arr, 4, 2);
					buf[0] = 100000;
					buf[1] = -100000;
					return buf;
				},
				out: 'new Int32Array([100000,-100000])',
				validate(buf) {
					expect(buf).toBeInstanceOf(Int32Array);
					expect([...buf]).toEqual([100000, -100000]);
				}
			});
		});

		describe('typedArrays with prototype altered', () => {
			itSerializes('to null', {
				in() {
					const buf = new Uint16Array([1000, 40000]);
					Object.setPrototypeOf(buf, null);
					return buf;
				},
				out: 'Object.setPrototypeOf(new Uint16Array([1000,40000]),null)',
				validate(buf) {
					expect(buf[0]).toBe(1000);
					expect(buf[1]).toBe(40000);
					expect(buf).toHavePrototype(null);
				}
			});

			itSerializes('to Array prototype', {
				in() {
					const buf = new Uint16Array([1000, 40000]);
					Object.setPrototypeOf(buf, Array.prototype);
					return buf;
				},
				out: 'Object.setPrototypeOf(new Uint16Array([1000,40000]),Array.prototype)',
				validate(buf) {
					expect(buf[0]).toBe(1000);
					expect(buf[1]).toBe(40000);
					expect(buf).toHavePrototype(Array.prototype);
				}
			});

			itSerializes('to another TypedArray prototype', {
				in() {
					const buf = new Uint16Array([1000, 40000]);
					Object.setPrototypeOf(buf, Int8Array.prototype);
					return buf;
				},
				out: 'Object.setPrototypeOf(new Uint16Array([1000,40000]),Int8Array.prototype)',
				validate(buf) {
					expect(buf[0]).toBe(1000);
					expect(buf[1]).toBe(40000);
					expect(buf).toHavePrototype(Int8Array.prototype);
				}
			});
		});

		itSerializes.skip('TypedArray subclass', {
			in() {
				class B extends Uint8Array {}
				return new B([100, 200]);
			},
			out: `(()=>{
				const a=Uint8Array,
					b=Object.setPrototypeOf,
					c=(b=>b=class B{
						constructor(...a){
							return Reflect.construct(Object.getPrototypeOf(b),a,b)
						}
					})(),
					d=c.prototype;
				b(c,a);
				b(d,a.prototype);
				return b(
					new a([100,200]),
					d
				)
			})()`,
			validate(buf) {
				expect(buf).toBeInstanceOf(Uint8Array);
				expect([...buf]).toEqual([100, 200]);
				const proto = Object.getPrototypeOf(buf);
				expect(proto.constructor).toBeFunction();
				expect(proto.constructor.name).toBe('B');
				expect(proto).toHavePrototype(Uint8Array.prototype);
			}
		});
	});

	describe('arrayBuffers', () => {
		itSerializes('zero length', {
			in: () => new ArrayBuffer(0),
			out: 'new ArrayBuffer',
			validate(buf) {
				expect(buf).toHavePrototype(ArrayBuffer.prototype);
				expect(buf.byteLength).toBe(0);
			}
		});

		itSerializes('entirely zeroed', {
			in: () => new ArrayBuffer(8),
			out: 'new ArrayBuffer(8)',
			validate(buf) {
				expect(buf).toHavePrototype(ArrayBuffer.prototype);
				expect(buf.byteLength).toBe(8);
				expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
			}
		});

		itSerializes('not zeroed', {
			in() {
				const buf = new ArrayBuffer(8);
				new Uint8Array(buf).set([0, 1, 2, 3, 0, 15, 16, 0]);
				return buf;
			},
			out: 'new Uint8Array([,1,2,3,,15,16,,]).buffer',
			validate(buf) {
				expect(buf).toHavePrototype(ArrayBuffer.prototype);
				expect(buf.byteLength).toBe(8);
				expect([...new Uint8Array(buf)]).toEqual([0, 1, 2, 3, 0, 15, 16, 0]);
			}
		});

		describe('with prototype set to', () => {
			itSerializes('null', {
				in() {
					const buf = new ArrayBuffer(8);
					Object.setPrototypeOf(buf, null);
					return buf;
				},
				out: 'Object.setPrototypeOf(new ArrayBuffer(8),null)',
				validate(buf) {
					expect(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(buf))
						.toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
					expect(buf).toHavePrototype(null);
				}
			});

			itSerializes('with prototype set to Array.prototype', {
				in() {
					const buf = new ArrayBuffer(8);
					Object.setPrototypeOf(buf, Array.prototype);
					return buf;
				},
				out: 'Object.setPrototypeOf(new ArrayBuffer(8),Array.prototype)',
				validate(buf) {
					expect(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(buf))
						.toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
					expect(buf).toHavePrototype(Array.prototype);
				}
			});
		});
	});

	describe('sharedArrayBuffers', () => {
		itSerializes('zero length', {
			in: () => new SharedArrayBuffer(0),
			out: 'new SharedArrayBuffer',
			validate(buf) {
				expect(buf).toHavePrototype(SharedArrayBuffer.prototype);
				expect(buf.byteLength).toBe(0);
			}
		});

		itSerializes('entirely zeroed', {
			in: () => new SharedArrayBuffer(8),
			out: 'new SharedArrayBuffer(8)',
			validate(buf) {
				expect(buf).toHavePrototype(SharedArrayBuffer.prototype);
				expect(buf.byteLength).toBe(8);
				expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
			}
		});

		describe('not zeroed', () => {
			itSerializes('with all bytes non-zero', {
				in() {
					const buf = new SharedArrayBuffer(8);
					new Uint8Array(buf).set([1, 2, 3, 4, 5, 6, 7, 16]);
					return buf;
				},
				out: `(()=>{
					const a=new SharedArrayBuffer(8);
					new Uint8Array(a).set([1,2,3,4,5,6,7,16]);
					return a
				})()`,
				validate(buf) {
					expect(buf).toHavePrototype(SharedArrayBuffer.prototype);
					expect(buf.byteLength).toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([1, 2, 3, 4, 5, 6, 7, 16]);
				}
			});

			itSerializes('with zero bytes start and end', {
				in() {
					const buf = new SharedArrayBuffer(8);
					new Uint8Array(buf).set([0, 0, 2, 3, 0, 15, 0, 0]);
					return buf;
				},
				out: '(()=>{const a=new SharedArrayBuffer(8);new Uint8Array(a).set([2,3,,15],2);return a})()',
				validate(buf) {
					expect(buf).toHavePrototype(SharedArrayBuffer.prototype);
					expect(buf.byteLength).toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([0, 0, 2, 3, 0, 15, 0, 0]);
				}
			});
		});

		describe('with prototype set to', () => {
			itSerializes('null', {
				in() {
					const buf = new SharedArrayBuffer(8);
					Object.setPrototypeOf(buf, null);
					return buf;
				},
				out: 'Object.setPrototypeOf(new SharedArrayBuffer(8),null)',
				validate(buf) {
					expect(
						Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength')
							.get.call(buf)
					).toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
					expect(buf).toHavePrototype(null);
				}
			});

			itSerializes('with prototype set to Array.prototype', {
				in() {
					const buf = new SharedArrayBuffer(8);
					Object.setPrototypeOf(buf, Array.prototype);
					return buf;
				},
				out: 'Object.setPrototypeOf(new SharedArrayBuffer(8),Array.prototype)',
				validate(buf) {
					expect(
						Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength')
							.get.call(buf)
					).toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
					expect(buf).toHavePrototype(Array.prototype);
				}
			});
		});
	});
});
