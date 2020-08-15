/* --------------------
 * livepack module
 * Tests for object methods
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions, stripLineBreaks} = require('./support/index.js');

// Tests

describeWithAllOptions('Object methods', ({run}) => {
	describe('without descriptors', () => {
		it('plain', () => {
			const yy = 'y';
			function getZ() { return 'z'; }
			const input = {
				x() { return this; },
				[yy]() { return this; },
				[getZ()]() { return this; }
			};

			run(
				input,
				'{x(){return this},y(){return this},z(){return this}}',
				(obj) => {
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
			);
		});

		it('referencing external vars', () => {
			const extA = 1,
				extB = 2,
				extC = 3,
				yy = 'y';
			function getZ() { return 'z'; }
			const input = {
				x() { return extA; },
				[yy]() { return extB; },
				[getZ()]() { return extC; }
			};

			run(
				input,
				'(()=>{const a=((a,b,c)=>[{x(){return a}}.x,{y(){return b}}.y,{z(){return c}}.z])(1,2,3);return{x:a[0],y:a[1],z:a[2]}})()',
				(obj) => {
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
			);
		});

		it('using super', () => {
			const yy = 'y';
			function getZ() { return 'z'; }
			const input = {
				x(q) { return super.x(q * 3); },
				[yy](q) { return super['y'](q * 5); }, // eslint-disable-line dot-notation
				[getZ()]() { return super.z; }
			};
			Object.setPrototypeOf(input, {
				x(q) { return q; },
				[yy](q) { return q * 2; },
				[getZ()](q) { return q * 3; }
			});

			run(
				input,
				stripLineBreaks(`(()=>{
					const a=(b=>[
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
						])(),
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
				})()`),
				(obj) => {
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
			);
		});
	});

	describe('with descriptors', () => {
		it('plain', () => {
			const yy = 'y';
			function getZ() { return 'z'; }
			const input = {
				x() { return this; },
				[yy]() { return this; },
				[getZ()]() { return this; }
			};
			Object.defineProperties(input, {
				x: {writable: false, configurable: false},
				y: {configurable: false}
			});

			run(
				input,
				'Object.defineProperties({},{x:{value:{x(){return this}}.x,enumerable:true},y:{value:{y(){return this}}.y,writable:true,enumerable:true},z:{value:{z(){return this}}.z,writable:true,enumerable:true,configurable:true}})',
				(obj) => {
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
			);
		});

		it('referencing external vars', () => {
			const extA = 1,
				extB = 2,
				extC = 3,
				yy = 'y';
			function getZ() { return 'z'; }
			const input = {
				x() { return extA; },
				[yy]() { return extB; },
				[getZ()]() { return extC; }
			};
			Object.defineProperties(input, {
				x: {writable: false, configurable: false},
				y: {configurable: false}
			});

			run(
				input,
				'(()=>{const a=((a,b,c)=>[{x(){return a}}.x,{y(){return b}}.y,{z(){return c}}.z])(1,2,3);return Object.defineProperties({},{x:{value:a[0],enumerable:true},y:{value:a[1],writable:true,enumerable:true},z:{value:a[2],writable:true,enumerable:true,configurable:true}})})()',
				(obj) => {
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
			);
		});

		it('using super', () => {
			const yy = 'y';
			function getZ() { return 'z'; }
			const input = {
				x(q) { return super.x(q * 3); },
				[yy](q) { return super['y'](q * 5); }, // eslint-disable-line dot-notation
				[getZ()]() { return super.z; }
			};
			Object.defineProperties(input, {
				x: {writable: false, configurable: false},
				y: {configurable: false}
			});
			Object.setPrototypeOf(input, {
				x(q) { return q; },
				[yy](q) { return q * 2; },
				[getZ()](q) { return q * 3; }
			});

			run(
				input,
				stripLineBreaks(`(()=>{
					const a=(b=>[
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
						])(),
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
				})()`),
				(obj) => {
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
			);
		});
	});

	// TODO async + generator + async generator methods
	// TODO getter + setter methods
});
