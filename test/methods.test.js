/* --------------------
 * livepack module
 * Tests for object methods
 * ------------------*/

'use strict';

// Imports
const {itSerializes} = require('./support/index.js');

// Tests

describe('Object methods', () => {
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
						(a,b,c)=>[
							b=>a=b,
							{x(){
								Reflect.get(Object.getPrototypeOf(a),"x",this).call(this);
								return[b,c]
							}}.x
						]
					)(void 0,1,2),
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
					expect(obj.foo).toEqual(2);
					obj.foo = 1;
					expect(obj.x).toBe(15);
				}
			});

			itSerializes('assignment part of another expression', {
				// `temp` var is to check temp var created by livepack doesn't clash with existing var name
				in: () => Object.setPrototypeOf(
					{
						get foo() {
							return super.foo * 2;
						},
						set foo(v) {
							const temp = 'foo';
							this.y = super[temp] = v * 5; // eslint-disable-line no-multi-assign
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
									const b="foo";
									this.y=((b,c)=>(Reflect.set(Object.getPrototypeOf(d),b,c,this),c))(b,a*5)
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
					expect(obj.foo).toEqual(2);
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
});
