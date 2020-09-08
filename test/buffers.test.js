/* --------------------
 * livepack module
 * Tests for Buffers
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions, stripLineBreaks} = require('./support/index.js');

// Tests

describeWithAllOptions('Buffers', ({expectSerializedEqual, run}) => {
	describe('NodeJS Buffers', () => {
		it('without extra props', () => {
			const input = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
			expectSerializedEqual(
				input, 'Buffer.from("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=","base64")',
				(buf) => {
					expect(buf).toBeInstanceOf(Buffer);
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
					expect(buf).toBeInstanceOf(Buffer);
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
					expect(buf).toBeInstanceOf(Buffer);
					expect(buf.toString()).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
					const proto = Object.getPrototypeOf(buf);
					expect(proto.constructor).toBeFunction();
					expect(proto.constructor.name).toBe('B');
					expect(proto).toHavePrototype(Buffer.prototype);
				}
			);
		});
	});

	describe('TypedArrays', () => {
		describe('standard', () => {
			it('Uint8Array', () => { // eslint-disable-line jest/lowercase-name
				const input = new Uint8Array([100, 200]);
				expectSerializedEqual(
					input, 'new Uint8Array([100,200])',
					(buf) => {
						expect(buf).toBeInstanceOf(Uint8Array);
						expect([...buf]).toEqual([100, 200]);
					}
				);
			});

			it('Int8Array', () => { // eslint-disable-line jest/lowercase-name
				const input = new Int8Array([100, -56]);
				expectSerializedEqual(
					input, 'new Int8Array([100,-56])',
					(buf) => {
						expect(buf).toBeInstanceOf(Int8Array);
						expect([...buf]).toEqual([100, -56]);
					}
				);
			});

			it('Uint16Array', () => { // eslint-disable-line jest/lowercase-name
				const input = new Uint16Array([1000, 40000]);
				expectSerializedEqual(
					input, 'new Uint16Array([1000,40000])',
					(buf) => {
						expect(buf).toBeInstanceOf(Uint16Array);
						expect([...buf]).toEqual([1000, 40000]);
					}
				);
			});

			it('Int16Array', () => { // eslint-disable-line jest/lowercase-name
				const input = new Int16Array([1000, -1000]);
				expectSerializedEqual(
					input, 'new Int16Array([1000,-1000])',
					(buf) => {
						expect(buf).toBeInstanceOf(Int16Array);
						expect([...buf]).toEqual([1000, -1000]);
					}
				);
			});

			it('Uint32Array', () => { // eslint-disable-line jest/lowercase-name
				const input = new Uint32Array([100000, 40000000]);
				expectSerializedEqual(
					input, 'new Uint32Array([100000,40000000])',
					(buf) => {
						expect(buf).toBeInstanceOf(Uint32Array);
						expect([...buf]).toEqual([100000, 40000000]);
					}
				);
			});

			it('Int32Array', () => { // eslint-disable-line jest/lowercase-name
				const input = new Int32Array([100000, -100000]);
				expectSerializedEqual(
					input, 'new Int32Array([100000,-100000])',
					(buf) => {
						expect(buf).toBeInstanceOf(Int32Array);
						expect([...buf]).toEqual([100000, -100000]);
					}
				);
			});
		});

		describe('typedArrays with prototype altered', () => {
			it('to null', () => {
				const input = new Uint16Array([1000, 40000]);
				Object.setPrototypeOf(input, null);
				run(
					input, 'Object.setPrototypeOf(new Uint16Array([1000,40000]),null)',
					(buf) => {
						expect(buf[0]).toBe(1000);
						expect(buf[1]).toBe(40000);
						expect(buf).toHavePrototype(null);
					}
				);
			});

			it('to Array prototype', () => {
				const input = new Uint16Array([1000, 40000]);
				Object.setPrototypeOf(input, Array.prototype);
				run(
					input, 'Object.setPrototypeOf(new Uint16Array([1000,40000]),Array.prototype)',
					(buf) => {
						expect(buf[0]).toBe(1000);
						expect(buf[1]).toBe(40000);
						expect(buf).toHavePrototype(Array.prototype);
					}
				);
			});

			it('to another TypedArray prototype', () => {
				const input = new Uint16Array([1000, 40000]);
				Object.setPrototypeOf(input, Int8Array.prototype);
				run(
					input, 'Object.setPrototypeOf(new Uint16Array([1000,40000]),Int8Array.prototype)',
					(buf) => {
						expect(buf[0]).toBe(1000);
						expect(buf[1]).toBe(40000);
						expect(buf).toHavePrototype(Int8Array.prototype);
					}
				);
			});
		});

		it('TypedArray subclass', () => { // eslint-disable-line jest/lowercase-name
			class B extends Uint8Array {}
			const input = new B([100, 200]);

			run(
				input,
				stripLineBreaks(`
				(()=>{
					const a=Uint8Array,
						b=Object.setPrototypeOf,
						c=b(
							class B{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(B),a,B)
								}
							},
							a
						).prototype;
					b(c,a.prototype);
					return b(
						new a([100,200]),
						c
					)
				})()`),
				(buf) => {
					expect(buf).toBeInstanceOf(Uint8Array);
					expect([...buf]).toEqual([100, 200]);
					const proto = Object.getPrototypeOf(buf);
					expect(proto.constructor).toBeFunction();
					expect(proto.constructor.name).toBe('B');
					expect(proto).toHavePrototype(Uint8Array.prototype);
				}
			);
		});
	});

	describe('ArrayBuffers', () => {
		it('entirely zeroed', () => {
			run(
				new ArrayBuffer(8),
				'new ArrayBuffer(8)',
				(buf) => {
					expect(buf).toHavePrototype(ArrayBuffer.prototype);
					expect(buf.byteLength).toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
				}
			);
		});

		it('not zeroed', () => {
			const input = new ArrayBuffer(8);
			new Uint8Array(input).set([0, 1, 2, 3, 4, 15, 16, 0]);
			run(
				input,
				'new Uint8Array([0,1,2,3,4,15,16,0]).buffer',
				(buf) => {
					expect(buf).toHavePrototype(ArrayBuffer.prototype);
					expect(buf.byteLength).toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([0, 1, 2, 3, 4, 15, 16, 0]);
				}
			);
		});

		describe('with prototype set to', () => {
			it('null', () => {
				const input = new ArrayBuffer(8);
				Object.setPrototypeOf(input, null);
				run(
					input, 'Object.setPrototypeOf(new ArrayBuffer(8),null)',
					(buf) => {
						expect(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(buf))
							.toBe(8);
						expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
						expect(buf).toHavePrototype(null);
					}
				);
			});

			it('with prototype set to Array.prototype', () => {
				const input = new ArrayBuffer(8);
				Object.setPrototypeOf(input, Array.prototype);
				run(
					input, 'Object.setPrototypeOf(new ArrayBuffer(8),Array.prototype)',
					(buf) => {
						expect(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(buf))
							.toBe(8);
						expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
						expect(buf).toHavePrototype(Array.prototype);
					}
				);
			});
		});
	});

	describe('SharedArrayBuffers', () => {
		it('entirely zeroed', () => {
			run(
				new SharedArrayBuffer(8),
				'new SharedArrayBuffer(8)',
				(buf) => {
					expect(buf).toHavePrototype(SharedArrayBuffer.prototype);
					expect(buf.byteLength).toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
				}
			);
		});

		it('not zeroed', () => {
			const input = new SharedArrayBuffer(8);
			new Uint8Array(input).set([2, 3, 0, 15], 2);
			run(
				input,
				'(()=>{const a=new SharedArrayBuffer(8);new Uint8Array(a).set([2,3,0,15],2);return a})()',
				(buf) => {
					expect(buf).toHavePrototype(SharedArrayBuffer.prototype);
					expect(buf.byteLength).toBe(8);
					expect([...new Uint8Array(buf)]).toEqual([0, 0, 2, 3, 0, 15, 0, 0]);
				}
			);
		});

		describe('with prototype set to', () => {
			it('null', () => {
				const input = new SharedArrayBuffer(8);
				Object.setPrototypeOf(input, null);
				run(
					input, 'Object.setPrototypeOf(new SharedArrayBuffer(8),null)',
					(buf) => {
						expect(
							Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength')
								.get.call(buf)
						).toBe(8);
						expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
						expect(buf).toHavePrototype(null);
					}
				);
			});

			it('with prototype set to Array.prototype', () => {
				const input = new SharedArrayBuffer(8);
				Object.setPrototypeOf(input, Array.prototype);
				run(
					input, 'Object.setPrototypeOf(new SharedArrayBuffer(8),Array.prototype)',
					(buf) => {
						expect(
							Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength')
								.get.call(buf)
						).toBe(8);
						expect([...new Uint8Array(buf)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
						expect(buf).toHavePrototype(Array.prototype);
					}
				);
			});
		});
	});
});
