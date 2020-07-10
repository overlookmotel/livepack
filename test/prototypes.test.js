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
						expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
						expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
						expect(fn.prototype.constructor).toBe(fn);
						expect(fn.prototype).toHaveDescriptorModifiers('constructor', true, false, true);
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
								expect(fn).toHaveDescriptorModifiers('x', true, true, true);
								expect(fn).toHaveDescriptorModifiers('y', true, true, true);
								expect(fn).toHaveDescriptorModifiers('z', true, true, true);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiers('constructor', true, false, true);
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
								expect(fn).toHaveDescriptorModifiers('x', true, true, true);
								expect(fn).toHaveDescriptorModifiers('y', true, true, true);
								expect(fn).toHaveDescriptorModifiers('z', true, true, true);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiers('constructor', true, false, true);
							}
						);
					});

					it('circular', () => {
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
								expect(fn).toHaveDescriptorModifiers('x', true, true, true);
								expect(fn).toHaveDescriptorModifiers('y', true, true, true);
								expect(fn).toHaveDescriptorModifiers('z', true, true, true);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiers('constructor', true, false, true);
							}
						);
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
								expect(fn).toHaveDescriptorModifiers('x', false, true, false);
								expect(fn).toHaveDescriptorModifiers('y', true, true, true);
								expect(fn).toHaveDescriptorModifiers('z', true, true, false);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiers('constructor', true, false, true);
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
								expect(fn).toHaveDescriptorModifiers('x', false, true, false);
								expect(fn).toHaveDescriptorModifiers('y', true, true, true);
								expect(fn).toHaveDescriptorModifiers('z', true, true, false);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiers('constructor', true, false, true);
							}
						);
					});

					it('circular', () => {
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
								expect(fn).toHaveDescriptorModifiers('x', false, true, false);
								expect(fn).toHaveDescriptorModifiers('y', true, true, true);
								expect(fn).toHaveDescriptorModifiers('z', true, true, false);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn.prototype).toHaveDescriptorModifiers('constructor', true, false, true);
							}
						);
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
							expect(fn.prototype).toHaveOwnPropertyNames([]);
							expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('x', true, true, true);
									expect(fn).toHaveDescriptorModifiers('y', true, true, true);
									expect(fn.prototype).toHaveOwnPropertyNames([]);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('x', true, true, true);
									expect(fn).toHaveDescriptorModifiers('y', true, true, true);
									expect(fn.prototype).toHaveOwnPropertyNames([]);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('x', true, true, true);
									expect(fn).toHaveDescriptorModifiers('y', true, true, true);
									expect(fn.prototype).toHaveOwnPropertyNames([]);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('x', false, true, false);
									expect(fn).toHaveDescriptorModifiers('y', true, true, false);
									expect(fn.prototype).toHaveOwnPropertyNames([]);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('x', false, true, false);
									expect(fn).toHaveDescriptorModifiers('y', true, true, false);
									expect(fn.prototype).toHaveOwnPropertyNames([]);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('x', false, true, false);
									expect(fn).toHaveDescriptorModifiers('y', true, true, false);
									expect(fn.prototype).toHaveOwnPropertyNames([]);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
							expect(fn.prototype).toHaveDescriptorModifiers('x', true, true, true);
							expect(fn.prototype).toHaveDescriptorModifiers('y', true, true, true);
							expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', true, true, true);
									expect(fn).toHaveDescriptorModifiers('z', true, true, true);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype).toEqual({w: 1, x: 2});
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', true, true, true);
									expect(fn).toHaveDescriptorModifiers('z', true, true, true);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype).toEqual({w: 1, x: 2});
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', true, true, true);
									expect(fn).toHaveDescriptorModifiers('z', true, true, true);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype).toEqual({w: 1, x: 2});
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', false, true, false);
									expect(fn).toHaveDescriptorModifiers('z', true, true, false);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype).toEqual({w: 1, x: 2});
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', false, true, false);
									expect(fn).toHaveDescriptorModifiers('z', true, true, false);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype).toEqual({w: 1, x: 2});
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', false, true, false);
									expect(fn).toHaveDescriptorModifiers('z', true, true, false);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype).toEqual({w: 1, x: 2});
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
							expect(fn.prototype).toHaveOwnPropertyNames(['x', 'y']);
							expect(fn.prototype.x).toBe(fn);
							expect(fn.prototype.y).toBe(fn);
							expect(fn.prototype).toHaveDescriptorModifiers('x', true, true, true);
							expect(fn.prototype).toHaveDescriptorModifiers('y', true, true, true);
							expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', true, true, true);
									expect(fn).toHaveDescriptorModifiers('z', true, true, true);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype.w).toBe(fn);
									expect(fn.prototype.x).toBe(fn);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', true, true, true);
									expect(fn).toHaveDescriptorModifiers('z', true, true, true);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype.w).toBe(fn);
									expect(fn.prototype.x).toBe(fn);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', true, true, true);
									expect(fn).toHaveDescriptorModifiers('z', true, true, true);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype.w).toBe(fn);
									expect(fn.prototype.x).toBe(fn);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', false, true, false);
									expect(fn).toHaveDescriptorModifiers('z', true, true, false);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype.w).toBe(fn);
									expect(fn.prototype.x).toBe(fn);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', false, true, false);
									expect(fn).toHaveDescriptorModifiers('z', true, true, false);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype.w).toBe(fn);
									expect(fn.prototype.x).toBe(fn);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
									expect(fn).toHaveDescriptorModifiers('y', false, true, false);
									expect(fn).toHaveDescriptorModifiers('z', true, true, false);
									expect(fn.prototype).toHaveOwnPropertyNames(['w', 'x']);
									expect(fn.prototype.w).toBe(fn);
									expect(fn.prototype.x).toBe(fn);
									expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
							expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
							expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn).toHaveDescriptorModifiers('x', true, true, true);
							expect(fn).toHaveDescriptorModifiers('y', true, true, true);
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
							expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
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
							expect(fn).toHaveDescriptorModifiers('prototype', true, false, false);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn).toHaveDescriptorModifiers('x', true, true, true);
							expect(fn).toHaveDescriptorModifiers('y', true, true, true);
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
					'(()=>{const a={},b=Object.defineProperties,c=b(function(){},{prototype:{value:a,writable:false}});b(a,{constructor:{value:c,writable:true,configurable:true}});return c})()',
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
						expect(fn).toHaveDescriptorModifiers('prototype', false, false, false);
						expect(fn.prototype.constructor).toBe(fn);
						expect(fn.prototype).toHaveDescriptorModifiers('constructor', true, false, true);
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
							'(()=>{const a={},b=Object.defineProperties,c=b(function(){},{prototype:{value:a,writable:false},y:{value:3,writable:true,enumerable:true,configurable:true},z:{value:4,writable:true,enumerable:true,configurable:true}});b(a,{constructor:{value:c,writable:true,configurable:true}});return c})()',
							(fn) => {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(3);
								expect(fn.z).toBe(4);
								expect(fn).toHaveDescriptorModifiers('y', true, true, true);
								expect(fn).toHaveDescriptorModifiers('z', true, true, true);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn).toHaveDescriptorModifiers('prototype', false, false, false);
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
							'(()=>{const a={},b=Object.defineProperties,c={xx:1},d=b(function(){},{prototype:{value:a,writable:false},y:{value:c,writable:true,enumerable:true,configurable:true},z:{value:c,writable:true,enumerable:true,configurable:true}});b(a,{constructor:{value:d,writable:true,configurable:true}});return d})()',
							(fn) => {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toEqual({xx: 1});
								expect(fn.z).toBe(fn.y);
								expect(fn).toHaveDescriptorModifiers('y', true, true, true);
								expect(fn).toHaveDescriptorModifiers('z', true, true, true);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn).toHaveDescriptorModifiers('prototype', false, false, false);
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
							'(()=>{const a={},b=Object.defineProperties,c=b(function(){},{prototype:{value:a,writable:false}});b(a,{constructor:{value:c,writable:true,configurable:true}});c.y=c;c.z=c;return c})()',
							(fn) => {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(fn);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiers('y', true, true, true);
								expect(fn).toHaveDescriptorModifiers('z', true, true, true);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn).toHaveDescriptorModifiers('prototype', false, false, false);
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
							'(()=>{const a={},b=Object.defineProperties,c=b(function(){},{prototype:{value:a,writable:false},y:{value:3,enumerable:true},z:{value:4,writable:true,enumerable:true}});b(a,{constructor:{value:c,writable:true,configurable:true}});return c})()',
							(fn) => {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(3);
								expect(fn.z).toBe(4);
								expect(fn).toHaveDescriptorModifiers('y', false, true, false);
								expect(fn).toHaveDescriptorModifiers('z', true, true, false);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn).toHaveDescriptorModifiers('prototype', false, false, false);
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
							'(()=>{const a={},b=Object.defineProperties,c={xx:1},d=b(function(){},{prototype:{value:a,writable:false},y:{value:c,enumerable:true},z:{value:c,writable:true,enumerable:true}});b(a,{constructor:{value:d,writable:true,configurable:true}});return d})()',
							(fn) => {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toEqual({xx: 1});
								expect(fn.z).toBe(fn.y);
								expect(fn).toHaveDescriptorModifiers('y', false, true, false);
								expect(fn).toHaveDescriptorModifiers('z', true, true, false);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn).toHaveDescriptorModifiers('prototype', false, false, false);
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
							'(()=>{const a={},b=Object.defineProperties,c=b(function(){},{prototype:{value:a,writable:false}});b(a,{constructor:{value:c,writable:true,configurable:true}});b(c,{y:{value:c,enumerable:true},z:{value:c,writable:true,enumerable:true}});return c})()',
							(fn) => {
								expect(fn).toBeFunction();
								expect(fn).toContainAllKeys(['y', 'z']);
								expect(fn.y).toBe(fn);
								expect(fn.z).toBe(fn);
								expect(fn).toHaveDescriptorModifiers('y', false, true, false);
								expect(fn).toHaveDescriptorModifiers('z', true, true, false);
								expect(fn.prototype).toHaveOwnPropertyNames(['constructor']);
								expect(fn.prototype.constructor).toBe(fn);
								expect(fn).toHaveDescriptorModifiers('prototype', false, false, false);
							}
						);
					});
				});
			});
		});
	});

	// TODO Tests for accessing via prototype first
	// TODO Tests for arrow functions + generators + async functions + async generators
	// TODO Tests for constructor altered
	// TODO Tests for prototype props/methods
	// TODO Tests for instances (`new F()`)
	// TODO Tests for inheritance
});
