/* --------------------
 * livepack module
 * Tests for object methods
 * ------------------*/

'use strict';

// Imports
const {itSerializes} = require('./support/index.js');

// Tests

const unsafeNumberString = (BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)).toString();

describe.skip('Object methods', () => {
	describe('without descriptors', () => {
		itSerializes('plain', {
			in() {
				const yy = 'y';
				function getZ() { return 'z'; }
				return {
					x() { return this; },
					[yy]() { return this; },
					[getZ()]() { return this; }
				};
			},
			out: '{x(){return this},y(){return this},z(){return this}}',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['x', 'y', 'z']);
				const {x, y, z} = obj;
				expect(x).toBeFunction();
				expect(x.prototype).toBeUndefined();
				expect(obj.x()).toBe(obj);
				expect(y).toBeFunction();
				expect(y.prototype).toBeUndefined();
				expect(obj.y()).toBe(obj);
				expect(z).toBeFunction();
				expect(z.prototype).toBeUndefined();
				expect(obj.z()).toBe(obj);
			}
		});

		itSerializes('referencing external vars', {
			in() {
				const extA = 1,
					extB = 2,
					extC = 3,
					yy = 'y';
				function getZ() { return 'z'; }
				return {
					x() { return extA; },
					[yy]() { return extB; },
					[getZ()]() { return extC; }
				};
			},
			out: `(()=>{
				const a=(
					(a,b,c)=>[
						{x(){return a}}.x,
						{y(){return b}}.y,
						{z(){return c}}.z
					]
				)(1,2,3);
				return{x:a[0],y:a[1],z:a[2]}
			})()`,
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['x', 'y', 'z']);
				const {x, y, z} = obj;
				expect(x).toBeFunction();
				expect(x.prototype).toBeUndefined();
				expect(obj.x()).toBe(1);
				expect(y).toBeFunction();
				expect(y.prototype).toBeUndefined();
				expect(obj.y()).toBe(2);
				expect(z).toBeFunction();
				expect(z.prototype).toBeUndefined();
				expect(obj.z()).toBe(3);
			}
		});

		itSerializes('using super', {
			in() {
				const yy = 'y';
				function getZ() { return 'z'; }
				const obj = {
					x(q) { return super.x(q * 3); },
					[yy](q) { return super['y'](q * 5); }, // eslint-disable-line dot-notation
					[getZ()]() { return super.z; }
				};
				Object.setPrototypeOf(obj, {
					x(q) { return q; },
					[yy](q) { return q * 2; },
					[getZ()](q) { return q * 3; }
				});
				return obj;
			},
			out: `(()=>{
				const a=(
						b=>[
							a=>b=a,
							{
								x(a){
									return Reflect.get(Object.getPrototypeOf(b),"x",this).call(this,a*3)
								}
							}.x,
							{
								y(a){
									return Reflect.get(Object.getPrototypeOf(b),"y",this).call(this,a*5)
								}
							}.y,
							{
								z(){
									return Reflect.get(Object.getPrototypeOf(b),"z",this)
								}
							}.z
						]
					)(),
					b=Object,
					c=b.assign(
						b.create({
							x(a){return a},
							y(a){return a*2},
							z(a){return a*3}
						}),
						{x:a[1],y:a[2],z:a[3]}
					);
				a[0](c);
				return c
			})()`,
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['x', 'y', 'z']);
				const {x, y, z} = obj;
				expect(x).toBeFunction();
				expect(x.prototype).toBeUndefined();
				expect(obj.x(1)).toBe(3);
				expect(y).toBeFunction();
				expect(y.prototype).toBeUndefined();
				expect(obj.y(1)).toBe(10);
				expect(z).toBeFunction();
				expect(z.prototype).toBeUndefined();

				const proto = Object.getPrototypeOf(obj);
				expect(proto).toBeObject();
				expect(proto).not.toBe(Object);
				expect(proto).toContainAllKeys(['x', 'y', 'z']);
				const {x: protoX, y: protoY, z: protoZ} = proto;
				expect(protoX).toBeFunction();
				expect(protoX.prototype).toBeUndefined();
				expect(proto.x(1)).toBe(1);
				expect(protoY).toBeFunction();
				expect(protoY.prototype).toBeUndefined();
				expect(proto.y(1)).toBe(2);
				expect(protoZ).toBeFunction();
				expect(protoZ.prototype).toBeUndefined();
				expect(proto.z(1)).toBe(3);

				expect(obj.z()).toBe(proto.z);
			}
		});

		itSerializes('two objects with methods using super in same scope do not have supers confused', {
			// https://github.com/overlookmotel/livepack/issues/294
			in() {
				const obj1 = Object.setPrototypeOf(
					{foo() { return super.foo(); }},
					{foo() { return 1; }}
				);

				const obj2 = Object.setPrototypeOf(
					{foo() { return super.foo(); }},
					{foo() { return 2; }}
				);

				return {obj1, obj2};
			},
			out: `(()=>{
				const a=(a=>[
						b=>a=b,
						{
							foo(){
								return Reflect.get(Object.getPrototypeOf(a),"foo",this).call(this)
							}
						}.foo
					])(),
					b=Object,
					c=b.create,
					d=b.assign,
					e=d(
						c({foo(){return 1}}),
						{foo:a[1]}
					),
					f=(a=>[
						b=>a=b,
						{
							foo(){
								return Reflect.get(Object.getPrototypeOf(a),"foo",this).call(this)
							}
						}.foo
					])(),
					g=d(
						c({foo(){return 2}}),
						{foo:f[1]}
					);
				a[0](e);
				f[0](g);
				return{obj1:e,obj2:g}
			})()`,
			validate({obj1, obj2}) {
				expect(obj1).toBeObject();
				expect(obj1.foo()).toBe(1);
				expect(obj2).toBeObject();
				expect(obj2.foo()).toBe(2);
			}
		});

		itSerializes('using super with scope vars named same as globals used in transpiled super', {
			in() {
				function createObject(Object, Reflect) {
					return {
						x() {
							super.x();
							return [Object, Reflect];
						}
					};
				}
				const obj = createObject(1, 2);
				Object.setPrototypeOf(obj, {
					x() {
						this.y = 3;
					}
				});
				return obj;
			},
			out: `(()=>{
				const a=(
						(b,c)=>a=>[
							b=>a=b,
							{x(){
								Reflect.get(Object.getPrototypeOf(a),"x",this).call(this);
								return[b,c]
							}}.x
						]
					)(1,2)(),
					b=Object,
					c=b.assign(
						b.create(
							{
								x(){this.y=3}
							}
						),
						{
							x:a[1]
						}
					);
				a[0](c);
				return c
			})()`,
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj.x()).toEqual([1, 2]);
				expect(obj.y).toBe(3);
			}
		});

		itSerializes('using super and super var shadowed within method', {
			// NB: This test relates to correct functioning of instrumentation
			in() {
				const obj = {
					x() {
						super.x();
						const obj = 1; // eslint-disable-line no-shadow
						return obj;
					}
				};
				Object.setPrototypeOf(obj, {
					x() {
						this.y = 2;
					}
				});
				return obj;
			},
			out: `(()=>{
				const a=(b=>[
						a=>b=a,
						{
							x(){
								Reflect.get(Object.getPrototypeOf(b),"x",this).call(this);
								const a=1;
								return a
							}
						}.x
					])(),
					b=Object,
					c=b.assign(
						b.create({
							x(){this.y=2}
						}),
						{x:a[1]}
					);
				a[0](c);
				return c
			})()`,
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj.x()).toBe(1);
				expect(obj.y).toBe(2);
			}
		});

		describe('with integer keys', () => {
			itSerializes('wrapped', {
				in() {
					return [
						{'0a'() { return this; }}['0a'], // eslint-disable-line object-shorthand
						{0() { return this; }}[0],
						{1() { return this; }}[1],
						// 4294967294 is max integer key
						{4294967294() { return this; }}[4294967294],
						{4294967295() { return this; }}[4294967295],
						{[Number.MAX_SAFE_INTEGER]() { return this; }}[Number.MAX_SAFE_INTEGER],
						{[unsafeNumberString]() { return this; }}[unsafeNumberString]
					];
				},
				out: `[
					{"0a"(){return this}}["0a"],
					{0(){return this}}[0],
					{1(){return this}}[1],
					{4294967294(){return this}}[4294967294],
					{4294967295(){return this}}[4294967295],
					{9007199254740991(){return this}}[9007199254740991],
					{"9007199254740992"(){return this}}["9007199254740992"]
				]`,
				validate(arr) {
					expect(arr).toBeArrayOfSize(7);
					['0a', '0', '1', '4294967294', '4294967295', '9007199254740991', '9007199254740992'].forEach(
						(name, index) => {
							const fn = arr[index];
							expect(fn).toBeFunction();
							expect(fn.name).toBe(name);
							expect(fn.prototype).toBeUndefined();
							const ctx = {};
							expect(fn.call(ctx)).toBe(ctx);
						}
					);
				}
			});

			itSerializes('unwrapped', {
				// NB: 4294967294 is max integer key
				in: () => ({
					'0a'() { return this; }, // eslint-disable-line object-shorthand
					0() { return this; },
					1() { return this; },
					4294967294() { return this; },
					4294967295() { return this; },
					[Number.MAX_SAFE_INTEGER]() { return this; },
					[unsafeNumberString]() { return this; }
				}),
				out: `{
					0(){return this},
					1(){return this},
					4294967294(){return this},
					"0a"(){return this},
					4294967295(){return this},
					9007199254740991(){return this},
					"9007199254740992"(){return this}
				}`,
				validate(obj) {
					expect(obj).toBeObject();
					const keys = [
						'0', '1', '4294967294', '0a', '4294967295', '9007199254740991', '9007199254740992'
					];
					expect(obj).toContainAllKeys(keys);

					for (const key of keys) {
						const fn = obj[key];
						expect(fn).toBeFunction();
						expect(fn.name).toBe(key);
						expect(fn.prototype).toBeUndefined();
						expect(obj[key]()).toBe(obj);
					}
				}
			});
		});
	});

	describe('with descriptors', () => {
		itSerializes('plain', {
			in() {
				const yy = 'y';
				function getZ() { return 'z'; }
				const obj = {
					x() { return this; },
					[yy]() { return this; },
					[getZ()]() { return this; }
				};
				Object.defineProperties(obj, {
					x: {writable: false, configurable: false},
					y: {configurable: false}
				});
				return obj;
			},
			out: `Object.defineProperties(
				{},
				{
					x:{value:{x(){return this}}.x,enumerable:true},
					y:{value:{y(){return this}}.y,writable:true,enumerable:true},
					z:{value:{z(){return this}}.z,writable:true,enumerable:true,configurable:true}
				}
			)`,
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['x', 'y', 'z']);
				const {x, y, z} = obj;
				expect(x).toBeFunction();
				expect(x.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('x', false, true, false);
				expect(obj.x()).toBe(obj);
				expect(y).toBeFunction();
				expect(y.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('y', true, true, false);
				expect(obj.y()).toBe(obj);
				expect(z).toBeFunction();
				expect(z.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('z', true, true, true);
				expect(obj.z()).toBe(obj);
			}
		});

		itSerializes('referencing external vars', {
			in() {
				const extA = 1,
					extB = 2,
					extC = 3,
					yy = 'y';
				function getZ() { return 'z'; }
				const obj = {
					x() { return extA; },
					[yy]() { return extB; },
					[getZ()]() { return extC; }
				};
				Object.defineProperties(obj, {
					x: {writable: false, configurable: false},
					y: {configurable: false}
				});
				return obj;
			},
			out: `(()=>{
				const a=(
					(a,b,c)=>[
						{x(){return a}}.x,
						{y(){return b}}.y,
						{z(){return c}}.z
					]
				)(1,2,3);
				return Object.defineProperties(
					{},
					{
						x:{value:a[0],enumerable:true},
						y:{value:a[1],writable:true,enumerable:true},
						z:{value:a[2],writable:true,enumerable:true,configurable:true}
					}
				)
			})()`,
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['x', 'y', 'z']);
				const {x, y, z} = obj;
				expect(x).toBeFunction();
				expect(x.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('x', false, true, false);
				expect(obj.x()).toBe(1);
				expect(y).toBeFunction();
				expect(y.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('y', true, true, false);
				expect(obj.y()).toBe(2);
				expect(z).toBeFunction();
				expect(z.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('z', true, true, true);
				expect(obj.z()).toBe(3);
			}
		});

		itSerializes('using super', {
			in() {
				const yy = 'y';
				function getZ() { return 'z'; }
				const obj = {
					x(q) { return super.x(q * 3); },
					[yy](q) { return super['y'](q * 5); }, // eslint-disable-line dot-notation
					[getZ()]() { return super.z; }
				};
				Object.defineProperties(obj, {
					x: {writable: false, configurable: false},
					y: {configurable: false}
				});
				Object.setPrototypeOf(obj, {
					x(q) { return q; },
					[yy](q) { return q * 2; },
					[getZ()](q) { return q * 3; }
				});
				return obj;
			},
			out: `(()=>{
				const a=(
						b=>[
							a=>b=a,
							{
								x(a){
									return Reflect.get(Object.getPrototypeOf(b),"x",this).call(this,a*3)
								}
							}.x,
							{
								y(a){
									return Reflect.get(Object.getPrototypeOf(b),"y",this).call(this,a*5)
								}
							}.y,
							{
								z(){
									return Reflect.get(Object.getPrototypeOf(b),"z",this)
								}
							}.z
						]
					)(),
					b=Object.create(
						{
							x(a){return a},
							y(a){return a*2},
							z(a){return a*3}
						},
						{
							x:{value:a[1],enumerable:true},
							y:{value:a[2],writable:true,enumerable:true},
							z:{value:a[3],writable:true,enumerable:true,configurable:true}
						}
					);
				a[0](b);
				return b
			})()`,
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['x', 'y', 'z']);
				const {x, y, z} = obj;
				expect(x).toBeFunction();
				expect(x.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('x', false, true, false);
				expect(obj.x(1)).toBe(3);
				expect(y).toBeFunction();
				expect(y.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('y', true, true, false);
				expect(obj.y(1)).toBe(10);
				expect(z).toBeFunction();
				expect(z.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('z', true, true, true);

				const proto = Object.getPrototypeOf(obj);
				expect(proto).toBeObject();
				expect(proto).not.toBe(Object);
				expect(proto).toContainAllKeys(['x', 'y', 'z']);
				const {x: protoX, y: protoY, z: protoZ} = proto;
				expect(protoX).toBeFunction();
				expect(protoX.prototype).toBeUndefined();
				expect(proto.x(1)).toBe(1);
				expect(protoY).toBeFunction();
				expect(protoY.prototype).toBeUndefined();
				expect(proto.y(1)).toBe(2);
				expect(protoZ).toBeFunction();
				expect(protoZ.prototype).toBeUndefined();
				expect(proto.z(1)).toBe(3);

				expect(obj.z()).toBe(proto.z);
			}
		});

		itSerializes('with integer keys', {
			in() {
				// NB: 4294967294 is max integer key
				const obj = {
					'0a'() { return this; }, // eslint-disable-line object-shorthand
					0() { return this; },
					1() { return this; },
					4294967294() { return this; },
					4294967295() { return this; },
					[Number.MAX_SAFE_INTEGER]() { return this; },
					[unsafeNumberString]() { return this; }
				};
				for (const key of Object.keys(obj)) {
					Object.defineProperty(obj, key, {writable: false, enumerable: false, configurable: false});
				}
				return obj;
			},
			out: `Object.defineProperties({},{
				0:{value:{0(){return this}}[0]},
				1:{value:{1(){return this}}[1]},
				4294967294:{value:{4294967294(){return this}}[4294967294]},
				"0a":{value:{"0a"(){return this}}["0a"]},
				4294967295:{value:{4294967295(){return this}}[4294967295]},
				9007199254740991:{value:{9007199254740991(){return this}}[9007199254740991]},
				"9007199254740992":{value:{"9007199254740992"(){return this}}["9007199254740992"]}
			})`,
			validate(obj) {
				expect(obj).toBeObject();
				const keys = [
					'0', '1', '4294967294', '0a', '4294967295', '9007199254740991', '9007199254740992'
				];
				expect(obj).toHaveOwnPropertyNames(keys);

				for (const key of keys) {
					const fn = obj[key];
					expect(fn).toBeFunction();
					expect(fn.name).toBe(key);
					expect(fn.prototype).toBeUndefined();
					expect(obj).toHaveDescriptorModifiersFor(key, false, false, false);
					expect(obj[key]()).toBe(obj);
				}
			}
		});

		itSerializes('with key `value`', {
			in: () => Object.defineProperty({}, 'value', {value() { return this; }}),
			out: 'Object.defineProperties({},{value:{value(){return this;}}})',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toHaveOwnPropertyNames(['value']);

				const fn = obj.value;
				expect(fn).toBeFunction();
				expect(fn.name).toBe('value');
				expect(fn.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('value', false, false, false);
				expect(obj.value()).toBe(obj);
			}
		});

		itSerializes('named `get` as property getter', {
			in: () => Object.defineProperty({}, 'x', {get() { return this; }}),
			out: 'Object.defineProperties({},{x:{get(){return this}}})',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toHaveOwnPropertyNames(['x']);
				const fn = Object.getOwnPropertyDescriptor(obj, 'x').get;
				expect(fn.name).toBe('get');
				expect(fn.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('x', undefined, false, false);
				expect(obj.x).toBe(obj);
			}
		});

		itSerializes('named `set` as property setter', {
			in: () => Object.defineProperty({}, 'x', {set(v) { this.y = v; }}),
			out: 'Object.defineProperties({},{x:{set(a){this.y=a}}})',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toHaveOwnPropertyNames(['x']);
				const fn = Object.getOwnPropertyDescriptor(obj, 'x').set;
				expect(fn.name).toBe('set');
				expect(fn.prototype).toBeUndefined();
				expect(obj).toHaveDescriptorModifiersFor('x', undefined, false, false);
				const temp = {};
				obj.x = temp;
				expect(obj.y).toBe(temp);
			}
		});
	});

	itSerializes('async methods', {
		in: () => ({
			async x() { this.y = 1; }
		}),
		out: '{async x(){this.y=1}}',
		validate(obj) {
			expect(obj).toBeObject();
			expect(obj).toContainAllKeys(['x']);
			expect(obj.x).toBeFunction();
			expect(obj.x.prototype).toBeUndefined();
			const res = obj.x();
			expect(res).toBeInstanceOf(Promise);
			expect(obj).toContainAllKeys(['x', 'y']);
			expect(obj.y).toBe(1);
		}
	});

	itSerializes('generator methods', {
		in: () => ({
			*x() { this.y = 1; } // eslint-disable-line require-yield
		}),
		out: '{*x(){this.y=1}}',
		validate(obj) {
			expect(obj).toBeObject();
			expect(obj).toContainAllKeys(['x']);
			expect(obj.x).toBeFunction();
			expect(obj.x.prototype).toBeObject();
			expect(obj.x.prototype).toHaveOwnPropertyNames([]);
			const res = obj.x();
			expect(obj).toContainAllKeys(['x']);
			expect(res).toBeObject();
			res.next();
			expect(obj).toContainAllKeys(['x', 'y']);
			expect(obj.y).toBe(1);
		}
	});

	itSerializes('async generator methods', {
		in: () => ({
			async*x() { this.y = 1; } // eslint-disable-line require-yield
		}),
		out: '{async*x(){this.y=1}}',
		validate(obj) {
			expect(obj).toBeObject();
			expect(obj).toContainAllKeys(['x']);
			expect(obj.x).toBeFunction();
			expect(obj.x.prototype).toBeObject();
			expect(obj.x.prototype).toHaveOwnPropertyNames([]);
			const res = obj.x();
			expect(obj).toContainAllKeys(['x']);
			expect(res).toBeObject();
			expect(res.next()).toBeInstanceOf(Promise);
			expect(obj).toContainAllKeys(['x', 'y']);
			expect(obj.y).toBe(1);
		}
	});

	describe('getter and setter methods', () => {
		itSerializes('without super', {
			in: () => ({
				get x() { return this.y; },
				set x(v) { this.y = v; }
			}),
			out: `Object.defineProperties({},{
				x:{
					get:{"get x"(){return this.y}}["get x"],
					set:{"set x"(a){this.y=a}}["set x"],
					enumerable:true,
					configurable:true
				}
			})`,
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['x']);
				const descriptor = Object.getOwnPropertyDescriptor(obj, 'x');
				expect(descriptor.get).toBeFunction();
				expect(descriptor.set).toBeFunction();
				expect(obj).toHaveDescriptorModifiersFor('x', undefined, true, true);
				expect(obj.x).toBeUndefined();
				obj.x = 1;
				expect(obj).toContainAllKeys(['x', 'y']);
				expect(obj.y).toBe(1);
				expect(obj.x).toBe(1);
			}
		});

		describe('with super', () => {
			itSerializes('standalone assignment', {
				in: () => Object.setPrototypeOf(
					{
						get foo() {
							return super.foo * 2;
						},
						set foo(v) {
							super.foo = v * 5;
						}
					},
					{
						get foo() {
							return 1;
						},
						set foo(v) {
							this.x = v * 3;
						}
					}
				),
				out: `(()=>{
					const a=(
							b=>[
								a=>b=a,
								{"get foo"(){
									return Reflect.get(Object.getPrototypeOf(b),"foo",this)*2
								}}["get foo"],
								{"set foo"(a){
									Reflect.set(Object.getPrototypeOf(b),"foo",a*5,this)
								}}["set foo"]
							]
						)(),
						b=Object,
						c=b.create(
							b.defineProperties({},{
								foo:{
									get:{"get foo"(){return 1}}["get foo"],
									set:{"set foo"(a){this.x=a*3}}["set foo"],
									enumerable:true,
									configurable:true
								}
							}),
							{
								foo:{
									get:a[1],
									set:a[2],
									enumerable:true,
									configurable:true
								}
							}
						);
					a[0](c);
					return c
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['foo']);
					expect(obj.foo).toBe(2);
					obj.foo = 1;
					expect(obj.x).toBe(15);
				}
			});

			itSerializes('assignment part of another expression', {
				// `key` + `value` vars are to check temp vars created by Livepack
				// don't clash with existing vars
				in: () => Object.setPrototypeOf(
					{
						get foo() {
							return super.foo * 2;
						},
						set foo(v) {
							const key = 'f',
								value = 'oo';
							this.y = super[key + value] = v * 5;
						}
					},
					{
						get foo() {
							return 1;
						},
						set foo(v) {
							this.x = v * 3;
						}
					}
				),
				out: `(()=>{
					const a=(
							d=>[
								a=>d=a,
								{"get foo"(){
									return Reflect.get(Object.getPrototypeOf(d),"foo",this)*2
								}}["get foo"],
								{"set foo"(a){
									const b="f",c="oo";
									this.y=((b,c)=>(Reflect.set(Object.getPrototypeOf(d),b,c,this),c))(b+c,a*5)
								}}["set foo"]
							]
						)(),
						b=Object,
						c=b.create(
							b.defineProperties({},{
								foo:{
									get:{"get foo"(){return 1}}["get foo"],
									set:{"set foo"(a){this.x=a*3}}["set foo"],
									enumerable:true,
									configurable:true
								}
							}),
							{
								foo:{
									get:a[1],
									set:a[2],
									enumerable:true,
									configurable:true
								}
							}
						);
					a[0](c);
					return c
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['foo']);
					expect(obj.foo).toBe(2);
					obj.foo = 1;
					expect(obj.x).toBe(15);
					expect(obj.y).toBe(5);
				}
			});
		});
	});

	describe('with computed key containing function', () => {
		itSerializes('not nested', {
			in() {
				return {
					[(() => 'x')()]() { return this; }
				};
			},
			out: '{x(){return this}}',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['x']);
				const {x} = obj;
				expect(x).toBeFunction();
				expect(x.prototype).toBeUndefined();
				expect(obj.x()).toBe(obj);
			}
		});

		itSerializes('nested in another function', {
			in() {
				return function() {
					return {
						[(() => 'x')()]() { return this; }
					};
				};
			},
			out: 'function(){return{[(()=>"x")()](){return this}}}',
			validate(fn) {
				expect(fn).toBeFunction();
				const obj = fn();
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['x']);
				const {x} = obj;
				expect(x).toBeFunction();
				expect(x.prototype).toBeUndefined();
				expect(obj.x()).toBe(obj);
			}
		});
	});

	// Test instrumentation correctly calculating trails following computed method key
	itSerializes('with computed key and containing nested function', {
		in() {
			const ext = 1;
			return function() {
				return {
					[(() => 'x')()]() {
						return () => ext;
					}
				}.x;
			};
		},
		out: '(a=>function(){return{[(()=>"x")()](){return()=>a}}.x})(1)',
		validate(fn) {
			expect(fn).toBeFunction();
			const meth = fn();
			expect(meth).toBeFunction();
			expect(meth.name).toBe('x');
			expect(meth()()).toBe(1);
		}
	});

	itSerializes("defined in another method's computed key", {
		in() {
			let fn;
			const ext = 1;
			const obj = { // eslint-disable-line no-unused-vars
				[
				fn = {
					fn() {
						return [ext, super.toString];
					}
				}.fn
				]() {
					const ext = 2; // eslint-disable-line no-unused-vars, no-shadow
				}
			};
			return fn;
		},
		out: `(()=>{
			const a={},
				b=(b=>a=>({
					fn(){
						return[b,Reflect.get(Object.getPrototypeOf(a),"toString",this)]
					}
				}).fn
			)(1)(a);
			a.fn=b;
			return b
		})()`,
		validate(fn) {
			expect(fn).toBeFunction();
			expect(fn.name).toBe('fn');
			const [ext, superToString] = fn();
			expect(ext).toBe(1);
			expect(superToString).toBe(Object.prototype.toString);
		}
	});

	describe('directives retained', () => {
		/* eslint-disable lines-around-directive */
		describe('in exported method', () => {
			itSerializes('with 1 directive', {
				in: () => ({
					x() {
						'use fake';
						return 1;
					}
				}.x),
				out: '{x(){"use fake";return 1}}.x',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('with multiple directives', {
				in: () => ({
					x() {
						'use fake';
						"use bogus"; // eslint-disable-line quotes
						'use phoney';
						return 1;
					}
				}.x),
				out: '{x(){"use fake";"use bogus";"use phoney";return 1}}.x',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});
		});

		describe('in nested method', () => {
			itSerializes('with 1 directive', {
				in() {
					return {
						x() {
							return {
								y() {
									'use fake';
									return 1;
								}
							};
						}
					}.x;
				},
				out: '{x(){return{y(){"use fake";return 1}}}}.x',
				validate(fn) {
					expect(fn).toBeFunction();
					const obj = fn();
					expect(obj).toBeObject();
					const fnInner = obj.y;
					expect(fnInner).toBeFunction();
					expect(fnInner()).toBe(1);
				}
			});

			itSerializes('with multiple directives', {
				in() {
					return {
						x() {
							return {
								y() {
									'use fake';
									"use bogus"; // eslint-disable-line quotes
									'use phoney';
									return 1;
								}
							};
						}
					}.x;
				},
				out: '{x(){return{y(){"use fake";"use bogus";"use phoney";return 1}}}}.x',
				validate(fn) {
					expect(fn).toBeFunction();
					const obj = fn();
					expect(obj).toBeObject();
					const fnInner = obj.y;
					expect(fnInner).toBeFunction();
					expect(fnInner()).toBe(1);
				}
			});
		});
		/* eslint-enable lines-around-directive */
	});
});
