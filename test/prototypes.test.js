/* --------------------
 * livepack module
 * Tests for prototypes
 * ------------------*/

/* eslint-disable prefer-arrow-callback */

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Prototypes', ({run}) => {
	describe('function expressions', () => {
		describe('prototype not altered and', () => {
			it('function has no other props', () => {
				run(
					function() {},
					'(function(){})',
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn).toContainAllKeys([]);
						expect(fn.prototype).toBeObject();
						expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						expect(fn.prototype.constructor).toBe(fn);
						expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
					}
				);
			});

			describe('function has other props', () => {
				describe('without descriptors', () => {
					it('literals', () => {
						const input = (0, function() {});
						input.x = 1;
						input.y = 2;
						input.z = 3;
						run(
							input,
							'Object.assign(function(){},{x:1,y:2,z:3})',
							(fn) => {
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
						);
					});

					it('repeated', () => {
						const input = (0, function() {});
						input.x = {xx: 1};
						input.y = 2;
						input.z = input.x;
						run(
							input,
							'(()=>{const a={xx:1};return Object.assign(function(){},{x:a,y:2,z:a})})()',
							(fn) => {
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
						);
					});

					describe('circular and', () => {
						it('`name` + `length` props unaltered', () => {
							const input = (0, function() {});
							input.x = input;
							input.y = 2;
							input.z = input;
							run(
								input,
								'(()=>{const a=Object.assign(function(){},{x:void 0,y:2});a.x=a;a.z=a;return a})()',
								(fn) => {
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
							);
						});

						it('`name` descriptor altered', () => {
							const input = (0, function() {});
							Object.defineProperty(input, 'name', {writable: true});
							input.x = input;
							input.y = 2;
							input.z = input;
							run(
								input,
								'(()=>{const a=Object.defineProperties(function(){},{name:{writable:true},x:{writable:true,enumerable:true,configurable:true},y:{value:2,writable:true,enumerable:true,configurable:true}});a.x=a;a.z=a;return a})()',
								(fn) => {
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
							);
						});

						it('`name` prop deleted', () => {
							const input = (0, function() {});
							delete input.name;
							input.x = input;
							input.y = 2;
							input.z = input;
							run(
								input,
								'(()=>{const a=Object.assign(function(){},{x:void 0,y:2});delete a.name;a.x=a;a.z=a;return a})()',
								(fn) => {
									expect(fn).toBeFunction();
									expect(fn.name).toBe('');
									expect(fn).not.toHaveDescriptorFor('name');
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
							);
						});

						it('`name` + `length` props deleted', () => {
							const input = (0, function() {});
							delete input.name;
							delete input.length;
							input.x = input;
							input.y = 2;
							input.z = input;
							run(
								input,
								'(()=>{const a=Object.assign(function(){},{x:void 0,y:2});delete a.name;delete a.length;a.x=a;a.z=a;return a})()',
								(fn) => {
									expect(fn).toBeFunction();
									expect(fn.name).toBe('');
									expect(fn).not.toHaveDescriptorFor('name');
									expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
									expect(fn).not.toHaveDescriptorFor('length');
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
							);
						});
					});
				});

				describe('with descriptors', () => {
					it('literals', () => {
						const input = (0, function() {});
						Object.defineProperty(input, 'x', {value: 1, enumerable: true});
						input.y = 2;
						Object.defineProperty(input, 'z', {value: 3, writable: true, enumerable: true});
						run(
							input,
							'Object.defineProperties(function(){},{x:{value:1,enumerable:true},y:{value:2,writable:true,enumerable:true,configurable:true},z:{value:3,writable:true,enumerable:true}})',
							(fn) => {
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
						);
					});

					it('repeated', () => {
						const input = (0, function() {});
						Object.defineProperty(input, 'x', {value: {xx: 1}, enumerable: true});
						input.y = 2;
						Object.defineProperty(input, 'z', {value: input.x, writable: true, enumerable: true});
						run(
							input,
							'(()=>{const a={xx:1};return Object.defineProperties(function(){},{x:{value:a,enumerable:true},y:{value:2,writable:true,enumerable:true,configurable:true},z:{value:a,writable:true,enumerable:true}})})()',
							(fn) => {
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
						);
					});

					describe('circular and', () => {
						it('`name` + `length` props unaltered', () => {
							const input = (0, function() {});
							Object.defineProperty(input, 'x', {value: input, enumerable: true});
							input.y = 2;
							Object.defineProperty(input, 'z', {value: input, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a=Object,b=a.assign(function(){},{x:void 0,y:2});a.defineProperties(b,{x:{value:b,writable:false,configurable:false},z:{value:b,writable:true,enumerable:true}});return b})()',
								(fn) => {
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
							);
						});

						it('`name` descriptor altered', () => {
							const input = (0, function() {});
							Object.defineProperty(input, 'name', {writable: true});
							Object.defineProperty(input, 'x', {value: input, enumerable: true});
							input.y = 2;
							Object.defineProperty(input, 'z', {value: input, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a=Object.defineProperties,b=a(function(){},{name:{writable:true},x:{writable:true,enumerable:true,configurable:true},y:{value:2,writable:true,enumerable:true,configurable:true}});a(b,{x:{value:b,writable:false,configurable:false},z:{value:b,writable:true,enumerable:true}});return b})()',
								(fn) => {
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
							);
						});

						it('`name` prop deleted', () => {
							const input = (0, function() {});
							delete input.name;
							Object.defineProperty(input, 'x', {value: input, enumerable: true});
							input.y = 2;
							Object.defineProperty(input, 'z', {value: input, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a=Object,b=a.assign(function(){},{x:void 0,y:2});delete b.name;a.defineProperties(b,{x:{value:b,writable:false,configurable:false},z:{value:b,writable:true,enumerable:true}});return b})()',
								(fn) => {
									expect(fn).toBeFunction();
									expect(fn.name).toBe('');
									expect(fn).not.toHaveDescriptorFor('name');
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
							);
						});

						it('`name` + `length` props deleted', () => {
							const input = (0, function() {});
							delete input.name;
							delete input.length;
							Object.defineProperty(input, 'x', {value: input, enumerable: true});
							input.y = 2;
							Object.defineProperty(input, 'z', {value: input, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a=Object,b=a.assign(function(){},{x:void 0,y:2});delete b.name;delete b.length;a.defineProperties(b,{x:{value:b,writable:false,configurable:false},z:{value:b,writable:true,enumerable:true}});return b})()',
								(fn) => {
									expect(fn).toBeFunction();
									expect(fn.name).toBe('');
									expect(fn).not.toHaveDescriptorFor('name');
									expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
									expect(fn).not.toHaveDescriptorFor('length');
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
							);
						});
					});
				});
			});
		});

		describe('unaltered prototype accessed directly', () => {
			it('function has no other props', () => {
				run(
					(function() {}).prototype,
					'(function(){}).prototype',
					(proto) => {
						expect(proto).toBeObject();
						expect(proto).toHaveOwnPropertyNames(['constructor']);
						expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
						const fn = proto.constructor;
						expect(fn).toBeFunction();
						expect(fn).toContainAllKeys([]);
						expect(fn.prototype).toBe(proto);
						expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
					}
				);
			});

			describe('function has other props', () => {
				describe('without descriptors', () => {
					it('literals', () => {
						const inputFn = (0, function() {});
						inputFn.x = 1;
						inputFn.y = 2;
						inputFn.z = 3;
						run(
							inputFn.prototype,
							'Object.assign(function(){},{x:1,y:2,z:3}).prototype',
							(proto) => {
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
						);
					});

					it('repeated', () => {
						const inputFn = (0, function() {});
						inputFn.x = {xx: 1};
						inputFn.y = 2;
						inputFn.z = inputFn.x;
						run(
							inputFn.prototype,
							'(()=>{const a={xx:1};return Object.assign(function(){},{x:a,y:2,z:a}).prototype})()',
							(proto) => {
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
						);
					});

					describe('circular and', () => {
						it('`name` + `length` props unaltered', () => {
							const inputFn = (0, function() {});
							inputFn.x = inputFn;
							inputFn.y = 2;
							inputFn.z = inputFn;
							run(
								inputFn.prototype,
								'(()=>{const a=Object.assign(function(){},{x:void 0,y:2});a.x=a;a.z=a;return a.prototype})()',
								(proto) => {
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
							);
						});

						it('`name` descriptor altered', () => {
							const inputFn = (0, function() {});
							Object.defineProperty(inputFn, 'name', {writable: true});
							inputFn.x = inputFn;
							inputFn.y = 2;
							inputFn.z = inputFn;
							run(
								inputFn.prototype,
								'(()=>{const a=Object.defineProperties(function(){},{name:{writable:true},x:{writable:true,enumerable:true,configurable:true},y:{value:2,writable:true,enumerable:true,configurable:true}});a.x=a;a.z=a;return a.prototype})()',
								(proto) => {
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
							);
						});

						it('`name` prop deleted', () => {
							const inputFn = (0, function() {});
							delete inputFn.name;
							inputFn.x = inputFn;
							inputFn.y = 2;
							inputFn.z = inputFn;
							run(
								inputFn.prototype,
								'(()=>{const a=Object.assign(function(){},{x:void 0,y:2});delete a.name;a.x=a;a.z=a;return a.prototype})()',
								(proto) => {
									expect(proto).toBeObject();
									expect(proto).toHaveOwnPropertyNames(['constructor']);
									expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
									const fn = proto.constructor;
									expect(fn).toBeFunction();
									expect(fn.name).toBe('');
									expect(fn).not.toHaveDescriptorFor('name');
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
							);
						});

						it('`name` + `length` props deleted', () => {
							const inputFn = (0, function() {});
							delete inputFn.name;
							delete inputFn.length;
							inputFn.x = inputFn;
							inputFn.y = 2;
							inputFn.z = inputFn;
							run(
								inputFn.prototype,
								'(()=>{const a=Object.assign(function(){},{x:void 0,y:2});delete a.name;delete a.length;a.x=a;a.z=a;return a.prototype})()',
								(proto) => {
									expect(proto).toBeObject();
									expect(proto).toHaveOwnPropertyNames(['constructor']);
									expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
									const fn = proto.constructor;
									expect(fn).toBeFunction();
									expect(fn.name).toBe('');
									expect(fn).not.toHaveDescriptorFor('name');
									expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
									expect(fn).not.toHaveDescriptorFor('length');
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
							);
						});
					});
				});

				describe('with descriptors', () => {
					it('literals', () => {
						const inputFn = (0, function() {});
						Object.defineProperty(inputFn, 'x', {value: 1, enumerable: true});
						inputFn.y = 2;
						Object.defineProperty(inputFn, 'z', {value: 3, writable: true, enumerable: true});
						run(
							inputFn.prototype,
							'Object.defineProperties(function(){},{x:{value:1,enumerable:true},y:{value:2,writable:true,enumerable:true,configurable:true},z:{value:3,writable:true,enumerable:true}}).prototype',
							(proto) => {
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
						);
					});

					it('repeated', () => {
						const inputFn = (0, function() {});
						Object.defineProperty(inputFn, 'x', {value: {xx: 1}, enumerable: true});
						inputFn.y = 2;
						Object.defineProperty(inputFn, 'z', {value: inputFn.x, writable: true, enumerable: true});
						run(
							inputFn.prototype,
							'(()=>{const a={xx:1};return Object.defineProperties(function(){},{x:{value:a,enumerable:true},y:{value:2,writable:true,enumerable:true,configurable:true},z:{value:a,writable:true,enumerable:true}}).prototype})()',
							(proto) => {
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
						);
					});

					describe('circular and', () => {
						it('`name` + `length` props unaltered', () => {
							const inputFn = (0, function() {});
							Object.defineProperty(inputFn, 'x', {value: inputFn, enumerable: true});
							inputFn.y = 2;
							Object.defineProperty(inputFn, 'z', {value: inputFn, writable: true, enumerable: true});
							run(
								inputFn.prototype,
								'(()=>{const a=Object,b=a.assign(function(){},{x:void 0,y:2});a.defineProperties(b,{x:{value:b,writable:false,configurable:false},z:{value:b,writable:true,enumerable:true}});return b.prototype})()',
								(proto) => {
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
							);
						});

						it('`name` descriptor altered', () => {
							const inputFn = (0, function() {});
							Object.defineProperty(inputFn, 'name', {writable: true});
							Object.defineProperty(inputFn, 'x', {value: inputFn, enumerable: true});
							inputFn.y = 2;
							Object.defineProperty(inputFn, 'z', {value: inputFn, writable: true, enumerable: true});
							run(
								inputFn.prototype,
								'(()=>{const a=Object.defineProperties,b=a(function(){},{name:{writable:true},x:{writable:true,enumerable:true,configurable:true},y:{value:2,writable:true,enumerable:true,configurable:true}});a(b,{x:{value:b,writable:false,configurable:false},z:{value:b,writable:true,enumerable:true}});return b.prototype})()',
								(proto) => {
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
							);
						});

						it('`name` prop deleted', () => {
							const inputFn = (0, function() {});
							delete inputFn.name;
							Object.defineProperty(inputFn, 'x', {value: inputFn, enumerable: true});
							inputFn.y = 2;
							Object.defineProperty(inputFn, 'z', {value: inputFn, writable: true, enumerable: true});
							run(
								inputFn.prototype,
								'(()=>{const a=Object,b=a.assign(function(){},{x:void 0,y:2});delete b.name;a.defineProperties(b,{x:{value:b,writable:false,configurable:false},z:{value:b,writable:true,enumerable:true}});return b.prototype})()',
								(proto) => {
									expect(proto).toBeObject();
									expect(proto).toHaveOwnPropertyNames(['constructor']);
									expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
									const fn = proto.constructor;
									expect(fn).toBeFunction();
									expect(fn.name).toBe('');
									expect(fn).not.toHaveDescriptorFor('name');
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
							);
						});

						it('`name` + `length` props deleted', () => {
							const inputFn = (0, function() {});
							delete inputFn.name;
							delete inputFn.length;
							Object.defineProperty(inputFn, 'x', {value: inputFn, enumerable: true});
							inputFn.y = 2;
							Object.defineProperty(inputFn, 'z', {value: inputFn, writable: true, enumerable: true});
							run(
								inputFn.prototype,
								'(()=>{const a=Object,b=a.assign(function(){},{x:void 0,y:2});delete b.name;delete b.length;a.defineProperties(b,{x:{value:b,writable:false,configurable:false},z:{value:b,writable:true,enumerable:true}});return b.prototype})()',
								(proto) => {
									expect(proto).toBeObject();
									expect(proto).toHaveOwnPropertyNames(['constructor']);
									expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
									const fn = proto.constructor;
									expect(fn).toBeFunction();
									expect(fn.name).toBe('');
									expect(fn).not.toHaveDescriptorFor('name');
									expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
									expect(fn).not.toHaveDescriptorFor('length');
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
							);
						});
					});
				});
			});
		});

		describe('prototype substituted with', () => {
			describe('empty object and', () => {
				it('function has no other props', () => {
					const input = (0, function() {});
					input.prototype = {};
					run(
						input,
						'Object.assign(function(){},{prototype:{}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.prototype).toEqual({});
							expect(fn.prototype).toHaveOwnPropertyNames([]);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					);
				});

				describe('function has other props', () => {
					describe('without descriptors', () => {
						it('literals', () => {
							const input = (0, function() {});
							input.prototype = {};
							input.x = 1;
							input.y = 2;
							run(
								input,
								'Object.assign(function(){},{prototype:{},x:1,y:2})',
								(fn) => {
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
							);
						});

						it('repeated', () => {
							const input = (0, function() {});
							input.prototype = {};
							input.x = {xx: 1};
							input.y = input.x;
							run(
								input,
								'(()=>{const a={xx:1};return Object.assign(function(){},{prototype:{},x:a,y:a})})()',
								(fn) => {
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
							);
						});

						it('circular', () => {
							const input = (0, function() {});
							input.prototype = {};
							input.x = input;
							input.y = input;
							run(
								input,
								'(()=>{const a=Object.assign(function(){},{prototype:{}});a.x=a;a.y=a;return a})()',
								(fn) => {
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
							);
						});
					});

					describe('with descriptors', () => {
						it('literals', () => {
							const input = (0, function() {});
							input.prototype = {};
							Object.defineProperty(input, 'x', {value: 1, enumerable: true});
							Object.defineProperty(input, 'y', {value: 2, writable: true, enumerable: true});
							run(
								input,
								'Object.defineProperties(function(){},{prototype:{value:{}},x:{value:1,enumerable:true},y:{value:2,writable:true,enumerable:true}})',
								(fn) => {
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
							);
						});

						it('repeated', () => {
							const input = (0, function() {});
							input.prototype = {};
							Object.defineProperty(input, 'x', {value: {xx: 1}, enumerable: true});
							Object.defineProperty(input, 'y', {value: input.x, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a={xx:1};return Object.defineProperties(function(){},{prototype:{value:{}},x:{value:a,enumerable:true},y:{value:a,writable:true,enumerable:true}})})()',
								(fn) => {
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
							);
						});

						it('circular', () => {
							const input = (0, function() {});
							input.prototype = {};
							Object.defineProperty(input, 'x', {value: input, enumerable: true});
							Object.defineProperty(input, 'y', {value: input, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a=Object,b=a.assign(function(){},{prototype:{}});a.defineProperties(b,{x:{value:b,enumerable:true},y:{value:b,writable:true,enumerable:true}});return b})()',
								(fn) => {
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
							);
						});
					});
				});
			});

			describe('object with props and', () => {
				it('function has no other props', () => {
					const input = (0, function() {});
					input.prototype = {x: 1, y: 2};
					run(
						input,
						'Object.assign(function(){},{prototype:{x:1,y:2}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.prototype).toEqual({x: 1, y: 2});
							expect(fn.prototype).toHaveOwnPropertyNames(['x', 'y']);
							expect(fn.prototype).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(fn.prototype).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					);
				});

				describe('function has other props', () => {
					describe('without descriptors', () => {
						it('literals', () => {
							const input = (0, function() {});
							input.prototype = {w: 1, x: 2};
							input.y = 3;
							input.z = 4;
							run(
								input,
								'Object.assign(function(){},{prototype:{w:1,x:2},y:3,z:4})',
								(fn) => {
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
							);
						});

						it('repeated', () => {
							const input = (0, function() {});
							input.prototype = {w: 1, x: 2};
							input.y = {xx: 1};
							input.z = input.y;
							run(
								input,
								'(()=>{const a={xx:1};return Object.assign(function(){},{prototype:{w:1,x:2},y:a,z:a})})()',
								(fn) => {
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
							);
						});

						it('circular', () => {
							const input = (0, function() {});
							input.prototype = {w: 1, x: 2};
							input.y = input;
							input.z = input;
							run(
								input,
								'(()=>{const a=Object.assign(function(){},{prototype:{w:1,x:2}});a.y=a;a.z=a;return a})()',
								(fn) => {
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
							);
						});
					});

					describe('with descriptors', () => {
						it('literals', () => {
							const input = (0, function() {});
							input.prototype = {w: 1, x: 2};
							Object.defineProperty(input, 'y', {value: 3, enumerable: true});
							Object.defineProperty(input, 'z', {value: 4, writable: true, enumerable: true});
							run(
								input,
								'Object.defineProperties(function(){},{prototype:{value:{w:1,x:2}},y:{value:3,enumerable:true},z:{value:4,writable:true,enumerable:true}})',
								(fn) => {
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
							);
						});

						it('repeated', () => {
							const input = (0, function() {});
							input.prototype = {w: 1, x: 2};
							Object.defineProperty(input, 'y', {value: {xx: 1}, enumerable: true});
							Object.defineProperty(input, 'z', {value: input.y, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a={xx:1};return Object.defineProperties(function(){},{prototype:{value:{w:1,x:2}},y:{value:a,enumerable:true},z:{value:a,writable:true,enumerable:true}})})()',
								(fn) => {
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
							);
						});

						it('circular', () => {
							const input = (0, function() {});
							input.prototype = {w: 1, x: 2};
							Object.defineProperty(input, 'y', {value: input, enumerable: true});
							Object.defineProperty(input, 'z', {value: input, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a=Object,b=a.assign(function(){},{prototype:{w:1,x:2}});a.defineProperties(b,{y:{value:b,enumerable:true},z:{value:b,writable:true,enumerable:true}});return b})()',
								(fn) => {
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
							);
						});
					});
				});
			});

			describe('object with circular props and', () => {
				it('function has no other props', () => {
					const input = (0, function() {});
					input.prototype = {x: input, y: input};
					run(
						input,
						'(()=>{const a={},b=Object.assign(function(){},{prototype:a});a.x=b;a.y=b;return b})()',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['x', 'y']);
							expect(fn.prototype.x).toBe(fn);
							expect(fn.prototype.y).toBe(fn);
							expect(fn.prototype).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(fn.prototype).toHaveDescriptorModifiersFor('y', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					);
				});

				describe('function has other props', () => {
					describe('without descriptors', () => {
						it('literals', () => {
							const input = (0, function() {});
							input.prototype = {w: input, x: input};
							input.y = 3;
							input.z = 4;
							run(
								input,
								'(()=>{const a={},b=Object.assign(function(){},{prototype:a,y:3,z:4});a.w=b;a.x=b;return b})()',
								(fn) => {
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
							);
						});

						it('repeated', () => {
							const input = (0, function() {});
							input.prototype = {w: input, x: input};
							input.y = {xx: 1};
							input.z = input.y;
							run(
								input,
								'(()=>{const a={},b={xx:1},c=Object.assign(function(){},{prototype:a,y:b,z:b});a.w=c;a.x=c;return c})()',
								(fn) => {
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
							);
						});

						it('circular', () => {
							const input = (0, function() {});
							input.prototype = {w: input, x: input};
							input.y = input;
							input.z = input;
							run(
								input,
								'(()=>{const a={},b=Object.assign(function(){},{prototype:a});a.w=b;a.x=b;b.y=b;b.z=b;return b})()',
								(fn) => {
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
							);
						});
					});

					describe('with descriptors', () => {
						it('literals', () => {
							const input = (0, function() {});
							input.prototype = {w: input, x: input};
							Object.defineProperty(input, 'y', {value: 3, enumerable: true});
							Object.defineProperty(input, 'z', {value: 4, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a={},b=Object.defineProperties(function(){},{prototype:{value:a},y:{value:3,enumerable:true},z:{value:4,writable:true,enumerable:true}});a.w=b;a.x=b;return b})()',
								(fn) => {
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
							);
						});

						it('repeated', () => {
							const input = (0, function() {});
							input.prototype = {w: input, x: input};
							Object.defineProperty(input, 'y', {value: {xx: 1}, enumerable: true});
							Object.defineProperty(input, 'z', {value: input.y, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a={},b={xx:1},c=Object.defineProperties(function(){},{prototype:{value:a},y:{value:b,enumerable:true},z:{value:b,writable:true,enumerable:true}});a.w=c;a.x=c;return c})()',
								(fn) => {
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
							);
						});

						it('circular', () => {
							const input = (0, function() {});
							input.prototype = {w: input, x: input};
							Object.defineProperty(input, 'y', {value: input, enumerable: true});
							Object.defineProperty(input, 'z', {value: input, writable: true, enumerable: true});
							run(
								input,
								'(()=>{const a={},b=Object,c=b.assign(function(){},{prototype:a});a.w=c;a.x=c;b.defineProperties(c,{y:{value:c,enumerable:true},z:{value:c,writable:true,enumerable:true}});return c})()',
								(fn) => {
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
							);
						});
					});
				});
			});

			describe('function and', () => {
				it('function has no other props', () => {
					const input = (0, function() {});
					input.prototype = function() {};
					run(
						input,
						'Object.assign(function(){},{prototype:function(){}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.prototype).toBeFunction();
							expect(fn.prototype).not.toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					);
				});

				it('function has other props', () => {
					const input = (0, function() {});
					input.prototype = function() {};
					input.x = 1;
					input.y = 2;
					run(
						input,
						'Object.assign(function(){},{prototype:function(){},x:1,y:2})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.prototype).toBeFunction();
							expect(fn.prototype).not.toBe(fn);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
						}
					);
				});
			});

			describe('literal and', () => {
				it('function has no other props', () => {
					const input = (0, function() {});
					input.prototype = 123;
					run(
						input,
						'Object.assign(function(){},{prototype:123})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.prototype).toBe(123);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					);
				});

				it('function has other props', () => {
					const input = (0, function() {});
					input.prototype = 123;
					input.x = 1;
					input.y = 2;
					run(
						input,
						'Object.assign(function(){},{prototype:123,x:1,y:2})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.prototype).toBe(123);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn).toHaveDescriptorModifiersFor('x', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor('y', true, true, true);
						}
					);
				});
			});
		});

		describe('prototype descriptor altered and', () => {
			it('function has no other props', () => {
				const input = (0, function() {});
				Object.defineProperty(input, 'prototype', {writable: false});

				run(
					input,
					'Object.defineProperties(function(){},{prototype:{writable:false}})',
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn.prototype).toBeObject();
						expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
						expect(fn).toHaveDescriptorModifiersFor('prototype', false, false, false);
						expect(fn.prototype.constructor).toBe(fn);
						expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
					}
				);
			});

			describe('function has other props', () => {
				describe('without descriptors', () => {
					it('literals', () => {
						const input = (0, function() {});
						Object.defineProperty(input, 'prototype', {writable: false});
						input.y = 3;
						input.z = 4;
						run(
							input,
							'Object.defineProperties(function(){},{prototype:{writable:false},y:{value:3,writable:true,enumerable:true,configurable:true},z:{value:4,writable:true,enumerable:true,configurable:true}})',
							(fn) => {
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
						);
					});

					it('repeated', () => {
						const input = (0, function() {});
						Object.defineProperty(input, 'prototype', {writable: false});
						input.y = {xx: 1};
						input.z = input.y;
						run(
							input,
							'(()=>{const a={xx:1};return Object.defineProperties(function(){},{prototype:{writable:false},y:{value:a,writable:true,enumerable:true,configurable:true},z:{value:a,writable:true,enumerable:true,configurable:true}})})()',
							(fn) => {
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
						);
					});

					it('circular', () => {
						const input = (0, function() {});
						Object.defineProperty(input, 'prototype', {writable: false});
						input.y = input;
						input.z = input;
						run(
							input,
							'(()=>{const a=Object.defineProperties(function(){},{prototype:{writable:false}});a.y=a;a.z=a;return a})()',
							(fn) => {
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
						);
					});
				});

				describe('with descriptors', () => {
					it('literals', () => {
						const input = (0, function() {});
						Object.defineProperty(input, 'prototype', {writable: false});
						Object.defineProperty(input, 'y', {value: 3, enumerable: true});
						Object.defineProperty(input, 'z', {value: 4, writable: true, enumerable: true});
						run(
							input,
							'Object.defineProperties(function(){},{prototype:{writable:false},y:{value:3,enumerable:true},z:{value:4,writable:true,enumerable:true}})',
							(fn) => {
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
						);
					});

					it('repeated', () => {
						const input = (0, function() {});
						Object.defineProperty(input, 'prototype', {writable: false});
						Object.defineProperty(input, 'y', {value: {xx: 1}, enumerable: true});
						Object.defineProperty(input, 'z', {value: input.y, writable: true, enumerable: true});
						run(
							input,
							'(()=>{const a={xx:1};return Object.defineProperties(function(){},{prototype:{writable:false},y:{value:a,enumerable:true},z:{value:a,writable:true,enumerable:true}})})()',
							(fn) => {
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
						);
					});

					it('circular', () => {
						const input = (0, function() {});
						Object.defineProperty(input, 'prototype', {writable: false});
						Object.defineProperty(input, 'y', {value: input, enumerable: true});
						Object.defineProperty(input, 'z', {value: input, writable: true, enumerable: true});
						run(
							input,
							'(()=>{const a=Object.defineProperties,b=a(function(){},{prototype:{writable:false}});a(b,{y:{value:b,enumerable:true},z:{value:b,writable:true,enumerable:true}});return b})()',
							(fn) => {
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
						);
					});
				});
			});
		});

		describe('prototype.constructor', () => {
			describe('deleted', () => {
				it('function accessed', () => {
					const input = (0, function() {});
					delete input.prototype.constructor;
					run(
						input,
						'Object.assign(function(){},{prototype:{}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys([]);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames([]);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
						}
					);
				});

				it('prototype accessed', () => {
					const inputFn = (0, function() {});
					delete inputFn.prototype.constructor;
					run(
						inputFn.prototype,
						'({})',
						(proto) => {
							expect(proto).toBeObject();
							expect(proto).toHaveOwnPropertyNames([]);
						}
					);
				});
			});

			describe('altered', () => {
				it('function accessed', () => {
					const input = function() {};
					input.prototype.constructor = function ctor() {};
					run(
						input,
						'(()=>{const a=Object;return a.assign(function input(){},{prototype:a.create(a.prototype,{constructor:{value:function ctor(){},writable:true,configurable:true}})})})()',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys([]);
							expect(fn.prototype).toBeObject();
							expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.prototype).toHaveDescriptorModifiersFor('constructor', true, false, true);
						}
					);
				});

				it('prototype accessed', () => {
					const inputFn = function() {};
					inputFn.prototype.constructor = function ctor() {};
					run(
						inputFn.prototype,
						'(()=>{const a=Object;return a.create(a.prototype,{constructor:{value:function ctor(){},writable:true,configurable:true}})})()',
						(proto) => {
							expect(proto).toBeObject();
							expect(proto).toHavePrototype(Object.prototype);
							expect(proto).toHaveOwnPropertyNames(['constructor']);
							expect(proto).toHaveDescriptorModifiersFor('constructor', true, false, true);
						}
					);
				});
			});

			describe('altered descriptor', () => {
				it('function accessed', () => {
					const input = (0, function() {});
					Object.defineProperty(input.prototype, 'constructor', {writable: false});
					run(
						input,
						'(()=>{const a=(0,function(){});Object.defineProperties(a.prototype,{constructor:{writable:false}});return a})()',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys([]);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							const proto = fn.prototype;
							expect(proto).toBeObject();
							expect(proto).toHaveOwnPropertyNames(['constructor']);
							expect(proto).toHaveDescriptorModifiersFor('constructor', false, false, true);
							expect(proto.constructor).toBe(fn);
						}
					);
				});

				it('prototype accessed', () => {
					const inputFn = (0, function() {});
					Object.defineProperty(inputFn.prototype, 'constructor', {writable: false});
					run(
						inputFn.prototype,
						'(()=>{const a=function(){}.prototype;Object.defineProperties(a,{constructor:{writable:false}});return a})()',
						(proto) => {
							expect(proto).toBeObject();
							expect(proto).toHaveOwnPropertyNames(['constructor']);
							expect(proto).toHaveDescriptorModifiersFor('constructor', false, false, true);
							const fn = proto.constructor;
							expect(fn).toBeFunction();
							expect(fn).toContainAllKeys([]);
							expect(fn).toHaveDescriptorModifiersFor('prototype', true, false, false);
							expect(fn.prototype).toBe(proto);
						}
					);
				});
			});

			describe('deleted and redefined (i.e. property order changed)', () => {
				it('function accessed', () => {
					const inputFn = (0, function() {});
					delete inputFn.prototype.constructor;
					inputFn.prototype.x = 123;
					Object.defineProperty(inputFn.prototype, 'constructor', {
						value: inputFn, writable: true, configurable: true
					});
					run(
						inputFn,
						'(()=>{const a=(0,function(){}),b=a.prototype;delete b.constructor;Object.defineProperties(b,{x:{value:123,writable:true,enumerable:true,configurable:true},constructor:{value:a,writable:true,configurable:true}});return a})()',
						(fn) => {
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
					);
				});

				it('prototype accessed', () => {
					const inputFn = (0, function() {});
					delete inputFn.prototype.constructor;
					inputFn.prototype.x = 123;
					Object.defineProperty(inputFn.prototype, 'constructor', {
						value: inputFn, writable: true, configurable: true
					});
					run(
						inputFn.prototype,
						'(()=>{const a=(0,function(){}),b=a.prototype;delete b.constructor;Object.defineProperties(b,{x:{value:123,writable:true,enumerable:true,configurable:true},constructor:{value:a,writable:true,configurable:true}});return b})()',
						(proto) => {
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
					);
				});
			});
		});

		describe('prototype props + methods', () => {
			describe('no circular', () => {
				describe('without descriptors', () => {
					describe('1 method', () => {
						it('function accessed', () => {
							const inputFn = (0, function() {});
							inputFn.prototype.x = function x() {};
							run(
								inputFn,
								'(()=>{const a=(0,function(){});a.prototype.x=function x(){};return a})()',
								(fn) => {
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
							);
						});

						it('prototype accessed', () => {
							const inputFn = (0, function() {});
							inputFn.prototype.x = function x() {};
							run(
								inputFn.prototype,
								'(()=>{const a=function(){}.prototype;a.x=function x(){};return a})()',
								(proto) => {
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
							);
						});
					});

					describe('multiple props', () => {
						it('function accessed', () => {
							const inputFn = (0, function() {});
							inputFn.prototype.x = function x() {};
							inputFn.prototype.y = function y() {};
							inputFn.prototype.z = {zz: 1};
							run(
								inputFn,
								'(()=>{const a=(0,function(){}),b=a.prototype;b.x=function x(){};b.y=function y(){};b.z={zz:1};return a})()',
								(fn) => {
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
							);
						});

						it('prototype accessed', () => {
							const inputFn = (0, function() {});
							inputFn.prototype.x = function x() {};
							inputFn.prototype.y = function y() {};
							inputFn.prototype.z = {zz: 1};
							run(
								inputFn.prototype,
								'(()=>{const a=function(){}.prototype;a.x=function x(){};a.y=function y(){};a.z={zz:1};return a})()',
								(proto) => {
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
							);
						});
					});
				});

				describe('with descriptors', () => {
					describe('function accessed', () => {
						it.each( // eslint-disable-next-line no-bitwise
							[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
						)(
							'{writable: %p, enumerable: %p, configurable: %p}',
							(writable, enumerable, configurable) => {
								function inputFn() {}
								Object.defineProperty( // eslint-disable-next-line object-shorthand
									inputFn.prototype, 'x', {value: () => {}, writable, enumerable, configurable}
								);

								run(inputFn, null, (fn) => {
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
								});
							}
						);
					});

					describe('prototype accessed', () => {
						it.each( // eslint-disable-next-line no-bitwise
							[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
						)(
							'{writable: %p, enumerable: %p, configurable: %p}',
							(writable, enumerable, configurable) => {
								function inputFn() {}
								Object.defineProperty( // eslint-disable-next-line object-shorthand
									inputFn.prototype, 'x', {value: () => {}, writable, enumerable, configurable}
								);

								run(inputFn.prototype, null, (proto) => {
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
								});
							}
						);
					});
				});
			});

			describe('circular references', () => {
				describe('without descriptors', () => {
					it('function accessed', () => {
						const inputFn = (0, function() {});
						inputFn.prototype.w = inputFn;
						inputFn.prototype.x = {xx: 1};
						inputFn.prototype.y = inputFn;
						inputFn.prototype.z = inputFn.prototype;
						run(
							inputFn,
							'(()=>{const a=(0,function(){}),b=a.prototype;b.w=a;b.x={xx:1};b.y=a;b.z=b;return a})()',
							(fn) => {
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
						);
					});

					it('prototype accessed', () => {
						const inputFn = (0, function() {});
						inputFn.prototype.w = inputFn;
						inputFn.prototype.x = {xx: 1};
						inputFn.prototype.y = inputFn;
						inputFn.prototype.z = inputFn.prototype;
						run(
							inputFn.prototype,
							'(()=>{const a=(0,function(){}),b=a.prototype;b.w=a;b.x={xx:1};b.y=a;b.z=b;return b})()',
							(proto) => {
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
						);
					});
				});

				describe('with descriptors', () => {
					describe('function accessed', () => {
						it.each( // eslint-disable-next-line no-bitwise
							[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
						)(
							'{writable: %p, enumerable: %p, configurable: %p}',
							(writable, enumerable, configurable) => {
								const inputFn = (0, function() {});
								const p = inputFn.prototype;
								Object.defineProperty(p, 'w', {value: inputFn, writable, enumerable, configurable});
								Object.defineProperty(p, 'x', {value: {xx: 1}, writable, enumerable, configurable});
								Object.defineProperty(p, 'y', {value: inputFn, writable, enumerable, configurable});
								Object.defineProperty(p, 'z', {value: p, writable, enumerable, configurable});
								run(inputFn, null, (fn) => {
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
								});
							}
						);
					});

					describe('prototype accessed', () => {
						it.each( // eslint-disable-next-line no-bitwise
							[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
						)(
							'{writable: %p, enumerable: %p, configurable: %p}',
							(writable, enumerable, configurable) => {
								const inputFn = (0, function() {});
								const p = inputFn.prototype;
								Object.defineProperty(p, 'w', {value: inputFn, writable, enumerable, configurable});
								Object.defineProperty(p, 'x', {value: {xx: 1}, writable, enumerable, configurable});
								Object.defineProperty(p, 'y', {value: inputFn, writable, enumerable, configurable});
								Object.defineProperty(p, 'z', {value: p, writable, enumerable, configurable});
								run(inputFn.prototype, null, (proto) => {
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
								});
							}
						);
					});
				});
			});
		});
	});

	// TODO Tests for arrow functions + generators + async functions + async generators
	// TODO Tests for instances (`new F()`)
	// TODO Tests for inheritance
});
