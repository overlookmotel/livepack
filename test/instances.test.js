/* --------------------
 * livepack module
 * Tests for object instances
 * ------------------*/

'use strict';

// Imports
const {itSerializesEqual} = require('./support/index.js');

// Tests

describe('Instances', () => {
	itSerializesEqual('empty object', {
		in() {
			function F() {}
			return new F();
		},
		out: 'Object.create(function F(){}.prototype)',
		validate(obj) {
			const ctor = Object.getPrototypeOf(obj).constructor;
			expect(ctor).toBeFunction();
			expect(ctor).not.toBe(Object);
			expect(ctor.name).toBe('F');
		}
	});

	describe('with non-circular properties', () => {
		itSerializesEqual('without descriptors', {
			in() {
				function F() {}
				const obj = new F();
				obj.x = 1;
				obj.y = 2;
				return obj;
			},
			out: '(()=>{const a=Object;return a.assign(a.create(function F(){}.prototype),{x:1,y:2})})()',
			validate(obj) {
				const ctor = Object.getPrototypeOf(obj).constructor;
				expect(ctor).toBeFunction();
				expect(ctor).not.toBe(Object);
				expect(ctor.name).toBe('F');
				expect(obj).toContainAllKeys(['x', 'y']);
				expect(obj.x).toBe(1);
				expect(obj.y).toBe(2);
			}
		});

		itSerializesEqual('with descriptors', {
			in() {
				function F() {}
				const obj = new F();
				obj.x = 1;
				Object.defineProperty(obj, 'y', {value: 2, enumerable: true});
				return obj;
			},
			out: `Object.create(
				function F(){}.prototype,
				{
					x:{value:1,writable:true,enumerable:true,configurable:true},
					y:{value:2,enumerable:true}
				}
			)`,
			validate(obj) {
				const ctor = Object.getPrototypeOf(obj).constructor;
				expect(ctor).toBeFunction();
				expect(ctor).not.toBe(Object);
				expect(ctor.name).toBe('F');
				expect(obj).toContainAllKeys(['x', 'y']);
				expect(obj.x).toBe(1);
				expect(obj.y).toBe(2);
				expect(obj).toHaveDescriptorModifiersFor('x', true, true, true);
				expect(obj).toHaveDescriptorModifiersFor('y', false, true, false);
			}
		});
	});

	describe('with circular properties', () => {
		itSerializesEqual('without descriptors', {
			in() {
				function F() {}
				const obj = new F();
				obj.x = obj;
				obj.y = 2;
				obj.z = obj;
				return obj;
			},
			out: `(()=>{
				const a=Object,
					b=a.assign(
						a.create(function F(){}.prototype),
						{x:void 0,y:2}
					);
				b.x=b;
				b.z=b;
				return b
			})()`,
			validate(obj) {
				const ctor = Object.getPrototypeOf(obj).constructor;
				expect(ctor).toBeFunction();
				expect(ctor).not.toBe(Object);
				expect(ctor.name).toBe('F');
				expect(obj).toContainAllKeys(['x', 'y', 'z']);
				expect(obj.x).toBe(obj);
				expect(obj.y).toBe(2);
				expect(obj.z).toBe(obj);
			}
		});

		itSerializesEqual('with descriptors', {
			in() {
				function F() {}
				const obj = new F();
				obj.x = obj;
				obj.y = 2;
				Object.defineProperty(obj, 'z', {value: obj, enumerable: true});
				return obj;
			},
			out: `(()=>{
				const a=Object,
					b=a.assign(
						a.create(function F(){}.prototype),
						{x:void 0,y:2}
					);
				a.defineProperties(b,{x:{value:b},z:{value:b,enumerable:true}});
				return b
			})()`,
			validate(obj) {
				const ctor = Object.getPrototypeOf(obj).constructor;
				expect(ctor).toBeFunction();
				expect(ctor).not.toBe(Object);
				expect(ctor.name).toBe('F');
				expect(obj).toContainAllKeys(['x', 'y', 'z']);
				expect(obj.x).toBe(obj);
				expect(obj.y).toBe(2);
				expect(obj.z).toBe(obj);
				expect(obj).toHaveDescriptorModifiersFor('x', true, true, true);
				expect(obj).toHaveDescriptorModifiersFor('y', true, true, true);
				expect(obj).toHaveDescriptorModifiersFor('z', false, true, false);
			}
		});
	});

	describe('where prototype has getter/setter for own prop', () => {
		describe('getter', () => {
			itSerializesEqual('non-circular', {
				in() {
					function F() {}
					Object.defineProperty(F.prototype, 'x', {get() { return 1; }});
					const obj = new F();
					Object.defineProperty(obj, 'x', {value: 2});
					return obj;
				},
				out: `(()=>{
					const a=Object,
						b=function F(){}.prototype;
					a.defineProperties(b,{x:{get(){return 1}}});
					return a.create(b,{x:{value:2}})
				})()`,
				validate(obj) {
					const ctor = Object.getPrototypeOf(obj).constructor;
					expect(ctor).toBeFunction();
					expect(ctor).not.toBe(Object);
					expect(ctor.name).toBe('F');
					expect(obj).toHaveOwnPropertyNames(['x']);
					expect(obj.x).toBe(2);
				}
			});

			itSerializesEqual('circular', {
				in() {
					function F() {}
					Object.defineProperty(F.prototype, 'x', {get() { return 1; }});
					const obj = new F();
					Object.defineProperty(obj, 'x', {value: obj});
					return obj;
				},
				out: `(()=>{
					const a=Object,
						b=function F(){}.prototype,
						c=a.defineProperties,
						d=a.create(b);
					c(b,{x:{get(){return 1}}});
					c(d,{x:{value:d}});
					return d
				})()`,
				validate(obj) {
					const ctor = Object.getPrototypeOf(obj).constructor;
					expect(ctor).toBeFunction();
					expect(ctor).not.toBe(Object);
					expect(ctor.name).toBe('F');
					expect(obj).toHaveOwnPropertyNames(['x']);
					expect(obj.x).toBe(obj);
				}
			});
		});
	});

	describe('setter', () => {
		itSerializesEqual('non-circular', {
			in() {
				function F() {}
				Object.defineProperty(F.prototype, 'x', {set(v) {}}); // eslint-disable-line no-unused-vars
				const obj = new F();
				Object.defineProperty(obj, 'x', {value: 2});
				return obj;
			},
			out: `(()=>{
				const a=Object,
					b=function F(){}.prototype;
				a.defineProperties(b,{x:{set(a){}}});
				return a.create(b,{x:{value:2}})
			})()`,
			validate(obj) {
				const ctor = Object.getPrototypeOf(obj).constructor;
				expect(ctor).toBeFunction();
				expect(ctor).not.toBe(Object);
				expect(ctor.name).toBe('F');
				expect(obj).toHaveOwnPropertyNames(['x']);
				expect(obj.x).toBe(2);
				expect(obj).toHaveDescriptorModifiersFor('x', false, false, false);
			}
		});

		itSerializesEqual('circular', {
			in() {
				function F() {}
				Object.defineProperty(F.prototype, 'x', {set(v) {}}); // eslint-disable-line no-unused-vars
				const obj = new F();
				Object.defineProperty(obj, 'x', {value: obj});
				return obj;
			},
			out: `(()=>{
				const a=Object,
					b=function F(){}.prototype,
					c=a.defineProperties,
					d=a.create(b);
				c(b,{x:{set(a){}}});
				c(d,{x:{value:d}});
				return d
			})()`,
			validate(obj) {
				const ctor = Object.getPrototypeOf(obj).constructor;
				expect(ctor).toBeFunction();
				expect(ctor).not.toBe(Object);
				expect(ctor.name).toBe('F');
				expect(obj).toHaveOwnPropertyNames(['x']);
				expect(obj.x).toBe(obj);
				expect(obj).toHaveDescriptorModifiersFor('x', false, false, false);
			}
		});
	});
});
