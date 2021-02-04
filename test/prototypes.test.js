/* --------------------
 * livepack module
 * Tests for prototypes
 * ------------------*/

'use strict';

// Imports
const {itSerializes} = require('./support/index.js');

// Tests

describe('Prototypes', () => {
	describe('function expressions', () => {
		describe('prototype not altered and', () => {
			itSerializes('function has no other props', {
				in: () => function() {},
				out: 'function(){}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(fn.prototype).toBeObject();
					expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					expect(fn.prototype.constructor).toBe(fn);
					expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
				}
			});

			describe('function has other props', () => {
				describe('without descriptors', () => {
					itSerializes('literals', {
						in() {
							const fn = (0, function() {});
							fn.x = 1;
							fn.y = 2;
							fn.z = 3;
							return fn;
						},
						out: 'Object.assign(function(){},{x:1,y:2,z:3})',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['x', 'y', 'z']);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn.z).toBe(3);
							expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
						}
					});

					itSerializes('repeated', {
						in() {
							const fn = (0, function() {});
							fn.x = {xx: 1};
							fn.y = 2;
							fn.z = fn.x;
							return fn;
						},
						out: '(()=>{const a={xx:1};return Object.assign(function(){},{x:a,y:2,z:a})})()',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['x', 'y', 'z']);
							expect(fn.x).toEqual({xx: 1});
							expect(fn.y).toBe(2);
							expect(fn.z).toBe(fn.x);
							expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
						}
					});

					describe('circular and', () => {
						itSerializes('`name` + `length` props unaltered', {
							in() {
								const fn = (0, function() {});
								fn.x = fn;
								fn.y = 2;
								fn.z = fn;
								return fn;
							},
							out: '(()=>{const a=Object.assign(function(){},{x:void 0,y:2});a.x=a;a.z=a;return a})()',
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
							}
						});

						itSerializes('`name` descriptor altered', {
							in() {
								const fn = (0, function() {});
								Object.defineProperty(fn, 'name', {writable: true});
								fn.x = fn;
								fn.y = 2;
								fn.z = fn;
								return fn;
							},
							out: `(()=>{
								const a=Object.defineProperties(
									function(){},
									{
										name:{writable:true},
										x:{writable:true,enumerable:true,configurable:true},
										y:{value:2,writable:true,enumerable:true,configurable:true}
									}
								);
								a.x=a;
								a.z=a;
								return a
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).toHaveDescriptorModifiersFor('name', true, false, true);
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
							}
						});

						itSerializes('`name` prop deleted', {
							in() {
								const fn = (0, function() {});
								delete fn.name;
								fn.x = fn;
								fn.y = 2;
								fn.z = fn;
								return fn;
							},
							out: `(()=>{
								const a=Object.assign(function(){},{x:void 0,y:2});
								delete a.name;
								a.x=a;
								a.z=a;
								return a
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).not.toHaveOwnProperty('name');
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
							}
						});

						itSerializes('`name` + `length` props deleted', {
							in() {
								const fn = (0, function() {});
								delete fn.name;
								delete fn.length;
								fn.x = fn;
								fn.y = 2;
								fn.z = fn;
								return fn;
							},
							out: `(()=>{
								const a=Object.assign(function(){},{x:void 0,y:2});
								delete a.name;
								delete a.length;
								a.x=a;
								a.z=a;
								return a
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).not.toHaveOwnProperty('name');
								expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
								expect(fn).not.toHaveOwnProperty('length');
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
							}
						});
					});
				});

				describe('with descriptors', () => {
					itSerializes('literals', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'x', {value: 1, enumerable: true});
							fn.y = 2;
							Object.defineProperty(fn, 'z', {value: 3, writable: true, enumerable: true});
							return fn;
						},
						out: `Object.defineProperties(
							function(){},
							{
								x:{value:1,enumerable:true},
								y:{value:2,writable:true,enumerable:true,configurable:true},
								z:{value:3,writable:true,enumerable:true}
							}
						)`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['x', 'y', 'z']);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn.z).toBe(3);
							expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
						}
					});

					itSerializes('repeated', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'x', {value: {xx: 1}, enumerable: true});
							fn.y = 2;
							Object.defineProperty(fn, 'z', {value: fn.x, writable: true, enumerable: true});
							return fn;
						},
						out: `(()=>{
							const a={xx:1};
							return Object.defineProperties(
								function(){},
								{
									x:{value:a,enumerable:true},
									y:{value:2,writable:true,enumerable:true,configurable:true},
									z:{value:a,writable:true,enumerable:true}
								}
							)
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['x', 'y', 'z']);
							expect(fn.x).toEqual({xx: 1});
							expect(fn.y).toBe(2);
							expect(fn.z).toBe(fn.x);
							expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
						}
					});

					describe('circular and', () => {
						itSerializes('`name` + `length` props unaltered', {
							in() {
								const fn = (0, function() {});
								Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
								fn.y = 2;
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a=Object,
									b=a.assign(function(){},{x:void 0,y:2});
								a.defineProperties(
									b,
									{
										x:{value:b,writable:false,configurable:false},
										z:{value:b,writable:true,enumerable:true}
									}
								);
								return b
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
							}
						});

						itSerializes('`name` descriptor altered', {
							in() {
								const fn = (0, function() {});
								Object.defineProperty(fn, 'name', {writable: true});
								Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
								fn.y = 2;
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a=Object.defineProperties,
									b=a(
										function(){},
										{
											name:{writable:true},
											x:{writable:true,enumerable:true,configurable:true},
											y:{value:2,writable:true,enumerable:true,configurable:true}
										}
									);
								a(
									b,
									{
										x:{value:b,writable:false,configurable:false},
										z:{value:b,writable:true,enumerable:true}
									}
								);
								return b
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).toHaveDescriptorModifiersFor('name', true, false, true);
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
							}
						});

						itSerializes('`name` prop deleted', {
							in() {
								const fn = (0, function() {});
								delete fn.name;
								Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
								fn.y = 2;
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a=Object,
									b=a.assign(function(){},{x:void 0,y:2});
								delete b.name;
								a.defineProperties(
									b,
									{
										x:{value:b,writable:false,configurable:false},
										z:{value:b,writable:true,enumerable:true}
									}
								);
								return b
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).not.toHaveOwnProperty('name');
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
							}
						});

						itSerializes('`name` + `length` props deleted', {
							in() {
								const fn = (0, function() {});
								delete fn.name;
								delete fn.length;
								Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
								fn.y = 2;
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a=Object,
									b=a.assign(function(){},{x:void 0,y:2});
								delete b.name;
								delete b.length;
								a.defineProperties(
									b,
									{
										x:{value:b,writable:false,configurable:false},
										z:{value:b,writable:true,enumerable:true}
									}
								);
								return b
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).not.toHaveOwnProperty('name');
								expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
								expect(fn).not.toHaveOwnProperty('length');
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
							}
						});
					});
				});
			});
		});

		describe('unaltered prototype accessed directly', () => {
			itSerializes('function has no other props', {
				in: () => (function() {}).prototype,
				out: 'function(){}.prototype',
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['constructor']);
					expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
					const fn = proto.constructor;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(fn.prototype).toBe(proto);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
				}
			});

			describe('function has other props', () => {
				describe('without descriptors', () => {
					itSerializes('literals', {
						in() {
							const fn = (0, function() {});
							fn.x = 1;
							fn.y = 2;
							fn.z = 3;
							return fn.prototype;
						},
						out: 'Object.assign(function(){},{x:1,y:2,z:3}).prototype',
						validate(proto) {
							expect(proto).toBeObject();
							expect(proto).toHaveOwnPropertyNames(['constructor']);
							expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
							const fn = proto.constructor;
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['x', 'y', 'z']);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn.z).toBe(3);
							expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
							expect(fn.prototype).toBe(proto);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					});

					itSerializes('repeated', {
						in() {
							const fn = (0, function() {});
							fn.x = {xx: 1};
							fn.y = 2;
							fn.z = fn.x;
							return fn.prototype;
						},
						out: '(()=>{const a={xx:1};return Object.assign(function(){},{x:a,y:2,z:a}).prototype})()',
						validate(proto) {
							expect(proto).toBeObject();
							expect(proto).toHaveOwnPropertyNames(['constructor']);
							expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
							const fn = proto.constructor;
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['x', 'y', 'z']);
							expect(fn.x).toEqual({xx: 1});
							expect(fn.y).toBe(2);
							expect(fn.z).toBe(fn.x);
							expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
							expect(fn.prototype).toBe(proto);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					});

					describe('circular and', () => {
						itSerializes('`name` + `length` props unaltered', {
							in() {
								const fn = (0, function() {});
								fn.x = fn;
								fn.y = 2;
								fn.z = fn;
								return fn.prototype;
							},
							out: `(()=>{
								const a=Object.assign(function(){},{x:void 0,y:2});
								a.x=a;
								a.z=a;
								return a.prototype
							})()`,
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('`name` descriptor altered', {
							in() {
								const fn = (0, function() {});
								Object.defineProperty(fn, 'name', {writable: true});
								fn.x = fn;
								fn.y = 2;
								fn.z = fn;
								return fn.prototype;
							},
							out: `(()=>{
								const a=Object.defineProperties(
									function(){},
									{
										name:{writable:true},
										x:{writable:true,enumerable:true,configurable:true},
										y:{value:2,writable:true,enumerable:true,configurable:true}
									}
								);
								a.x=a;
								a.z=a;
								return a.prototype
							})()`,
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).toHaveDescriptorModifiersFor('name', true, false, true);
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('`name` prop deleted', {
							in() {
								const fn = (0, function() {});
								delete fn.name;
								fn.x = fn;
								fn.y = 2;
								fn.z = fn;
								return fn.prototype;
							},
							out: `(()=>{
								const a=Object.assign(function(){},{x:void 0,y:2});
								delete a.name;
								a.x=a;
								a.z=a;
								return a.prototype
							})()`,
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).not.toHaveOwnProperty('name');
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('`name` + `length` props deleted', {
							in() {
								const fn = (0, function() {});
								delete fn.name;
								delete fn.length;
								fn.x = fn;
								fn.y = 2;
								fn.z = fn;
								return fn.prototype;
							},
							out: `(()=>{
								const a=Object.assign(function(){},{x:void 0,y:2});
								delete a.name;
								delete a.length;
								a.x=a;
								a.z=a;
								return a.prototype
							})()`,
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).not.toHaveOwnProperty('name');
								expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
								expect(fn).not.toHaveOwnProperty('length');
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});
				});

				describe('with descriptors', () => {
					itSerializes('literals', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'x', {value: 1, enumerable: true});
							fn.y = 2;
							Object.defineProperty(fn, 'z', {value: 3, writable: true, enumerable: true});
							return fn.prototype;
						},
						out: `Object.defineProperties(
							function(){},
							{
								x:{value:1,enumerable:true},
								y:{value:2,writable:true,enumerable:true,configurable:true},
								z:{value:3,writable:true,enumerable:true}
							}
						).prototype`,
						validate(proto) {
							expect(proto).toBeObject();
							expect(proto).toHaveOwnPropertyNames(['constructor']);
							expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
							const fn = proto.constructor;
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['x', 'y', 'z']);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn.z).toBe(3);
							expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
							expect(fn.prototype).toBe(proto);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					});

					itSerializes('repeated', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'x', {value: {xx: 1}, enumerable: true});
							fn.y = 2;
							Object.defineProperty(fn, 'z', {value: fn.x, writable: true, enumerable: true});
							return fn.prototype;
						},
						out: `(()=>{
							const a={xx:1};
							return Object.defineProperties(
								function(){},
								{
									x:{value:a,enumerable:true},
									y:{value:2,writable:true,enumerable:true,configurable:true},
									z:{value:a,writable:true,enumerable:true}
								}
							).prototype
						})()`,
						validate(proto) {
							expect(proto).toBeObject();
							expect(proto).toHaveOwnPropertyNames(['constructor']);
							expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
							const fn = proto.constructor;
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['x', 'y', 'z']);
							expect(fn.x).toEqual({xx: 1});
							expect(fn.y).toBe(2);
							expect(fn.z).toBe(fn.x);
							expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
							expect(fn.prototype).toBe(proto);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					});

					describe('circular and', () => {
						itSerializes('`name` + `length` props unaltered', {
							in() {
								const fn = (0, function() {});
								Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
								fn.y = 2;
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn.prototype;
							},
							out: `(()=>{
								const a=Object,
									b=a.assign(function(){},{x:void 0,y:2});
								a.defineProperties(
									b,
									{
										x:{value:b,writable:false,configurable:false},
										z:{value:b,writable:true,enumerable:true}
									}
								);
								return b.prototype
							})()`,
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('`name` descriptor altered', {
							in() {
								const fn = (0, function() {});
								Object.defineProperty(fn, 'name', {writable: true});
								Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
								fn.y = 2;
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn.prototype;
							},
							out: `(()=>{
								const a=Object.defineProperties,
									b=a(
										function(){},
										{
											name:{writable:true},
											x:{writable:true,enumerable:true,configurable:true},
											y:{value:2,writable:true,enumerable:true,configurable:true}
										}
									);
								a(
									b,
									{
										x:{value:b,writable:false,configurable:false},
										z:{value:b,writable:true,enumerable:true}
									}
								);
								return b.prototype
							})()`,
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).toHaveDescriptorModifiersFor('name', true, false, true);
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('`name` prop deleted', {
							in() {
								const fn = (0, function() {});
								delete fn.name;
								Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
								fn.y = 2;
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn.prototype;
							},
							out: `(()=>{
								const a=Object,
									b=a.assign(function(){},{x:void 0,y:2});
								delete b.name;
								a.defineProperties(
									b,
									{
										x:{value:b,writable:false,configurable:false},
										z:{value:b,writable:true,enumerable:true}
									}
								);
								return b.prototype
							})()`,
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).not.toHaveOwnProperty('name');
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('`name` + `length` props deleted', {
							in() {
								const fn = (0, function() {});
								delete fn.name;
								delete fn.length;
								Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
								fn.y = 2;
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn.prototype;
							},
							out: `(()=>{
								const a=Object,
									b=a.assign(function(){},{x:void 0,y:2});
								delete b.name;
								delete b.length;
								a.defineProperties(
									b,
									{
										x:{value:b,writable:false,configurable:false},
										z:{value:b,writable:true,enumerable:true}
									}
								);
								return b.prototype
							})()`,
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn.name).toBe('');
								expect(fn).not.toHaveOwnProperty('name');
								expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
								expect(fn).not.toHaveOwnProperty('length');
								expect(fn).toContainAllKeys(['x', 'y', 'z']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(2);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});
				});
			});
		});

		describe('prototype substituted with', () => {
			describe('empty object and', () => {
				itSerializes('function has no other props', {
					in() {
						const fn = (0, function() {});
						fn.prototype = {};
						return fn;
					},
					out: 'Object.assign(function(){},{prototype:{}})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.prototype).toEqual({});
						expect(fn.prototype).toHaveOwnPropertyNames([]);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					}
				});

				describe('function has other props', () => {
					describe('without descriptors', () => {
						itSerializes('literals', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {};
								fn.x = 1;
								fn.y = 2;
								return fn;
							},
							out: 'Object.assign(function(){},{prototype:{},x:1,y:2})',
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y']);
								expect(fn.x).toBe(1);
								expect(fn.y).toBe(2);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn.prototype).toEqual({});
								expect(fn.prototype).toHaveOwnPropertyNames([]);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('repeated', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {};
								fn.x = {xx: 1};
								fn.y = fn.x;
								return fn;
							},
							out: '(()=>{const a={xx:1};return Object.assign(function(){},{prototype:{},x:a,y:a})})()',
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y']);
								expect(fn.x).toEqual({xx: 1});
								expect(fn.y).toBe(fn.x);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn.prototype).toEqual({});
								expect(fn.prototype).toHaveOwnPropertyNames([]);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('circular', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {};
								fn.x = fn;
								fn.y = fn;
								return fn;
							},
							out: '(()=>{const a=Object.assign(function(){},{prototype:{}});a.x=a;a.y=a;return a})()',
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn.prototype).toEqual({});
								expect(fn.prototype).toHaveOwnPropertyNames([]);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});

					describe('with descriptors', () => {
						itSerializes('literals', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {};
								Object.defineProperty(fn, 'x', {value: 1, enumerable: true});
								Object.defineProperty(fn, 'y', {value: 2, writable: true, enumerable: true});
								return fn;
							},
							out: `Object.defineProperties(
								function(){},
								{
									prototype:{value:{}},
									x:{value:1,enumerable:true},
									y:{value:2,writable:true,enumerable:true}
								}
							)`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y']);
								expect(fn.x).toBe(1);
								expect(fn.y).toBe(2);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, false);
								expect(fn.prototype).toEqual({});
								expect(fn.prototype).toHaveOwnPropertyNames([]);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('repeated', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {};
								Object.defineProperty(fn, 'x', {value: {xx: 1}, enumerable: true});
								Object.defineProperty(fn, 'y', {value: fn.x, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a={xx:1};
								return Object.defineProperties(
									function(){},
									{
										prototype:{value:{}},
										x:{value:a,enumerable:true},
										y:{value:a,writable:true,enumerable:true}
									}
								)
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y']);
								expect(fn.x).toEqual({xx: 1});
								expect(fn.y).toBe(fn.x);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, false);
								expect(fn.prototype).toEqual({});
								expect(fn.prototype).toHaveOwnPropertyNames([]);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('circular', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {};
								Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
								Object.defineProperty(fn, 'y', {value: fn, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a=Object,
									b=a.assign(function(){},{prototype:{}});
								a.defineProperties(
									b,
									{
										x:{value:b,enumerable:true},
										y:{value:b,writable:true,enumerable:true}
									}
								);
								return b
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['x', 'y']);
								expect(fn.x).toBe(fn);
								expect(fn.y).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, false);
								expect(fn.prototype).toEqual({});
								expect(fn.prototype).toHaveOwnPropertyNames([]);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});
				});
			});

			describe('object with props and', () => {
				itSerializes('function has no other props', {
					in() {
						const fn = (0, function() {});
						fn.prototype = {x: 1, y: 2};
						return fn;
					},
					out: 'Object.assign(function(){},{prototype:{x:1,y:2}})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.prototype).toEqual({x: 1, y: 2});
						expect(fn.prototype).toHaveOwnPropertyNames(['x', 'y']);
						expect(fn.prototype).toHaveDescriptorModifiersFor('x', true, true, true);
						expect(fn.prototype).toHaveDescriptorModifiersFor('y', true, true, true);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					}
				});

				describe('function has other props', () => {
					describe('without descriptors', () => {
						itSerializes('literals', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: 1, x: 2};
								fn.y = 3;
								fn.z = 4;
								return fn;
							},
							out: 'Object.assign(function(){},{prototype:{w:1,x:2},y:3,z:4})',
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(3);
								expect(fn.z).toBe(4);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toEqual({w: 1, x: 2});
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('repeated', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: 1, x: 2};
								fn.y = {xx: 1};
								fn.z = fn.y;
								return fn;
							},
							out: `(()=>{
								const a={xx:1};
								return Object.assign(function(){},{prototype:{w:1,x:2},y:a,z:a})
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toEqual({xx: 1});
								expect(fn.z).toBe(fn.y);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toEqual({w: 1, x: 2});
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('circular', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: 1, x: 2};
								fn.y = fn;
								fn.z = fn;
								return fn;
							},
							out: `(()=>{
								const a=Object.assign(function(){},{prototype:{w:1,x:2}});
								a.y=a;
								a.z=a;
								return a
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(fn);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toEqual({w: 1, x: 2});
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});

					describe('with descriptors', () => {
						itSerializes('literals', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: 1, x: 2};
								Object.defineProperty(fn, 'y', {value: 3, enumerable: true});
								Object.defineProperty(fn, 'z', {value: 4, writable: true, enumerable: true});
								return fn;
							},
							out: `Object.defineProperties(
								function(){},
								{
									prototype:{value:{w:1,x:2}},
									y:{value:3,enumerable:true},
									z:{value:4,writable:true,enumerable:true}
								}
							)`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(3);
								expect(fn.z).toBe(4);
								expect(fn).toHaveDescriptorModifiersFor('y', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toEqual({w: 1, x: 2});
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('repeated', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: 1, x: 2};
								Object.defineProperty(fn, 'y', {value: {xx: 1}, enumerable: true});
								Object.defineProperty(fn, 'z', {value: fn.y, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a={xx:1};
								return Object.defineProperties(
									function(){},
									{
										prototype:{value:{w:1,x:2}},
										y:{value:a,enumerable:true},
										z:{value:a,writable:true,enumerable:true}
									}
								)
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toEqual({xx: 1});
								expect(fn.z).toBe(fn.y);
								expect(fn).toHaveDescriptorModifiersFor('y', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toEqual({w: 1, x: 2});
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('circular', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: 1, x: 2};
								Object.defineProperty(fn, 'y', {value: fn, enumerable: true});
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a=Object,
									b=a.assign(function(){},{prototype:{w:1,x:2}});
								a.defineProperties(
									b,
									{
										y:{value:b,enumerable:true},
										z:{value:b,writable:true,enumerable:true}
									}
								);
								return b
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(fn);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('y', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toEqual({w: 1, x: 2});
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});
				});
			});

			describe('object with circular props and', () => {
				itSerializes('function has no other props', {
					in() {
						const fn = (0, function() {});
						fn.prototype = {x: fn, y: fn};
						return fn;
					},
					out: `(()=>{
						const a={},
							b=Object.assign(function(){},{prototype:a});
						a.x=b;
						a.y=b;
						return b
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.prototype).toBeObject();
						expect(fn.prototype).toHaveOwnPropertyNames(['x', 'y']);
						expect(fn.prototype.x).toBe(fn);
						expect(fn.prototype.y).toBe(fn);
						expect(fn.prototype).toHaveDescriptorModifiersFor('x', true, true, true);
						expect(fn.prototype).toHaveDescriptorModifiersFor('y', true, true, true);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					}
				});

				describe('function has other props', () => {
					describe('without descriptors', () => {
						itSerializes('literals', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: fn, x: fn};
								fn.y = 3;
								fn.z = 4;
								return fn;
							},
							out: `(()=>{
								const a={},
									b=Object.assign(function(){},{prototype:a,y:3,z:4});
								a.w=b;
								a.x=b;
								return b
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(3);
								expect(fn.z).toBe(4);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn.prototype.w).toBe(fn);
								expect(fn.prototype.x).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('repeated', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: fn, x: fn};
								fn.y = {xx: 1};
								fn.z = fn.y;
								return fn;
							},
							out: `(()=>{
								const a={},
									b={xx:1},
									c=Object.assign(function(){},{prototype:a,y:b,z:b});
								a.w=c;
								a.x=c;
								return c
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toEqual({xx: 1});
								expect(fn.z).toBe(fn.y);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn.prototype.w).toBe(fn);
								expect(fn.prototype.x).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('circular', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: fn, x: fn};
								fn.y = fn;
								fn.z = fn;
								return fn;
							},
							out: `(()=>{
								const a={},
									b=Object.assign(function(){},{prototype:a});
								a.w=b;
								a.x=b;
								b.y=b;
								b.z=b;
								return b
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(fn);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn.prototype.w).toBe(fn);
								expect(fn.prototype.x).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});

					describe('with descriptors', () => {
						itSerializes('literals', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: fn, x: fn};
								Object.defineProperty(fn, 'y', {value: 3, enumerable: true});
								Object.defineProperty(fn, 'z', {value: 4, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a={},
									b=Object.defineProperties(
										function(){},
										{
											prototype:{value:a},
											y:{value:3,enumerable:true},
											z:{value:4,writable:true,enumerable:true}
										}
									);
								a.w=b;
								a.x=b;
								return b
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(3);
								expect(fn.z).toBe(4);
								expect(fn).toHaveDescriptorModifiersFor('y', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn.prototype.w).toBe(fn);
								expect(fn.prototype.x).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('repeated', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: fn, x: fn};
								Object.defineProperty(fn, 'y', {value: {xx: 1}, enumerable: true});
								Object.defineProperty(fn, 'z', {value: fn.y, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a={},
									b={xx:1},
									c=Object.defineProperties(
										function(){},
										{
											prototype:{value:a},
											y:{value:b,enumerable:true},
											z:{value:b,writable:true,enumerable:true}
										}
									);
								a.w=c;
								a.x=c;
								return c
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toEqual({xx: 1});
								expect(fn.z).toBe(fn.y);
								expect(fn).toHaveDescriptorModifiersFor('y', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn.prototype.w).toBe(fn);
								expect(fn.prototype.x).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});

						itSerializes('circular', {
							in() {
								const fn = (0, function() {});
								fn.prototype = {w: fn, x: fn};
								Object.defineProperty(fn, 'y', {value: fn, enumerable: true});
								Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
								return fn;
							},
							out: `(()=>{
								const a={},
									b=Object,
									c=b.assign(function(){},{prototype:a});
								a.w=c;
								a.x=c;
								b.defineProperties(
									c,
									{
										y:{value:c,enumerable:true},
										z:{value:c,writable:true,enumerable:true}
									}
								);
								return c
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(fn);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('y', false, true, false);
								expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
								expect(fn.prototype).toBeObject();
								expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
								expect(fn.prototype.w).toBe(fn);
								expect(fn.prototype.x).toBe(fn);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});
				});
			});

			describe('function and', () => {
				itSerializes('function has no other props', {
					in() {
						const fn = (0, function() {});
						fn.prototype = function() {};
						return fn;
					},
					out: 'Object.assign(function(){},{prototype:(0,function(){})})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.prototype).toBeFunction();
						expect(fn.prototype).not.toBe(fn);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					}
				});

				itSerializes('function has other props', {
					in() {
						const fn = (0, function() {});
						fn.prototype = function() {};
						fn.x = 1;
						fn.y = 2;
						return fn;
					},
					out: 'Object.assign(function(){},{prototype:(0,function(){}),x:1,y:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.prototype).toBeFunction();
						expect(fn.prototype).not.toBe(fn);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						expect(fn.x).toBe(1);
						expect(fn.y).toBe(2);
						expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
						expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
					}
				});
			});

			describe('Array', () => { // eslint-disable-line jest/lowercase-name
				describe('and', () => {
					itSerializes('function has no other props', {
						in() {
							const fn = (0, function() {});
							fn.prototype = [1, 2, 3];
							return fn;
						},
						out: 'Object.assign(function(){},{prototype:[1,2,3]})',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn.prototype).toBeArrayOfSize(3);
							expect(fn.prototype).toEqual([1, 2, 3]);
							expect(fn.prototype).toHavePrototype(Array.prototype);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					});

					itSerializes('function has other props', {
						in() {
							const fn = (0, function() {});
							fn.prototype = [1, 2, 3];
							fn.x = 1;
							fn.y = 2;
							return fn;
						},
						out: 'Object.assign(function(){},{prototype:[1,2,3],x:1,y:2})',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn.prototype).toBeArrayOfSize(3);
							expect(fn.prototype).toEqual([1, 2, 3]);
							expect(fn.prototype).toHavePrototype(Array.prototype);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
						}
					});
				});

				describe('with constructor added and', () => {
					itSerializes('no [Symbol.toStringTag] property', {
						in() {
							const fn = (0, function() {});
							fn.prototype = [1, 2, 3];
							fn.prototype.constructor = fn;
							return fn;
						},
						out: `(()=>{
							const a=[1,2,3],
								b=Object.assign(function(){},{prototype:a});
							a.constructor=b;
							return b
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							const {prototype} = fn;
							expect(prototype).toBeArrayOfSize(3);
							expect(prototype).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'constructor']);
							expect([...prototype]).toEqual([1, 2, 3]);
							expect(prototype).toHavePrototype(Array.prototype);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(prototype.constructor).toBe(fn);
							expect(prototype).toHaveDescriptorModifiersFor('constructor', true, true, true);
						}
					});

					itSerializes('with [Symbol.toStringTag] property', {
						in() {
							const fn = (0, function() {});
							fn.prototype = [1, 2, 3];
							fn.prototype[Symbol.toStringTag] = 'Object';
							fn.prototype.constructor = fn;
							return fn;
						},
						out: `(()=>{
							const a=Object.assign,
								b=a([1,2,3],{[Symbol.toStringTag]:"Object"}),
								c=a(function(){},{prototype:b});
							b.constructor=c;
							return c
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							const {prototype} = fn;
							expect(prototype).toBeArrayOfSize(3);
							expect(prototype).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'constructor']);
							expect([...prototype]).toEqual([1, 2, 3]);
							expect(prototype).toHavePrototype(Array.prototype);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(prototype.constructor).toBe(fn);
							expect(prototype).toHaveDescriptorModifiersFor('constructor', true, true, true);
							expect(prototype[Symbol.toStringTag]).toBe('Object');
							expect(prototype).toHaveDescriptorModifiersFor(Symbol.toStringTag, true, true, true);
							expect(Object.prototype.toString.call(prototype)).toBe('[object Object]');
						}
					});

					itSerializes("with [Symbol.toStringTag] property on prototype's proto", {
						in() {
							const fn = (0, function() {});
							const proto = [1, 2, 3];
							proto.constructor = fn;
							fn.prototype = proto;
							const superProto = {[Symbol.toStringTag]: 'Object'};
							Object.setPrototypeOf(superProto, Array.prototype);
							Object.setPrototypeOf(proto, superProto);
							return fn;
						},
						out: `(()=>{
							const a=Object,
								b=a.assign,
								c=a.setPrototypeOf(
									[1,2,3],
									b(
										a.create(Array.prototype),
										{[Symbol.toStringTag]:"Object"}
									)
								),
								d=b(function(){},{prototype:c});
							c.constructor=d;
							return d
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							const {prototype} = fn;
							expect(prototype).toBeArrayOfSize(3);
							expect(prototype).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'constructor']);
							expect([...prototype]).toEqual([1, 2, 3]);
							const prototypeProto = Object.getPrototypeOf(prototype);
							expect(typeof prototypeProto).toBe('object');
							// expect(prototypeProto).toHaveOwnPropertyNames([]);
							expect(prototypeProto).toHaveOwnPropertySymbols([Symbol.toStringTag]);
							expect(prototypeProto[Symbol.toStringTag]).toBe('Object');
							expect(prototypeProto).toHaveDescriptorModifiersFor(
								Symbol.toStringTag, true, true, true
							);
							expect(prototypeProto).toHavePrototype(Array.prototype);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(prototype.constructor).toBe(fn);
							expect(prototype).toHaveDescriptorModifiersFor('constructor', true, true, true);
							expect(Object.prototype.toString.call(prototype)).toBe('[object Object]');
						}
					});
				});
			});

			describe('literal and', () => {
				itSerializes('function has no other props', {
					in() {
						const fn = (0, function() {});
						fn.prototype = 123;
						return fn;
					},
					out: 'Object.assign(function(){},{prototype:123})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.prototype).toBe(123);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					}
				});

				itSerializes('function has other props', {
					in() {
						const fn = (0, function() {});
						fn.prototype = 123;
						fn.x = 1;
						fn.y = 2;
						return fn;
					},
					out: 'Object.assign(function(){},{prototype:123,x:1,y:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.prototype).toBe(123);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						expect(fn.x).toBe(1);
						expect(fn.y).toBe(2);
						expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
						expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
					}
				});
			});
		});

		describe('prototype descriptor altered and', () => {
			itSerializes('function has no other props', {
				in() {
					const fn = (0, function() {});
					Object.defineProperty(fn, 'prototype', {writable: false});
					return fn;
				},
				out: 'Object.defineProperties(function(){},{prototype:{writable:false}})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.prototype).toBeObject();
					expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', false, false, false);
					expect(fn.prototype.constructor).toBe(fn);
					expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
				}
			});

			describe('function has other props', () => {
				describe('without descriptors', () => {
					itSerializes('literals', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'prototype', {writable: false});
							fn.y = 3;
							fn.z = 4;
							return fn;
						},
						out: `Object.defineProperties(
							function(){},
							{
								prototype:{writable:false},
								y:{value:3,writable:true,enumerable:true,configurable:true},
								z:{value:4,writable:true,enumerable:true,configurable:true}
							}
						)`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['y', 'z']);
							expect(fn.y).toBe(3);
							expect(fn.z).toBe(4);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('prototype', false, false, false);
						}
					});

					itSerializes('repeated', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'prototype', {writable: false});
							fn.y = {xx: 1};
							fn.z = fn.y;
							return fn;
						},
						out: `(()=>{
							const a={xx:1};
							return Object.defineProperties(
								function(){},
								{
									prototype:{writable:false},
									y:{value:a,writable:true,enumerable:true,configurable:true},
									z:{value:a,writable:true,enumerable:true,configurable:true}
								}
							)
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['y', 'z']);
							expect(fn.y).toEqual({xx: 1});
							expect(fn.z).toBe(fn.y);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('prototype', false, false, false);
						}
					});

					itSerializes('circular', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'prototype', {writable: false});
							fn.y = fn;
							fn.z = fn;
							return fn;
						},
						out: `(()=>{
							const a=Object.defineProperties(
								function(){},
								{prototype:{writable:false}}
							);
							a.y=a;
							a.z=a;
							return a
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['y', 'z']);
							expect(fn.y).toBe(fn);
							expect(fn.z).toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, true);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('prototype', false, false, false);
						}
					});
				});

				describe('with descriptors', () => {
					itSerializes('literals', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'prototype', {writable: false});
							Object.defineProperty(fn, 'y', {value: 3, enumerable: true});
							Object.defineProperty(fn, 'z', {value: 4, writable: true, enumerable: true});
							return fn;
						},
						out: `Object.defineProperties(
							function(){},
							{
								prototype:{writable:false},
								y:{value:3,enumerable:true},
								z:{value:4,writable:true,enumerable:true}
							}
						)`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['y', 'z']);
							expect(fn.y).toBe(3);
							expect(fn.z).toBe(4);
							expect(fn).toHaveDescriptorModifiersFor('y', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('prototype', false, false, false);
						}
					});

					itSerializes('repeated', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'prototype', {writable: false});
							Object.defineProperty(fn, 'y', {value: {xx: 1}, enumerable: true});
							Object.defineProperty(fn, 'z', {value: fn.y, writable: true, enumerable: true});
							return fn;
						},
						out: `(()=>{
							const a={xx:1};
							return Object.defineProperties(
								function(){},
								{
									prototype:{writable:false},
									y:{value:a,enumerable:true},
									z:{value:a,writable:true,enumerable:true}
								}
							)
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['y', 'z']);
							expect(fn.y).toEqual({xx: 1});
							expect(fn.z).toBe(fn.y);
							expect(fn).toHaveDescriptorModifiersFor('y', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('prototype', false, false, false);
						}
					});

					itSerializes('circular', {
						in() {
							const fn = (0, function() {});
							Object.defineProperty(fn, 'prototype', {writable: false});
							Object.defineProperty(fn, 'y', {value: fn, enumerable: true});
							Object.defineProperty(fn, 'z', {value: fn, writable: true, enumerable: true});
							return fn;
						},
						out: `(()=>{
							const a=Object.defineProperties,
								b=a(function(){},{prototype:{writable:false}});
								a(
									b,
									{
										y:{value:b,enumerable:true},
										z:{value:b,writable:true,enumerable:true}
									}
								);
							return b
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys(['y', 'z']);
							expect(fn.y).toBe(fn);
							expect(fn.z).toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('y', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('z', true, true, false);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn.prototype.constructor).toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('prototype', false, false, false);
						}
					});
				});
			});
		});

		describe('prototype.constructor', () => {
			describe('deleted', () => {
				itSerializes('function accessed', {
					in() {
						const fn = (0, function() {});
						delete fn.prototype.constructor;
						return fn;
					},
					out: 'Object.assign(function(){},{prototype:{}})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn).toContainAllKeys([]);
						expect(fn.prototype).toBeObject();
						expect(fn.prototype).toHaveOwnPropertyNames([]);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					}
				});

				itSerializes('prototype accessed', {
					in() {
						const fn = (0, function() {});
						delete fn.prototype.constructor;
						return fn.prototype;
					},
					out: '{}',
					validate(proto) {
						expect(proto).toBeObject();
						expect(proto).toHaveOwnPropertyNames([]);
					}
				});
			});

			describe('altered', () => {
				itSerializes('function accessed', {
					in() {
						const fn = function() {};
						fn.prototype.constructor = function ctor() {};
						return fn;
					},
					out: `(()=>{
						const a=Object;
						return a.assign(
							function fn(){},
							{
								prototype:a.defineProperties(
									{},
									{constructor:{value:function ctor(){},writable:true,configurable:true}}
								)
							}
						)
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn).toContainAllKeys([]);
						expect(fn.prototype).toBeObject();
						expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
					}
				});

				itSerializes('prototype accessed', {
					in() {
						const fn = function() {};
						fn.prototype.constructor = function ctor() {};
						return fn.prototype;
					},
					out: `Object.defineProperties(
						{},
						{constructor:{value:function ctor(){},writable:true,configurable:true}}
					)`,
					validate(proto) {
						expect(proto).toBeObject();
						expect(proto).toHavePrototype(Object.prototype);
						expect(proto).toHaveOwnPropertyNames(['constructor']);
						expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
					}
				});
			});

			describe('altered descriptor', () => {
				itSerializes('function accessed', {
					in() {
						const fn = (0, function() {});
						Object.defineProperty(fn.prototype, 'constructor', {writable: false});
						return fn;
					},
					out: `(()=>{
						const a=(0,function(){});
						Object.defineProperties(a.prototype,{constructor:{writable:false}});
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn).toContainAllKeys([]);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						const proto = fn.prototype;
						expect(proto).toBeObject();
						expect(proto).toHaveOwnPropertyNames(['constructor']);
						expect(proto).toHaveDescriptorModifiersFor('constructor', false, false, true);
						expect(proto.constructor).toBe(fn);
					}
				});

				itSerializes('prototype accessed', {
					in() {
						const fn = (0, function() {});
						Object.defineProperty(fn.prototype, 'constructor', {writable: false});
						return fn.prototype;
					},
					out: `(()=>{
						const a=function(){}.prototype;
						Object.defineProperties(a,{constructor:{writable:false}});
						return a
					})()`,
					validate(proto) {
						expect(proto).toBeObject();
						expect(proto).toHaveOwnPropertyNames(['constructor']);
						expect(proto).toHaveDescriptorModifiersFor('constructor', false, false, true);
						const fn = proto.constructor;
						expect(fn).toBeFunction();
						expect(fn).toContainAllKeys([]);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						expect(fn.prototype).toBe(proto);
					}
				});
			});

			describe('deleted and redefined (i.e. property order changed)', () => {
				itSerializes('function accessed', {
					in() {
						const fn = (0, function() {});
						delete fn.prototype.constructor;
						fn.prototype.x = 123;
						Object.defineProperty(fn.prototype, 'constructor', {
							value: fn, writable: true, configurable: true
						});
						return fn;
					},
					out: `(()=>{
						const a=(0,function(){}),
							b=a.prototype;
						delete b.constructor;
						Object.defineProperties(
							b,
							{
								x:{value:123,writable:true,enumerable:true,configurable:true},
								constructor:{value:a,writable:true,configurable:true}
							}
						);
						return a
					})()`,
					validate(fn) {
						expect(
							Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
						).toEqual(['length', 'name', 'prototype']);
						const proto = fn.prototype;
						expect(proto).toBeObject();
						expect(proto).toHaveOwnPropertyNames(['x', 'constructor']);
						expect(proto.constructor).toBe(fn);
						expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
						expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
					}
				});

				itSerializes('prototype accessed', {
					in() {
						const fn = (0, function() {});
						delete fn.prototype.constructor;
						fn.prototype.x = 123;
						Object.defineProperty(fn.prototype, 'constructor', {
							value: fn, writable: true, configurable: true
						});
						return fn.prototype;
					},
					out: `(()=>{
						const a=(0,function(){}),
							b=a.prototype;
						delete b.constructor;
						Object.defineProperties(
							b,
							{
								x:{value:123,writable:true,enumerable:true,configurable:true},
								constructor:{value:a,writable:true,configurable:true}
							}
						);
						return b
					})()`,
					validate(proto) {
						expect(proto).toBeObject();
						expect(proto).toHaveOwnPropertyNames(['x', 'constructor']);
						expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
						expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
						const fn = proto.constructor;
						expect(
							Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
						).toEqual(['length', 'name', 'prototype']);
						expect(fn.prototype).toBe(proto);
					}
				});
			});
		});

		describe('prototype props + methods', () => {
			describe('no circular', () => {
				describe('without descriptors', () => {
					describe('1 method', () => {
						itSerializes('function accessed', {
							in() {
								const fn = (0, function() {});
								fn.prototype.x = function x() {};
								return fn;
							},
							out: '(()=>{const a=(0,function(){});a.prototype.x=function x(){};return a})()',
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys([]);
								const proto = fn.prototype;
								expect(proto).toBeObject();
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(proto).toHaveOwnPropertyNames(['constructor', 'x']);
								expect(proto.constructor).toBe(fn);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								expect(proto.x).toBeFunction();
								expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
							}
						});

						itSerializes('prototype accessed', {
							in() {
								const fn = (0, function() {});
								fn.prototype.x = function x() {};
								return fn.prototype;
							},
							out: '(()=>{const a=function(){}.prototype;a.x=function x(){};return a})()',
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor', 'x']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								expect(proto.x).toBeFunction();
								expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys([]);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});

					describe('multiple props', () => {
						itSerializes('function accessed', {
							in() {
								const fn = (0, function() {});
								fn.prototype.x = function x() {};
								fn.prototype.y = function y() {};
								fn.prototype.z = {zz: 1};
								return fn;
							},
							out: `(()=>{
								const a=(0,function(){}),
									b=a.prototype;
								b.x=function x(){};
								b.y=function y(){};
								b.z={zz:1};
								return a
							})()`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys([]);
								const proto = fn.prototype;
								expect(proto).toBeObject();
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								expect(proto).toHaveOwnPropertyNames(['constructor', 'x', 'y', 'z']);
								expect(proto.constructor).toBe(fn);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								expect(proto.x).toBeFunction();
								expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(proto.y).toBeFunction();
								expect(proto).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(proto.z).toEqual({zz: 1});
								expect(proto).toHaveDescriptorModifiersFor('z', true, true, true);
							}
						});

						itSerializes('prototype accessed', {
							in() {
								const fn = (0, function() {});
								fn.prototype.x = function x() {};
								fn.prototype.y = function y() {};
								fn.prototype.z = {zz: 1};
								return fn.prototype;
							},
							out: `(()=>{
								const a=function(){}.prototype;
								a.x=function x(){};
								a.y=function y(){};
								a.z={zz:1};
								return a
							})()`,
							validate(proto) {
								expect(proto).toBeObject();
								expect(proto).toHaveOwnPropertyNames(['constructor', 'x', 'y', 'z']);
								expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
								expect(proto.x).toBeFunction();
								expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
								expect(proto.y).toBeFunction();
								expect(proto).toHaveDescriptorModifiersFor('y', true, true, true);
								expect(proto.z).toEqual({zz: 1});
								expect(proto).toHaveDescriptorModifiersFor('z', true, true, true);
								const fn = proto.constructor;
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys([]);
								expect(fn.prototype).toBe(proto);
								expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							}
						});
					});
				});

				describe('with descriptors', () => {
					describe('function accessed', () => {
						itSerializes.each( // eslint-disable-next-line no-bitwise
							[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)]),
							'{writable: %p, enumerable: %p, configurable: %p}',
							(writable, enumerable, configurable) => ({
								in() {
									function fn() {}
									Object.defineProperty( // eslint-disable-next-line object-shorthand
										fn.prototype, 'x', {value: () => {}, writable, enumerable, configurable}
									);
									return fn;
								},
								validate(fn) {
									expect(fn).toBeFunction();
									expect(fn).toContainAllKeys([]);
									const proto = fn.prototype;
									expect(proto).toBeObject();
									expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
									expect(proto).toHaveOwnPropertyNames(['constructor', 'x']);
									expect(proto.constructor).toBe(fn);
									expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
									expect(proto.x).toBeFunction();
									expect(proto).toHaveDescriptorModifiersFor('x', writable, enumerable, configurable);
								}
							})
						);
					});

					describe('prototype accessed', () => {
						itSerializes.each( // eslint-disable-next-line no-bitwise
							[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)]),
							'{writable: %p, enumerable: %p, configurable: %p}',
							(writable, enumerable, configurable) => ({
								in() {
									function fn() {}
									Object.defineProperty( // eslint-disable-next-line object-shorthand
										fn.prototype, 'x', {value: () => {}, writable, enumerable, configurable}
									);
									return fn.prototype;
								},
								validate(proto) {
									expect(proto).toBeObject();
									expect(proto).toHaveOwnPropertyNames(['constructor', 'x']);
									expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
									expect(proto.x).toBeFunction();
									expect(proto).toHaveDescriptorModifiersFor('x', writable, enumerable, configurable);
									const fn = proto.constructor;
									expect(fn).toBeFunction();
									expect(fn).toContainAllKeys([]);
									expect(fn.prototype).toBe(proto);
									expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
								}
							})
						);
					});
				});
			});

			describe('circular references', () => {
				describe('without descriptors', () => {
					itSerializes('function accessed', {
						in() {
							const fn = (0, function() {});
							fn.prototype.w = fn;
							fn.prototype.x = {xx: 1};
							fn.prototype.y = fn;
							fn.prototype.z = fn.prototype;
							return fn;
						},
						out: `(()=>{
							const a=(0,function(){}),
								b=a.prototype;
							b.w=a;
							b.x={xx:1};
							b.y=a;
							b.z=b;
							return a
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys([]);
							const proto = fn.prototype;
							expect(proto).toBeObject();
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(proto).toHaveOwnPropertyNames(['constructor', 'w', 'x', 'y', 'z']);
							expect(proto.constructor).toBe(fn);
							expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
							expect(proto.w).toBe(fn);
							expect(proto).toHaveDescriptorModifiersFor('w', true, true, true);
							expect(proto.x).toEqual({xx: 1});
							expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(proto.y).toBeFunction();
							expect(proto).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(proto.z).toBe(proto);
							expect(proto).toHaveDescriptorModifiersFor('z', true, true, true);
						}
					});

					itSerializes('prototype accessed', {
						in() {
							const fn = (0, function() {});
							fn.prototype.w = fn;
							fn.prototype.x = {xx: 1};
							fn.prototype.y = fn;
							fn.prototype.z = fn.prototype;
							return fn.prototype;
						},
						out: `(()=>{
							const a=(0,function(){}),
								b=a.prototype;
							b.w=a;
							b.x={xx:1};
							b.y=a;
							b.z=b;
							return b
						})()`,
						validate(proto) {
							expect(proto).toBeObject();
							expect(proto).toHaveOwnPropertyNames(['constructor', 'w', 'x', 'y', 'z']);
							expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
							const fn = proto.constructor;
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys([]);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.prototype).toBe(proto);
							expect(proto.w).toBe(fn);
							expect(proto).toHaveDescriptorModifiersFor('w', true, true, true);
							expect(proto.x).toEqual({xx: 1});
							expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(proto.y).toBeFunction();
							expect(proto).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(proto.z).toBe(proto);
							expect(proto).toHaveDescriptorModifiersFor('z', true, true, true);
						}
					});
				});

				describe('with descriptors', () => {
					describe('function accessed', () => {
						itSerializes.each( // eslint-disable-next-line no-bitwise
							[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)]),
							'{writable: %p, enumerable: %p, configurable: %p}',
							(writable, enumerable, configurable) => ({
								in() {
									const fn = (0, function() {});
									const p = fn.prototype;
									Object.defineProperty(p, 'w', {value: fn, writable, enumerable, configurable});
									Object.defineProperty(p, 'x', {value: {xx: 1}, writable, enumerable, configurable});
									Object.defineProperty(p, 'y', {value: fn, writable, enumerable, configurable});
									Object.defineProperty(p, 'z', {value: p, writable, enumerable, configurable});
									return fn;
								},
								validate(fn) {
									expect(fn).toBeFunction();
									expect(fn).toContainAllKeys([]);
									const proto = fn.prototype;
									expect(proto).toBeObject();
									expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
									expect(proto).toHaveOwnPropertyNames(['constructor', 'w', 'x', 'y', 'z']);
									expect(proto.constructor).toBe(fn);
									expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
									expect(proto.w).toBe(fn);
									expect(proto).toHaveDescriptorModifiersFor('w', writable, enumerable, configurable);
									expect(proto.x).toEqual({xx: 1});
									expect(proto).toHaveDescriptorModifiersFor('x', writable, enumerable, configurable);
									expect(proto.y).toBeFunction();
									expect(proto).toHaveDescriptorModifiersFor('y', writable, enumerable, configurable);
									expect(proto.z).toBe(proto);
									expect(proto).toHaveDescriptorModifiersFor('z', writable, enumerable, configurable);
								}
							})
						);
					});

					describe('prototype accessed', () => {
						itSerializes.each( // eslint-disable-next-line no-bitwise
							[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)]),
							'{writable: %p, enumerable: %p, configurable: %p}',
							(writable, enumerable, configurable) => ({
								in() {
									const fn = (0, function() {});
									const p = fn.prototype;
									Object.defineProperty(p, 'w', {value: fn, writable, enumerable, configurable});
									Object.defineProperty(p, 'x', {value: {xx: 1}, writable, enumerable, configurable});
									Object.defineProperty(p, 'y', {value: fn, writable, enumerable, configurable});
									Object.defineProperty(p, 'z', {value: p, writable, enumerable, configurable});
									return fn.prototype;
								},
								validate(proto) {
									expect(proto).toBeObject();
									expect(proto).toHaveOwnPropertyNames(['constructor', 'w', 'x', 'y', 'z']);
									expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
									const fn = proto.constructor;
									expect(fn).toBeFunction();
									expect(fn).toContainAllKeys([]);
									expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
									expect(fn.prototype).toBe(proto);
									expect(proto.w).toBe(fn);
									expect(proto).toHaveDescriptorModifiersFor('w', writable, enumerable, configurable);
									expect(proto.x).toEqual({xx: 1});
									expect(proto).toHaveDescriptorModifiersFor('x', writable, enumerable, configurable);
									expect(proto.y).toBeFunction();
									expect(proto).toHaveDescriptorModifiersFor('y', writable, enumerable, configurable);
									expect(proto.z).toBe(proto);
									expect(proto).toHaveDescriptorModifiersFor('z', writable, enumerable, configurable);
								}
							})
						);
					});
				});
			});
		});
	});

	describe('arrow functions', () => {
		itSerializes('have no prototype by default', {
			in() {
				return () => {};
			},
			out: '()=>{}',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn).toContainAllKeys([]);
				expect(fn).not.toHaveOwnProperty('prototype');
			}
		});

		describe('with prototype defined', () => {
			itSerializes('function accessed', {
				in() {
					const fn = (0, () => {});
					fn.prototype = {constructor: fn};
					return fn;
				},
				out: '(()=>{const a={},b=Object.assign(()=>{},{prototype:a});a.constructor=b;return b})()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['prototype']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, true, true);
					const proto = fn.prototype;
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['constructor']);
					expect(proto.constructor).toBe(fn);
					expect(proto).toHaveDescriptorModifiersFor('constructor', true, true, true);
				}
			});

			itSerializes('prototype accessed', {
				in() {
					const fn = (0, () => {});
					fn.prototype = {constructor: fn};
					return fn.prototype;
				},
				out: '(()=>{const a=(0,()=>{}),b={constructor:a};a.prototype=b;return b})()',
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['constructor']);
					const fn = proto.constructor;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['prototype']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, true, true);
					expect(fn.prototype).toBe(proto);
					expect(proto).toHaveDescriptorModifiersFor('constructor', true, true, true);
				}
			});
		});
	});

	describe('async functions', () => {
		itSerializes('have no prototype by default', {
			in: () => async function() {}, // eslint-disable-line no-empty-function
			out: 'async function(){}',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn).toContainAllKeys([]);
				expect(fn).not.toHaveOwnProperty('prototype');
			}
		});

		describe('with prototype defined', () => {
			itSerializes('function accessed', {
				in() {
					const fn = (0, async function() {}); // eslint-disable-line no-empty-function
					fn.prototype = {constructor: fn};
					return fn;
				},
				out: `(()=>{
					const a={},
						b=Object.assign(async function(){},{prototype:a});
					a.constructor=b;
					return b
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['prototype']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, true, true);
					const proto = fn.prototype;
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['constructor']);
					expect(proto.constructor).toBe(fn);
					expect(proto).toHaveDescriptorModifiersFor('constructor', true, true, true);
				}
			});

			itSerializes('prototype accessed', {
				in() {
					const fn = (0, async function() {}); // eslint-disable-line no-empty-function
					fn.prototype = {constructor: fn};
					return fn.prototype;
				},
				out: '(()=>{const a=(0,async function(){}),b={constructor:a};a.prototype=b;return b})()',
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['constructor']);
					const fn = proto.constructor;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['prototype']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, true, true);
					expect(fn.prototype).toBe(proto);
					expect(proto).toHaveDescriptorModifiersFor('constructor', true, true, true);
				}
			});
		});
	});

	describe('async arrow functions', () => {
		itSerializes('have no prototype by default', {
			in() {
				return async () => {};
			},
			out: 'async()=>{}',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn).toContainAllKeys([]);
				expect(fn).not.toHaveOwnProperty('prototype');
			}
		});

		describe('with prototype defined', () => {
			itSerializes('function accessed', {
				in() {
					const fn = (0, async () => {});
					fn.prototype = {constructor: fn};
					return fn;
				},
				out: '(()=>{const a={},b=Object.assign(async()=>{},{prototype:a});a.constructor=b;return b})()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['prototype']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, true, true);
					const proto = fn.prototype;
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['constructor']);
					expect(proto.constructor).toBe(fn);
					expect(proto).toHaveDescriptorModifiersFor('constructor', true, true, true);
				}
			});

			itSerializes('prototype accessed', {
				in() {
					const fn = (0, async () => {});
					fn.prototype = {constructor: fn};
					return fn.prototype;
				},
				out: '(()=>{const a=(0,async()=>{}),b={constructor:a};a.prototype=b;return b})()',
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['constructor']);
					const fn = proto.constructor;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['prototype']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, true, true);
					expect(fn.prototype).toBe(proto);
					expect(proto).toHaveDescriptorModifiersFor('constructor', true, true, true);
				}
			});
		});
	});

	describe('generator functions', () => {
		describe('with no other props', () => {
			itSerializes('function accessed', {
				in: () => function*() {}, // eslint-disable-line no-empty-function
				out: 'function*(){}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(fn.prototype).toBeObject();
					expect(fn.prototype).toHaveOwnPropertyNames([]);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
				}
			});

			itSerializes('prototype accessed', {
				in: () => function*() {}.prototype, // eslint-disable-line no-empty-function
				out: '(()=>{const a=Object;return a.create(a.getPrototypeOf(function*(){}.prototype))})()',
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
				}
			});

			itSerializes('both accessed, function first', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					return {fn, proto: fn.prototype};
				},
				out: '(()=>{const a=(0,function*(){});return{fn:a,proto:a.prototype}})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['fn', 'proto']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
					expect(fn.prototype).toBe(proto);
				}
			});

			itSerializes('both accessed, prototype first', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					return {proto: fn.prototype, fn};
				},
				out: '(()=>{const a=(0,function*(){});return{proto:a.prototype,fn:a}})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['proto', 'fn']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
					expect(fn.prototype).toBe(proto);
				}
			});
		});

		describe('with other props', () => {
			itSerializes('function accessed', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					fn.x = {xx: 1};
					return fn;
				},
				out: 'Object.assign(function*(){},{x:{xx:1}})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['x']);
					expect(fn.prototype).toBeObject();
					expect(fn.prototype).toHaveOwnPropertyNames([]);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					expect(fn.x).toEqual({xx: 1});
					expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('prototype accessed', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					fn.x = {xx: 1};
					return fn.prototype;
				},
				out: '(()=>{const a=Object;return a.create(a.getPrototypeOf(function*(){}.prototype))})()',
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
				}
			});

			itSerializes('both accessed, function first', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					fn.x = {xx: 1};
					return {fn, proto: fn.prototype};
				},
				out: '(()=>{const a=Object.assign(function*(){},{x:{xx:1}});return{fn:a,proto:a.prototype}})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['fn', 'proto']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['x']);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
					expect(fn.prototype).toBe(proto);
					expect(fn.x).toEqual({xx: 1});
					expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('both accessed, prototype first', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					fn.x = {xx: 1};
					return {proto: fn.prototype, fn};
				},
				out: '(()=>{const a=Object.assign(function*(){},{x:{xx:1}});return{proto:a.prototype,fn:a}})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['proto', 'fn']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['x']);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
					expect(fn.prototype).toBe(proto);
					expect(fn.x).toEqual({xx: 1});
					expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});
		});

		describe('with other prototype props', () => {
			itSerializes('function accessed', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					fn.prototype.x = {xx: 1};
					return fn;
				},
				out: `(()=>{
					const a=Object,
						b=a.assign;
					return b(
						function*(){},
						{
							prototype:b(
								a.create(a.getPrototypeOf(function*(){}.prototype)),
								{x:{xx:1}}
							)
						}
					)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					const proto = fn.prototype;
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['x']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					expect(proto.x).toEqual({xx: 1});
					expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('prototype accessed', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					fn.prototype.x = {xx: 1};
					return fn.prototype;
				},
				out: `(()=>{
					const a=Object;
					return a.assign(
						a.create(a.getPrototypeOf(function*(){}.prototype)),
						{x:{xx:1}}
					)
				})()`,
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['x']);
					expect(proto.x).toEqual({xx: 1});
					expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('both accessed, function first', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					fn.prototype.x = {xx: 1};
					return {fn, proto: fn.prototype};
				},
				out: `(()=>{
					const a=Object,
						b=a.assign,
						c=b(
							a.create(a.getPrototypeOf(function*(){}.prototype)),
							{x:{xx:1}}
						);
					return{fn:b(function*(){},{prototype:c}),proto:c}
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['fn', 'proto']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['x']);
					expect(fn.prototype).toBe(proto);
					expect(proto.x).toEqual({xx: 1});
					expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('both accessed, prototype first', {
				in() {
					const fn = (0, function*() {}); // eslint-disable-line no-empty-function
					fn.prototype.x = {xx: 1};
					return {proto: fn.prototype, fn};
				},
				out: `(()=>{
					const a=Object,
						b=a.assign,
						c=b(
							a.create(a.getPrototypeOf(function*(){}.prototype)),
							{x:{xx:1}}
						);
					return{proto:c,fn:b(function*(){},{prototype:c})}
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['proto', 'fn']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['x']);
					expect(fn.prototype).toBe(proto);
					expect(proto.x).toEqual({xx: 1});
					expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});
		});
	});

	describe('async generator functions', () => {
		describe('with no other props', () => {
			itSerializes('function accessed', {
				in: () => async function*() {}, // eslint-disable-line no-empty-function
				out: 'async function*(){}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(fn.prototype).toBeObject();
					expect(fn.prototype).toHaveOwnPropertyNames([]);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
				}
			});

			itSerializes('prototype accessed', {
				in: () => async function*() {}.prototype, // eslint-disable-line no-empty-function
				out: '(()=>{const a=Object;return a.create(a.getPrototypeOf(async function*(){}.prototype))})()',
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
				}
			});

			itSerializes('both accessed, function first', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					return {fn, proto: fn.prototype};
				},
				out: '(()=>{const a=(0,async function*(){});return{fn:a,proto:a.prototype}})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['fn', 'proto']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
					expect(fn.prototype).toBe(proto);
				}
			});

			itSerializes('both accessed, prototype first', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					return {proto: fn.prototype, fn};
				},
				out: '(()=>{const a=(0,async function*(){});return{proto:a.prototype,fn:a}})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['proto', 'fn']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
					expect(fn.prototype).toBe(proto);
				}
			});
		});

		describe('with other props', () => {
			itSerializes('function accessed', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					fn.x = {xx: 1};
					return fn;
				},
				out: 'Object.assign(async function*(){},{x:{xx:1}})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['x']);
					expect(fn.prototype).toBeObject();
					expect(fn.prototype).toHaveOwnPropertyNames([]);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					expect(fn.x).toEqual({xx: 1});
					expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('prototype accessed', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					fn.x = {xx: 1};
					return fn.prototype;
				},
				out: '(()=>{const a=Object;return a.create(a.getPrototypeOf(async function*(){}.prototype))})()',
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
				}
			});

			itSerializes('both accessed, function first', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					fn.x = {xx: 1};
					return {fn, proto: fn.prototype};
				},
				out: `(()=>{
					const a=Object.assign(async function*(){},{x:{xx:1}});
					return{fn:a,proto:a.prototype}
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['fn', 'proto']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['x']);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
					expect(fn.prototype).toBe(proto);
					expect(fn.x).toEqual({xx: 1});
					expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('both accessed, prototype first', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					fn.x = {xx: 1};
					return {proto: fn.prototype, fn};
				},
				out: `(()=>{
					const a=Object.assign(async function*(){},{x:{xx:1}});
					return{proto:a.prototype,fn:a}
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['proto', 'fn']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys(['x']);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames([]);
					expect(fn.prototype).toBe(proto);
					expect(fn.x).toEqual({xx: 1});
					expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});
		});

		describe('with other prototype props', () => {
			itSerializes('function accessed', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					fn.prototype.x = {xx: 1};
					return fn;
				},
				out: `(()=>{
					const a=Object,
						b=a.assign;
					return b(
						async function*(){},
						{
							prototype:b(
								a.create(a.getPrototypeOf(async function*(){}.prototype)),
								{x:{xx:1}}
							)
						}
					)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					const proto = fn.prototype;
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['x']);
					expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					expect(proto.x).toEqual({xx: 1});
					expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('prototype accessed', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					fn.prototype.x = {xx: 1};
					return fn.prototype;
				},
				out: '(()=>{const a=Object;return a.assign(a.create(a.getPrototypeOf(async function*(){}.prototype)),{x:{xx:1}})})()',
				validate(proto) {
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['x']);
					expect(proto.x).toEqual({xx: 1});
					expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('both accessed, function first', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					fn.prototype.x = {xx: 1};
					return {fn, proto: fn.prototype};
				},
				out: `(()=>{
					const a=Object,
						b=a.assign,
						c=b(
							a.create(a.getPrototypeOf(async function*(){}.prototype)),
							{x:{xx:1}}
						);
					return{fn:b(async function*(){},{prototype:c}),proto:c}
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['fn', 'proto']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['x']);
					expect(fn.prototype).toBe(proto);
					expect(proto.x).toEqual({xx: 1});
					expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});

			itSerializes('both accessed, prototype first', {
				in() {
					const fn = (0, async function*() {}); // eslint-disable-line no-empty-function
					fn.prototype.x = {xx: 1};
					return {proto: fn.prototype, fn};
				},
				out: `(()=>{
					const a=Object,
						b=a.assign,
						c=b(
							a.create(a.getPrototypeOf(async function*(){}.prototype)),
							{x:{xx:1}}
						);
					return{proto:c,fn:b(async function*(){},{prototype:c})}
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames(['proto', 'fn']);
					const {fn, proto} = obj;
					expect(fn).toBeFunction();
					expect(fn).toContainAllKeys([]);
					expect(proto).toBeObject();
					expect(proto).toHaveOwnPropertyNames(['x']);
					expect(fn.prototype).toBe(proto);
					expect(proto.x).toEqual({xx: 1});
					expect(proto).toHaveDescriptorModifiersFor('x', true, true, true);
				}
			});
		});
	});

	describe('instances', () => {
		describe('with no own props', () => {
			itSerializes('where class function has no extra props', {
				in() {
					const F = function() {};
					return new F();
				},
				out: 'Object.create(function F(){}.prototype)',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames([]);
					const fn = Object.getPrototypeOf(obj).constructor;
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
				}
			});

			itSerializes('where class function has extra props', {
				in() {
					const F = function() {};
					F.x = {xx: 1};
					return new F();
				},
				out: '(()=>{const a=Object;return a.create(a.assign(function F(){},{x:{xx:1}}).prototype)})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames([]);
					const fn = Object.getPrototypeOf(obj).constructor;
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
					expect(fn).toContainAllKeys(['x']);
					expect(fn.x).toEqual({xx: 1});
				}
			});

			itSerializes('where class function has extra prototype props', {
				in() {
					const F = function() {};
					F.prototype.x = {xx: 1};
					return new F();
				},
				out: '(()=>{const a=function F(){}.prototype;a.x={xx:1};return Object.create(a)})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toHaveOwnPropertyNames([]);
					const proto = Object.getPrototypeOf(obj);
					expect(proto).toEqual({x: {xx: 1}});
					const fn = Object.getPrototypeOf(obj).constructor;
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
					expect(obj.x).toEqual({xx: 1});
				}
			});
		});

		describe('with own props', () => {
			itSerializes('where class function has no extra props', {
				in() {
					const F = function() {};
					const obj = new F();
					obj.y = {yy: 1};
					return obj;
				},
				out: '(()=>{const a=Object;return a.assign(a.create(function F(){}.prototype),{y:{yy:1}})})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toEqual({y: {yy: 1}});
					const fn = Object.getPrototypeOf(obj).constructor;
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
				}
			});

			itSerializes('where class function has extra props', {
				in() {
					const F = function() {};
					F.x = {xx: 1};
					const obj = new F();
					obj.y = {yy: 1};
					return obj;
				},
				out: `(()=>{
					const a=Object,
						b=a.assign;
					return b(
						a.create(
							b(
								function F(){},
								{x:{xx:1}}
							).prototype
						),
						{y:{yy:1}}
					)
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toEqual({y: {yy: 1}});
					const fn = Object.getPrototypeOf(obj).constructor;
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
					expect(fn).toContainAllKeys(['x']);
					expect(fn.x).toEqual({xx: 1});
				}
			});

			itSerializes('where class function has extra prototype props', {
				in() {
					const F = function() {};
					F.prototype.x = {xx: 1};
					const obj = new F();
					obj.y = {yy: 1};
					return obj;
				},
				out: `(()=>{
					const a=Object,
						b=function F(){}.prototype;
					b.x={xx:1};
					return a.assign(
						a.create(b),
						{y:{yy:1}}
					)
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toEqual({y: {yy: 1}});
					const proto = Object.getPrototypeOf(obj);
					expect(proto).toEqual({x: {xx: 1}});
					const fn = Object.getPrototypeOf(obj).constructor;
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
					expect(obj.x).toEqual({xx: 1});
				}
			});
		});
	});

	describe('prototype inheritance', () => {
		describe('accessed via function', () => {
			itSerializes('with no prototype props', {
				in() {
					function F() {}
					function E() {}
					Object.setPrototypeOf(F.prototype, E.prototype);
					return F;
				},
				out: `(()=>{
					const a=function F(){};
					Object.setPrototypeOf(a.prototype,function E(){}.prototype);
					return a
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
					const {prototype} = fn;
					expect(prototype).toHaveOwnPropertyNames(['constructor']);
					expect(prototype.constructor).toBe(fn);
					const proto = Object.getPrototypeOf(prototype);
					const protoCtor = proto.constructor;
					expect(protoCtor).toBeFunction();
					expect(protoCtor.name).toBe('E');
					expect(proto).toHavePrototype(Object.prototype);
				}
			});

			describe('with non-circular prototype props', () => {
				itSerializes('no descriptors', {
					in() {
						function F() {}
						function E() {}
						F.prototype.x = 1;
						F.prototype.y = 2;
						Object.setPrototypeOf(F.prototype, E.prototype);
						return F;
					},
					out: `(()=>{
						const a=function F(){},
							b=a.prototype;
						b.x=1;
						b.y=2;
						Object.setPrototypeOf(b,function E(){}.prototype);
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('F');
						const {prototype} = fn;
						expect(prototype).toHaveOwnPropertyNames(['constructor', 'x', 'y']);
						expect(prototype.x).toBe(1);
						expect(prototype.y).toBe(2);
						expect(prototype.constructor).toBe(fn);
						const proto = Object.getPrototypeOf(prototype);
						const protoCtor = proto.constructor;
						expect(protoCtor).toBeFunction();
						expect(protoCtor.name).toBe('E');
						expect(proto).toHavePrototype(Object.prototype);
					}
				});

				itSerializes('with descriptors', {
					in() {
						function F() {}
						function E() {}
						Object.defineProperty(F.prototype, 'x', {value: 1, enumerable: true});
						Object.defineProperty(F.prototype, 'y', {value: 2, writable: true, enumerable: true});
						Object.setPrototypeOf(F.prototype, E.prototype);
						return F;
					},
					out: `(()=>{
						const a=function F(){},
							b=Object;
						b.setPrototypeOf(
							b.defineProperties(
								a.prototype,
								{
									x:{value:1,enumerable:true},
									y:{value:2,writable:true,enumerable:true}
								}
							),
							function E(){}.prototype
						);
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('F');
						const {prototype} = fn;
						expect(prototype).toHaveOwnPropertyNames(['constructor', 'x', 'y']);
						expect(prototype.x).toBe(1);
						expect(prototype.y).toBe(2);
						expect(prototype).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(prototype).toHaveDescriptorModifiersFor('y', true, true, false);
						expect(prototype.constructor).toBe(fn);
						const proto = Object.getPrototypeOf(prototype);
						const protoCtor = proto.constructor;
						expect(protoCtor).toBeFunction();
						expect(protoCtor.name).toBe('E');
						expect(proto).toHavePrototype(Object.prototype);
					}
				});
			});

			describe('with circular prototype props', () => {
				itSerializes('no descriptors', {
					in() {
						function F() {}
						function E() {}
						F.prototype.x = F.prototype;
						F.prototype.y = F.prototype;
						Object.setPrototypeOf(F.prototype, E.prototype);
						return F;
					},
					out: `(()=>{
						const a=function F(){},
							b=a.prototype;
						b.x=b;
						b.y=b;
						Object.setPrototypeOf(b,function E(){}.prototype);
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('F');
						const {prototype} = fn;
						expect(prototype).toHaveOwnPropertyNames(['constructor', 'x', 'y']);
						expect(prototype.x).toBe(prototype);
						expect(prototype.y).toBe(prototype);
						expect(prototype.constructor).toBe(fn);
						const proto = Object.getPrototypeOf(prototype);
						const protoCtor = proto.constructor;
						expect(protoCtor).toBeFunction();
						expect(protoCtor.name).toBe('E');
						expect(proto).toHavePrototype(Object.prototype);
					}
				});

				itSerializes('with descriptors', {
					in() {
						function F() {}
						function E() {}
						Object.defineProperty(F.prototype, 'x', {value: F.prototype, enumerable: true});
						Object.defineProperty(
							F.prototype, 'y', {value: F.prototype, writable: true, enumerable: true}
						);
						Object.setPrototypeOf(F.prototype, E.prototype);
						return F;
					},
					out: `(()=>{
						const a=function F(){},
							b=a.prototype,
							c=Object;
						c.setPrototypeOf(
							c.defineProperties(
								b,
								{x:{value:b,enumerable:true},y:{value:b,writable:true,enumerable:true}}
							),
							function E(){}.prototype
						);
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('F');
						const {prototype} = fn;
						expect(prototype).toHaveOwnPropertyNames(['constructor', 'x', 'y']);
						expect(prototype.x).toBe(prototype);
						expect(prototype.y).toBe(prototype);
						expect(prototype).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(prototype).toHaveDescriptorModifiersFor('y', true, true, false);
						expect(prototype.constructor).toBe(fn);
						const proto = Object.getPrototypeOf(prototype);
						const protoCtor = proto.constructor;
						expect(protoCtor).toBeFunction();
						expect(protoCtor.name).toBe('E');
						expect(proto).toHavePrototype(Object.prototype);
					}
				});
			});
		});

		describe('accessed via prototype', () => {
			itSerializes('with no prototype props', {
				in() {
					function F() {}
					function E() {}
					Object.setPrototypeOf(F.prototype, E.prototype);
					return F.prototype;
				},
				out: `(()=>{
					const a=function F(){}.prototype;
					Object.setPrototypeOf(a,function E(){}.prototype);
					return a
				})()`,
				validate(prototype) {
					expect(prototype).toHaveOwnPropertyNames(['constructor']);
					const ctor = prototype.constructor;
					expect(ctor).toBeFunction();
					expect(ctor.name).toBe('F');
					expect(ctor.prototype).toBe(prototype);
					const proto = Object.getPrototypeOf(prototype);
					const protoCtor = proto.constructor;
					expect(protoCtor).toBeFunction();
					expect(protoCtor.name).toBe('E');
					expect(proto).toHavePrototype(Object.prototype);
				}
			});

			describe('with non-circular prototype props', () => {
				itSerializes('no descriptors', {
					in() {
						function F() {}
						function E() {}
						F.prototype.x = 1;
						F.prototype.y = 2;
						Object.setPrototypeOf(F.prototype, E.prototype);
						return F.prototype;
					},
					out: `(()=>{
						const a=function F(){}.prototype;
						a.x=1;
						a.y=2;
						Object.setPrototypeOf(a,function E(){}.prototype);
						return a
					})()`,
					validate(prototype) {
						expect(prototype).toHaveOwnPropertyNames(['constructor', 'x', 'y']);
						expect(prototype.x).toBe(1);
						expect(prototype.y).toBe(2);
						const ctor = prototype.constructor;
						expect(ctor).toBeFunction();
						expect(ctor.name).toBe('F');
						expect(ctor.prototype).toBe(prototype);
						const proto = Object.getPrototypeOf(prototype);
						const protoCtor = proto.constructor;
						expect(protoCtor).toBeFunction();
						expect(protoCtor.name).toBe('E');
						expect(proto).toHavePrototype(Object.prototype);
					}
				});

				itSerializes('with descriptors', {
					in() {
						function F() {}
						function E() {}
						Object.defineProperty(F.prototype, 'x', {value: 1, enumerable: true});
						Object.defineProperty(F.prototype, 'y', {value: 2, writable: true, enumerable: true});
						Object.setPrototypeOf(F.prototype, E.prototype);
						return F.prototype;
					},
					out: `(()=>{
						const a=function F(){}.prototype,
							b=Object;
						b.setPrototypeOf(
							b.defineProperties(
								a,
								{x:{value:1,enumerable:true},y:{value:2,writable:true,enumerable:true}}
							),
							function E(){}.prototype
						);
						return a
					})()`,
					validate(prototype) {
						expect(prototype).toHaveOwnPropertyNames(['constructor', 'x', 'y']);
						expect(prototype.x).toBe(1);
						expect(prototype.y).toBe(2);
						expect(prototype).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(prototype).toHaveDescriptorModifiersFor('y', true, true, false);
						const ctor = prototype.constructor;
						expect(ctor).toBeFunction();
						expect(ctor.name).toBe('F');
						expect(ctor.prototype).toBe(prototype);
						const proto = Object.getPrototypeOf(prototype);
						const protoCtor = proto.constructor;
						expect(protoCtor).toBeFunction();
						expect(protoCtor.name).toBe('E');
						expect(proto).toHavePrototype(Object.prototype);
					}
				});
			});

			describe('with circular prototype props', () => {
				itSerializes('no descriptors', {
					in() {
						function F() {}
						function E() {}
						F.prototype.x = F.prototype;
						F.prototype.y = F.prototype;
						Object.setPrototypeOf(F.prototype, E.prototype);
						return F.prototype;
					},
					out: `(()=>{
						const a=function F(){}.prototype;
						a.x=a;
						a.y=a;
						Object.setPrototypeOf(a,function E(){}.prototype);
						return a
					})()`,
					validate(prototype) {
						expect(prototype).toHaveOwnPropertyNames(['constructor', 'x', 'y']);
						expect(prototype.x).toBe(prototype);
						expect(prototype.y).toBe(prototype);
						const ctor = prototype.constructor;
						expect(ctor).toBeFunction();
						expect(ctor.name).toBe('F');
						expect(ctor.prototype).toBe(prototype);
						const proto = Object.getPrototypeOf(prototype);
						const protoCtor = proto.constructor;
						expect(protoCtor).toBeFunction();
						expect(protoCtor.name).toBe('E');
						expect(proto).toHavePrototype(Object.prototype);
					}
				});

				itSerializes('with descriptors', {
					in() {
						function F() {}
						function E() {}
						Object.defineProperty(F.prototype, 'x', {value: F.prototype, enumerable: true});
						Object.defineProperty(
							F.prototype, 'y', {value: F.prototype, writable: true, enumerable: true}
						);
						Object.setPrototypeOf(F.prototype, E.prototype);
						return F.prototype;
					},
					out: `(()=>{
						const a=function F(){}.prototype,
							b=Object;
						b.setPrototypeOf(
							b.defineProperties(
								a,
								{x:{value:a,enumerable:true},y:{value:a,writable:true,enumerable:true}}
							),
							function E(){}.prototype
						);
					return a})()`,
					validate(prototype) {
						expect(prototype).toHaveOwnPropertyNames(['constructor', 'x', 'y']);
						expect(prototype.x).toBe(prototype);
						expect(prototype.y).toBe(prototype);
						expect(prototype).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(prototype).toHaveDescriptorModifiersFor('y', true, true, false);
						const ctor = prototype.constructor;
						expect(ctor).toBeFunction();
						expect(ctor.name).toBe('F');
						expect(ctor.prototype).toBe(prototype);
						const proto = Object.getPrototypeOf(prototype);
						const protoCtor = proto.constructor;
						expect(protoCtor).toBeFunction();
						expect(protoCtor.name).toBe('E');
						expect(proto).toHavePrototype(Object.prototype);
					}
				});
			});
		});
	});
});
