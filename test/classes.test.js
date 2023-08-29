/* --------------------
 * livepack module
 * Tests for Classes
 * ------------------*/

/* eslint-disable lines-between-class-members */

'use strict';

// Imports
const {itSerializes} = require('./support/index.js');

// Tests

const spy = jest.fn;

describe('Classes', () => {
	describe('empty class', () => {
		itSerializes('anonymous', {
			in: () => class {},
			out: 'class{}',
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('');
			}
		});

		itSerializes('named', {
			in: () => class C {},
			out: 'class C{}',
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('C');
			}
		});
	});

	describe('with constructor only', () => {
		itSerializes('no external vars', {
			in: () => class {
				constructor(param) {
					this.x = param;
				}
			},
			out: 'class{constructor(a){this.x=a}}',
			validate(Klass) {
				expect(Klass).toBeFunction();
				const instance = new Klass(1);
				expect(instance).toBeObject();
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(1);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});

		itSerializes('with external vars', {
			in() {
				const ext = 10;
				return class {
					constructor(param) {
						this.x = param + ext;
					}
				};
			},
			out: '(b=>class{constructor(a){this.x=a+b}})(10)',
			validate(Klass) {
				expect(Klass).toBeFunction();
				const instance = new Klass(1);
				expect(instance).toBeObject();
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(11);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});
	});

	describe('with prototype method only', () => {
		itSerializes('no external vars', {
			in: () => class {
				y(param) {
					this.x = param;
				}
			},
			out: `(()=>{
				const a=(0,class{});
				Object.defineProperties(
					a.prototype,
					{y:{value:{y(a){this.x=a}}.y,writable:true,configurable:true}}
				);
				return a
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.prototype.y).toBeFunction();
				expect(Klass.prototype.y.prototype).toBeUndefined();
				const instance = new Klass();
				expect(instance).toBeObject();
				expect(instance).toContainAllKeys([]);
				instance.y(2);
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(2);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});

		itSerializes('with external vars', {
			in() {
				const ext = 10;
				return class {
					y(param) {
						this.x = param + ext;
					}
				};
			},
			out: `(()=>{
				const a=(0,class{});
				Object.defineProperties(
					a.prototype,
					{y:{value:(b=>({y(a){this.x=a+b}}).y)(10),writable:true,configurable:true}}
				);
				return a
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.prototype.y).toBeFunction();
				expect(Klass.prototype.y.prototype).toBeUndefined();
				const instance = new Klass();
				expect(instance).toBeObject();
				expect(instance).toContainAllKeys([]);
				instance.y(2);
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(12);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});
	});

	describe('with static method only', () => {
		describe('anonymous', () => {
			itSerializes('no external vars', {
				in: () => class {
					static z(param) {
						this.x = param;
					}
				},
				out: `Object.defineProperties(
					class{},
					{z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true}}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('');
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					expect(Klass.z).toBeFunction();
					expect(Klass.z.prototype).toBeUndefined();
					Klass.z(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('with external vars', {
				in() {
					const ext = 10;
					return class {
						static z(param) {
							this.x = param + ext;
						}
					};
				},
				out: `Object.defineProperties(
					class{},
					{z:{value:(b=>({z(a){this.x=a+b}}).z)(10),writable:true,configurable:true}}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('');
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					expect(Klass.z).toBeFunction();
					expect(Klass.z.prototype).toBeUndefined();
					Klass.z(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(13);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});
		});

		describe('named', () => {
			itSerializes('no external vars', {
				in: () => class C {
					static z(param) {
						this.x = param;
					}
				},
				out: `Object.defineProperties(
					class C{},
					{
						z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true}
					}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					expect(Klass.z).toBeFunction();
					expect(Klass.z.prototype).toBeUndefined();
					Klass.z(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('with external vars', {
				in() {
					const ext = 10;
					return class C {
						static z(param) {
							this.x = param + ext;
						}
					};
				},
				out: `Object.defineProperties(
					class C{},
					{
						z:{value:(b=>({z(a){this.x=a+b}}).z)(10),writable:true,configurable:true}
					}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					expect(Klass.z).toBeFunction();
					expect(Klass.z.prototype).toBeUndefined();
					Klass.z(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(13);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});
		});
	});

	describe('with prototype and static methods', () => {
		describe('anonymous', () => {
			itSerializes('no external vars', {
				in: () => class {
					y(param) {
						this.x = param;
					}
					static z(param) {
						this.x = param;
					}
				},
				out: `(()=>{
					const a=Object.defineProperties,
						b=a(
							class{},
							{z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true}}
						);
					a(b.prototype,{y:{value:{y(a){this.x=a}}.y,writable:true,configurable:true}});
					return b
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('');
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					Klass.z(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys([]);
					instance.y(2);
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(2);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('with external vars', {
				in() {
					const ext = 10;
					return class {
						y(param) {
							this.x = param + ext;
						}
						static z(param) {
							this.x = param + ext;
						}
					};
				},
				out: `(()=>{
					const a=(
							b=>[
								{z(a){this.x=a+b}}.z,
								{y(a){this.x=a+b}}.y
							]
						)(10),
						b=Object.defineProperties,
						c=b(
							class{},
							{z:{value:a[0],writable:true,configurable:true}}
						);
					b(c.prototype,{y:{value:a[1],writable:true,configurable:true}});
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('');
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					Klass.z(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(13);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys([]);
					instance.y(2);
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(12);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});
		});

		describe('named', () => {
			itSerializes('no external vars', {
				in: () => class C {
					y(param) {
						this.x = param;
					}
					static z(param) {
						this.x = param;
					}
				},
				out: `(()=>{
					const a=Object.defineProperties,
						b=a(
							class C{},
							{
								z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true}
							}
						);
					a(b.prototype,{y:{value:{y(a){this.x=a}}.y,writable:true,configurable:true}});
					return b
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					Klass.z(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys([]);
					instance.y(2);
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(2);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('with external vars', {
				in() {
					const ext = 10;
					return class C {
						y(param) {
							this.x = param + ext;
						}
						static z(param) {
							this.x = param + ext;
						}
					};
				},
				out: `(()=>{
					const a=(
							b=>[
								{z(a){this.x=a+b}}.z,
								{y(a){this.x=a+b}}.y
							]
						)(10),
						b=Object.defineProperties,
						c=b(
							class C{},
							{
								z:{value:a[0],writable:true,configurable:true}
							}
						);
					b(c.prototype,{y:{value:a[1],writable:true,configurable:true}});
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					Klass.z(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(13);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys([]);
					instance.y(2);
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(12);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});
		});
	});

	describe('with constructor and', () => {
		describe('with prototype method only', () => {
			itSerializes('constructor first', {
				in: () => class {
					constructor() {
						this.x = 1;
					}
					y() {
						this.x = 2;
					}
				},
				out: `(()=>{
					const a=(0,class{constructor(){this.x=1}});
					Object.defineProperties(
						a.prototype,
						{y:{value:{y(){this.x=2}}.y,writable:true,configurable:true}}
					);
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(1);
					instance.y();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(2);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('method first', {
				in: () => class {
					y() {
						this.x = 2;
					}
					constructor() {
						this.x = 1;
					}
				},
				out: `(()=>{
					const a=(0,class{constructor(){this.x=1}});
					Object.defineProperties(
						a.prototype,
						{y:{value:{y(){this.x=2}}.y,writable:true,configurable:true}}
					);
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(1);
					instance.y();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(2);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});
		});

		describe('with static method only', () => {
			itSerializes('constructor first', {
				in: () => class {
					constructor() {
						this.x = 1;
					}
					static z() {
						this.x = 3;
					}
				},
				out: `Object.defineProperties(
					class{constructor(){this.x=1}},
					{z:{value:{z(){this.x=3}}.z,writable:true,configurable:true}}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					Klass.z();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(1);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('method first', {
				in: () => class {
					static z() {
						this.x = 3;
					}
					constructor() {
						this.x = 1;
					}
				},
				out: `Object.defineProperties(
					class{constructor(){this.x=1}},
					{z:{value:{z(){this.x=3}}.z,writable:true,configurable:true}}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					Klass.z();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(1);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('with class name referred to within constructor', {
				in: () => class X {
					constructor() {
						this.x = X;
					}
					static z() {}
				},
				out: `(()=>{
					const a=(a=>a=class X{
						constructor(){this.x=a}
					})();
					Object.defineProperties(
						a,
						{
							z:{
								value:{z(){}}.z,
								writable:true,
								configurable:true
							}
						}
					);
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(Klass);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});
		});

		describe('with prototype and static methods', () => {
			itSerializes('constructor first', {
				in: () => class {
					constructor() {
						this.x = 1;
					}
					y() {
						this.x = 2;
					}
					static z() {
						this.x = 3;
					}
				},
				out: `(()=>{
					const a=Object.defineProperties,
						b=a(
							class{constructor(){this.x=1}},
							{z:{value:{z(){this.x=3}}.z,writable:true,configurable:true}}
						);
					a(b.prototype,{y:{value:{y(){this.x=2}}.y,writable:true,configurable:true}});
					return b
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					Klass.z();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(1);
					instance.y();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(2);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('method first', {
				in: () => class {
					y() {
						this.x = 2;
					}
					constructor() {
						this.x = 1;
					}
					static z() {
						this.x = 3;
					}
				},
				out: `(()=>{
					const a=Object.defineProperties,
						b=a(
							class{constructor(){this.x=1}},
							{z:{value:{z(){this.x=3}}.z,writable:true,configurable:true}}
						);
					a(b.prototype,{y:{value:{y(){this.x=2}}.y,writable:true,configurable:true}});
					return b
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
					Klass.z();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(1);
					instance.y();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(2);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});
		});

		itSerializes('with external vars', {
			in() {
				const ext = 10;
				return class C {
					constructor(param) {
						this.x = param + ext;
					}
					y(param) {
						this.x = param + ext;
					}
					static z(param) {
						this.x = param + ext;
					}
				};
			},
			out: `(()=>{
				const a=(
						b=>[
							class C{constructor(a){this.x=a+b}},
							{z(a){this.x=a+b}}.z,
							{y(a){this.x=a+b}}.y
						]
					)(10),
					b=Object.defineProperties,
					c=b(
						a[0],
						{
							z:{value:a[1],writable:true,configurable:true}
						}
					);
				b(c.prototype,{y:{value:a[2],writable:true,configurable:true}});
				return c
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('C');
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
				Klass.z(3);
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
				expect(Klass.x).toBe(13);
				const instance = new Klass(1);
				expect(instance).toBeObject();
				expect(instance.x).toBe(11);
				expect(instance).toContainAllKeys(['x']);
				instance.y(2);
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(12);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});
	});

	describe('referencing class name', () => {
		describe('in constructor', () => {
			itSerializes('class declaration', {
				in() {
					class X {
						constructor() {
							this.x = X;
						}
					}
					const Klass = X;
					X = 1; // eslint-disable-line no-class-assign
					return Klass;
				},
				out: '(a=>a=class X{constructor(){this.x=a}})()',
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(Klass);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('class expression', {
				in() {
					const X = 1; // eslint-disable-line no-unused-vars
					return class X { // eslint-disable-line no-shadow
						constructor() {
							this.x = X;
						}
					};
				},
				out: '(a=>a=class X{constructor(){this.x=a}})()',
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(Klass);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			/* eslint-disable no-eval */
			describe('when constructor contains `eval()`', () => {
				itSerializes('class declaration', {
					in: () => (0, eval)(`
						class X {
							constructor() {
								eval('0');
								this.x = X;
							}
						}
						(() => {
							const Klass = X;
							X = 1;
							return Klass;
						})();
					`),
					out: '(0,eval)("(class X{constructor(){eval(\\"0\\");this.x=X}})")',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('X');
						const instance = new Klass();
						expect(instance).toBeObject();
						expect(instance).toContainAllKeys(['x']);
						expect(instance.x).toBe(Klass);
						expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
					}
				});

				itSerializes('class expression', {
					in: () => (0, eval)(`
						const X = 1;
						(class X {
							constructor() {
								eval('0');
								this.x = X;
							}
						})
					`),
					out: '(0,eval)("(class X{constructor(){eval(\\"0\\");this.x=X}})")',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('X');
						const instance = new Klass();
						expect(instance).toBeObject();
						expect(instance).toContainAllKeys(['x']);
						expect(instance.x).toBe(Klass);
						expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
					}
				});
			});
			/* eslint-enable no-eval */
		});

		describe('in prototype method', () => {
			itSerializes('class declaration', {
				in() {
					class X {
						meth() { // eslint-disable-line class-methods-use-this
							return X;
						}
					}
					const Klass = X;
					X = 1; // eslint-disable-line no-class-assign
					return Klass;
				},
				out: `(()=>{
					const a=class X{},
						b=(a=>[
							b=>a=b,
							{meth(){return a}}.meth
						])();
					b[0](a);
					Object.defineProperties(a.prototype,{meth:{value:b[1],writable:true,configurable:true}});
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(Klass.prototype.meth).toBeFunction();
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance.meth()).toBe(Klass);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});

			itSerializes('class expression', {
				in() {
					const X = 1; // eslint-disable-line no-unused-vars
					return class X { // eslint-disable-line no-shadow
						meth() { // eslint-disable-line class-methods-use-this
							return X;
						}
					};
				},
				out: `(()=>{
					const a=class X{},
						b=(a=>[
							b=>a=b,
							{meth(){return a}}.meth
						])();
					b[0](a);
					Object.defineProperties(a.prototype,{meth:{value:b[1],writable:true,configurable:true}});
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(Klass.prototype.meth).toBeFunction();
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance.meth()).toBe(Klass);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			});
		});

		describe('in static method', () => {
			itSerializes('class declaration', {
				in() {
					class X {
						static meth() {
							return X;
						}
					}
					const Klass = X;
					X = 1; // eslint-disable-line no-class-assign
					return Klass;
				},
				out: `(()=>{
					const a=(a=>[
							b=>a=b,
							{meth(){return a}}.meth
						])(),
						b=Object.defineProperties(
							class X{},
							{
								meth:{value:a[1],writable:true,configurable:true}
							}
						);
					a[0](b);
					return b
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(Klass.meth).toBeFunction();
					expect(Klass.meth()).toBe(Klass);
				}
			});

			itSerializes('class expression', {
				in() {
					const X = 1; // eslint-disable-line no-unused-vars
					return class X { // eslint-disable-line no-shadow
						static meth() {
							return X;
						}
					};
				},
				out: `(()=>{
					const a=(a=>[
							b=>a=b,
							{meth(){return a}}.meth
						])(),
						b=Object.defineProperties(
							class X{},
							{
								meth:{value:a[1],writable:true,configurable:true}
							}
						);
					a[0](b);
					return b
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(Klass.meth).toBeFunction();
					expect(Klass.meth()).toBe(Klass);
				}
			});
		});

		describe('in extends clause', () => {
			itSerializes('class declaration', {
				in() {
					class X extends function fn() { return X; } {}
					const Klass = X;
					X = 1; // eslint-disable-line no-class-assign
					return Klass;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=(a=>[
							b=>a=b,
							function fn(){return a}
						])(),
						c=b[1],
						d=(b=>b=class X{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					b[0](d);
					a(d,c);
					a(d.prototype,c.prototype);
					return d
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					const fn = Object.getPrototypeOf(Klass);
					expect(fn).toBeFunction();
					expect(fn.name).toBe('fn');
					expect(Klass.prototype).toHavePrototype(fn.prototype);
					expect(fn()).toBe(Klass);
				}
			});

			itSerializes('class expression', {
				in() {
					const X = 1; // Should be ESLint `no-unused-vars` error on this line, but ESLint gets it wrong
					return class X extends function fn() { return X; } {}; // eslint-disable-line no-shadow
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=(a=>[
							b=>a=b,
							function fn(){return a}
						])(),
						c=b[1],
						d=(b=>b=class X{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					b[0](d);
					a(d,c);
					a(d.prototype,c.prototype);
					return d
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					const fn = Object.getPrototypeOf(Klass);
					expect(fn).toBeFunction();
					expect(fn.name).toBe('fn');
					expect(Klass.prototype).toHavePrototype(fn.prototype);
					expect(fn()).toBe(Klass);
				}
			});
		});
	});

	describe('assigning to class name throws error', () => {
		describe('in constructor', () => {
			itSerializes('class declaration', {
				in() {
					class X {
						constructor() {
							X = 1; // eslint-disable-line no-class-assign
						}
					}
					return X;
				},
				out: 'class X{constructor(){1,(()=>{const a=0;a=0})()}}',
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(() => new Klass()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});

			itSerializes('class expression', {
				in() {
					return class X {
						constructor() {
							X = 1; // eslint-disable-line no-class-assign
						}
					};
				},
				out: 'class X{constructor(){1,(()=>{const a=0;a=0})()}}',
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(() => new Klass()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});

			/* eslint-disable no-eval */
			describe('when constructor contains `eval()`', () => {
				itSerializes('class declaration', {
					in: () => (0, eval)(`
						class X {
							constructor() {
								eval('0');
								X = 1;
							}
						}
						X
					`),
					out: '(0,eval)("(class X{constructor(){eval(\\"0\\");X=1}})")',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('X');
						expect(() => new Klass()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('class expression', {
					in: () => (0, eval)(`
						(class X {
							constructor() {
								eval('0');
								X = 1;
							}
						})
					`),
					out: '(0,eval)("(class X{constructor(){eval(\\"0\\");X=1}})")',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('X');
						expect(() => new Klass()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});
			});
			/* eslint-enable no-eval */
		});

		describe('in prototype method', () => {
			itSerializes('class declaration', {
				in() {
					class X {
						meth() { // eslint-disable-line class-methods-use-this
							X = 1; // eslint-disable-line no-class-assign
						}
					}
					return X;
				},
				out: `(()=>{
					const a=class X{};
					Object.defineProperties(
						a.prototype,
						{
							meth:{
								value:{
									meth(){
										1,(()=>{const a=0;a=0})()
									}
								}.meth,
								writable:true,
								configurable:true
							}
						}
					);
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(() => new Klass().meth()).toThrowWithMessage(
						TypeError, 'Assignment to constant variable.'
					);
				}
			});

			itSerializes('class expression', {
				in() {
					return class X {
						meth() { // eslint-disable-line class-methods-use-this
							X = 1; // eslint-disable-line no-class-assign
						}
					};
				},
				out: `(()=>{
					const a=class X{};
					Object.defineProperties(
						a.prototype,
						{
							meth:{
								value:{
									meth(){
										1,(()=>{const a=0;a=0})()
									}
								}.meth,
								writable:true,
								configurable:true
							}
						}
					);
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(() => new Klass().meth()).toThrowWithMessage(
						TypeError, 'Assignment to constant variable.'
					);
				}
			});
		});

		describe('in static method', () => {
			itSerializes('class declaration', {
				in() {
					class X {
						static meth() {
							X = 1; // eslint-disable-line no-class-assign
						}
					}
					return X;
				},
				out: `Object.defineProperties(
					class X{},
					{
						meth:{
							value:{
								meth(){
									1,(()=>{const a=0;a=0})()
								}
							}.meth,
							writable:true,
							configurable:true
						}
					}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(Klass.meth).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});

			itSerializes('class declaration', {
				in() {
					return class X {
						static meth() {
							X = 1; // eslint-disable-line no-class-assign
						}
					};
				},
				out: `Object.defineProperties(
					class X{},
					{
						meth:{
							value:{
								meth(){
									1,(()=>{const a=0;a=0})()
								}
							}.meth,
							writable:true,
							configurable:true
						}
					}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('X');
					expect(Klass.meth).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});
		});

		describe('in extends clause', () => {
			itSerializes('class declaration', {
				in() {
					let fn;
					// eslint-disable-next-line no-class-assign, no-unused-vars
					class X extends (fn = function() { X = 1; }) {}
					return fn;
				},
				out: 'function fn(){1,(()=>{const a=0;a=0})()}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});

			itSerializes('class expression', {
				in() {
					let fn;
					// eslint-disable-next-line no-undef, no-unused-vars
					const Klass = class X extends (fn = function() { X = 1; }) {};
					return fn;
				},
				out: 'function fn(){1,(()=>{const a=0;a=0})()}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				}
			});
		});
	});

	describe('with computed method keys', () => {
		itSerializes('prototype methods', {
			in() {
				const yy = 'y';
				function getZ() { return 'z'; }
				return class {
					[yy]() {
						this.x = 1;
					}
					[getZ()]() {
						this.x = 2;
					}
				};
			},
			out: `(()=>{
				const a=(0,class{});
				Object.defineProperties(
					a.prototype,
					{
						y:{value:{y(){this.x=1}}.y,writable:true,configurable:true},
						z:{value:{z(){this.x=2}}.z,writable:true,configurable:true}
					}
				);
				return a
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.prototype.y).toBeFunction();
				expect(Klass.prototype.y.prototype).toBeUndefined();
				expect(Klass.prototype.z).toBeFunction();
				expect(Klass.prototype.z.prototype).toBeUndefined();
				const instance = new Klass();
				expect(instance).toBeObject();
				expect(instance).toContainAllKeys([]);
				instance.y();
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(1);
				instance.z();
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(2);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});

		itSerializes('static method', {
			in() {
				const yy = 'y';
				function getZ() { return 'z'; }
				return class {
					static [yy]() {
						this.x = 1;
					}
					static [getZ()]() {
						this.x = 2;
					}
				};
			},
			out: `Object.defineProperties(
				class{},
				{
					y:{value:{y(){this.x=1}}.y,writable:true,configurable:true},
					z:{value:{z(){this.x=2}}.z,writable:true,configurable:true}
				}
			)`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'y', 'z']);
				expect(Klass.y).toBeFunction();
				expect(Klass.y.prototype).toBeUndefined();
				expect(Klass.z).toBeFunction();
				expect(Klass.z.prototype).toBeUndefined();
				Klass.y();
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'y', 'z', 'x']);
				expect(Klass.x).toBe(1);
				Klass.z();
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'y', 'z', 'x']);
				expect(Klass.x).toBe(2);
			}
		});

		describe('computed key containing function', () => {
			itSerializes('not nested', {
				in() {
					return class {
						[(() => 'y')()]() {
							this.x = 1;
						}
					};
				},
				out: `(()=>{
					const a=(0,class{});
					Object.defineProperties(
						a.prototype,
						{
							y:{value:{y(){this.x=1}}.y,
							writable:true,
							configurable:true
						}
					});
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.prototype.y).toBeFunction();
					expect(Klass.prototype.y.prototype).toBeUndefined();
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys([]);
					instance.y();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(1);
				}
			});

			itSerializes('nested in a function', {
				in() {
					return function() {
						return class {
							[(() => 'y')()]() {
								this.x = 1;
							}
						};
					};
				},
				out: 'function(){return class{[(()=>"y")()](){this.x=1}}}',
				validate(fn) {
					expect(fn).toBeFunction();
					const Klass = fn();
					expect(Klass).toBeFunction();
					expect(Klass.prototype.y).toBeFunction();
					expect(Klass.prototype.y.prototype).toBeUndefined();
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys([]);
					instance.y();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(1);
				}
			});
		});
	});

	describe('async methods', () => {
		itSerializes('prototype', {
			in: () => class {
				async y() {
					this.x = 2;
				}
			},
			out: `(()=>{
				const a=(0,class{});
				Object.defineProperties(
					a.prototype,
					{y:{value:{async y(){this.x=2}}.y,writable:true,configurable:true}}
				);
				return a
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.prototype.y).toBeFunction();
				expect(Klass.prototype.y.prototype).toBeUndefined();
				const instance = new Klass();
				expect(instance).toBeObject();
				expect(instance).toContainAllKeys([]);
				expect(instance.y()).toBeInstanceOf(Promise);
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(2);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});

		itSerializes('static', {
			in: () => class {
				static async z() {
					this.x = 3;
				}
			},
			out: `Object.defineProperties(
				class{},
				{z:{value:{async z(){this.x=3}}.z,writable:true,configurable:true}}
			)`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
				expect(Klass.z).toBeFunction();
				expect(Klass.z.prototype).toBeUndefined();
				expect(Klass.z()).toBeInstanceOf(Promise);
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
				expect(Klass.x).toBe(3);
			}
		});
	});

	describe('generator methods', () => {
		itSerializes('prototype', {
			in: () => class {
				*y() { // eslint-disable-line require-yield
					this.x = 2;
				}
			},
			out: `(()=>{
				const a=(0,class{});
				Object.defineProperties(
					a.prototype,
					{y:{value:{*y(){this.x=2}}.y,writable:true,configurable:true}}
				);
				return a
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.prototype.y).toBeFunction();
				expect(Klass.prototype.y.prototype).toBeObject();
				expect(Klass.prototype.y.prototype).toHaveOwnPropertyNames([]);
				const instance = new Klass();
				expect(instance).toBeObject();
				expect(instance).toContainAllKeys([]);
				const res = instance.y();
				expect(instance.x).toBeUndefined();
				expect(res).toBeObject();
				res.next();
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(2);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});

		itSerializes('static', {
			in: () => class {
				static*z() { // eslint-disable-line require-yield
					this.x = 3;
				}
			},
			out: `Object.defineProperties(
				class{},
				{z:{value:{*z(){this.x=3}}.z,writable:true,configurable:true}}
			)`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
				expect(Klass.z).toBeFunction();
				expect(Klass.z.prototype).toBeObject();
				expect(Klass.z.prototype).toHaveOwnPropertyNames([]);
				const res = Klass.z();
				expect(Klass.x).toBeUndefined();
				expect(res).toBeObject();
				res.next();
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
				expect(Klass.x).toBe(3);
			}
		});
	});

	describe('async generator methods', () => {
		itSerializes('prototype', {
			in: () => class {
				async*y() { // eslint-disable-line require-yield
					this.x = 2;
				}
			},
			out: `(()=>{
				const a=(0,class{});
				Object.defineProperties(
					a.prototype,
					{y:{value:{async*y(){this.x=2}}.y,writable:true,configurable:true}}
				);
				return a
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.prototype.y).toBeFunction();
				expect(Klass.prototype.y.prototype).toBeObject();
				expect(Klass.prototype.y.prototype).toHaveOwnPropertyNames([]);
				const instance = new Klass();
				expect(instance).toBeObject();
				expect(instance).toContainAllKeys([]);
				const res = instance.y();
				expect(instance.x).toBeUndefined();
				expect(res).toBeObject();
				expect(res.next()).toBeInstanceOf(Promise);
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(2);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});

		itSerializes('static', {
			in: () => class {
				static async*z() { // eslint-disable-line require-yield
					this.x = 3;
				}
			},
			out: `Object.defineProperties(
				class{},
				{z:{value:{async*z(){this.x=3}}.z,writable:true,configurable:true}}
			)`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
				expect(Klass.z).toBeFunction();
				expect(Klass.z.prototype).toBeObject();
				expect(Klass.z.prototype).toHaveOwnPropertyNames([]);
				const res = Klass.z();
				expect(Klass.x).toBeUndefined();
				expect(res).toBeObject();
				expect(res.next()).toBeInstanceOf(Promise);
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
				expect(Klass.x).toBe(3);
			}
		});
	});

	describe('getter + setters', () => {
		itSerializes('prototype method', {
			in: () => class {
				get y() {
					return this.x;
				}
				set y(param) {
					this.x = param;
				}
			},
			out: `(()=>{
				const a=(0,class{});
				Object.defineProperties(
					a.prototype,
					{
						y:{
							get:{"get y"(){return this.x}}["get y"],
							set:{"set y"(a){this.x=a}}["set y"],
							configurable:true
						}
					}
				);
				return a
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				const descriptor = Object.getOwnPropertyDescriptor(Klass.prototype, 'y');
				expect(descriptor.get).toBeFunction();
				expect(descriptor.get.prototype).toBeUndefined();
				expect(descriptor.set).toBeFunction();
				expect(descriptor.set.prototype).toBeUndefined();
				const instance = new Klass();
				expect(instance).toBeObject();
				expect(instance).toContainAllKeys([]);
				instance.y = 3;
				expect(instance).toContainAllKeys(['x']);
				expect(instance.x).toBe(3);
				instance.x = 2;
				expect(instance.y).toBe(2);
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});

		itSerializes('static method', {
			in: () => class {
				static get z() {
					return this.x;
				}
				static set z(param) {
					this.x = param;
				}
			},
			out: `Object.defineProperties(
				class{},
				{
					z:{
						get:{"get z"(){return this.x}}["get z"],
						set:{"set z"(a){this.x=a}}["set z"],
						configurable:true
					}
				}
			)`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z']);
				const descriptor = Object.getOwnPropertyDescriptor(Klass, 'z');
				expect(descriptor.get).toBeFunction();
				expect(descriptor.get.prototype).toBeUndefined();
				expect(descriptor.set).toBeFunction();
				expect(descriptor.set.prototype).toBeUndefined();
				Klass.z = 3;
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'z', 'x']);
				expect(Klass.x).toBe(3);
				Klass.x = 2;
				expect(Klass.z).toBe(2);
				const instance = new Klass();
				expect(instance).toBeObject();
				expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
			}
		});
	});

	describe('extends', () => {
		describe('empty class', () => {
			itSerializes('anonymous', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
					}
					return class extends X {};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{
							constructor(){
								this.x=1
							}
						},
						c=(
							b=>b=(0,class{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							})
						)();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
				}
			});

			itSerializes('named', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
					}
					return class Y extends X {};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{
							constructor(){
								this.x=1
							}
						},
						c=(b=>b=class Y{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
				}
			});
		});

		describe('with constructor', () => {
			itSerializes('super() called with no params', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
					}
					return class Y extends X {
						constructor() { // eslint-disable-line no-useless-constructor
							super();
						}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{
							constructor(){
								this.x=1
							}
						},
						c=(a=>a=class Y{
							constructor(){
								return Reflect.construct(Object.getPrototypeOf(a),[],a)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
				}
			});

			itSerializes('result of super() returned', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
					}
					return class Y extends X {
						constructor() {
							return super(); // eslint-disable-line constructor-super, no-constructor-return
						}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{
							constructor(){
								this.x=1
							}
						},
						c=(a=>a=class Y{
							constructor(){
								return Reflect.construct(Object.getPrototypeOf(a),[],a)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
				}
			});

			itSerializes('super() called with params', {
				in() {
					class X {
						constructor(x, y, z) {
							this.x = x + y + z;
						}
					}
					return class Y extends X {
						constructor(x, y) {
							super(x, y, 100);
						}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{
							constructor(a,b,c){
								this.x=a+b+c
							}
						},
						c=(c=>c=class Y{
							constructor(a,b){
								return Reflect.construct(Object.getPrototypeOf(c),[a,b,100],c)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass(1, 10);
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(111);
				}
			});

			itSerializes('statements before super()', {
				in() {
					class X {
						constructor(x) {
							this.x = x + 10;
						}
					}
					return class Y extends X {
						constructor() {
							const x = 1;
							super(x);
						}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{
							constructor(a){
								this.x=a+10
							}
						},
						c=(b=>b=class Y{
							constructor(){
								const a=1;
								return Reflect.construct(Object.getPrototypeOf(b),[a],b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(11);
				}
			});

			itSerializes('statements after super()', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
					}
					return class Y extends X {
						constructor() {
							super();
							this.y = 2;
						}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{
							constructor(){
								this.x=1
							}
						},
						c=(b=>b=class Y{
							constructor(){
								const a=Reflect.construct(Object.getPrototypeOf(b),[],b);
								a.y=2;
								return a
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x', 'y']);
					expect(instance.x).toBe(1);
					expect(instance.y).toBe(2);
				}
			});

			itSerializes('statements before and after super()', {
				in() {
					class X {
						constructor(x) {
							this.x = x + 10;
						}
					}
					return class Y extends X {
						constructor() {
							const x = 1;
							super(x);
							this.y = 2;
						}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{
							constructor(a){
								this.x=a+10
							}
						},
						c=(c=>c=class Y{
							constructor(){
								const a=1;
								const b=Reflect.construct(Object.getPrototypeOf(c),[a],c);
								b.y=2;
								return b
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x', 'y']);
					expect(instance.x).toBe(11);
					expect(instance.y).toBe(2);
				}
			});

			describe('multiple super() calls', () => {
				itSerializes('nested', {
					in() {
						class X {
							constructor(x) {
								this.x = x;
							}
						}
						return class Y extends X {
							constructor(x) {
								if (x) {
									super(x);
								} else {
									super(1);
								}
							}
						};
					},
					out: `(()=>{
						const a=Object.setPrototypeOf,
							b=class X{
								constructor(a){
									this.x=a
								}
							},
							c=(c=>c=class Y{
								constructor(a){
									let b;
									if(a){
										b=Reflect.construct(Object.getPrototypeOf(c),[a],c)
									}else{
										b=Reflect.construct(Object.getPrototypeOf(c),[1],c)
									}
									return b
								}
							})();
						a(c,b);
						a(c.prototype,b.prototype);
						return c
					})()`,
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('Y');
						const {prototype} = Klass;
						expect(prototype).toBeObject();
						expect(prototype.constructor).toBe(Klass);
						const proto = Object.getPrototypeOf(prototype);
						expect(proto).toBeObject();
						expect(proto).not.toBe(Object.prototype);
						expect(proto).toHavePrototype(Object.prototype);
						const SuperClass = proto.constructor;
						expect(SuperClass).toBeFunction();
						expect(SuperClass.name).toBe('X');

						const instance1 = new Klass(3);
						expect(instance1).toBeInstanceOf(Klass);
						expect(instance1).toBeInstanceOf(SuperClass);
						expect(instance1).toHaveOwnPropertyNames(['x']);
						expect(instance1.x).toBe(3);

						const instance2 = new Klass();
						expect(instance2).toBeInstanceOf(Klass);
						expect(instance2).toBeInstanceOf(SuperClass);
						expect(instance2).toHaveOwnPropertyNames(['x']);
						expect(instance2.x).toBe(1);
					}
				});

				itSerializes('top level', {
					in() {
						class X {
							constructor(x) {
								this.x = x;
							}
						}
						return class Y extends X {
							constructor() {
								super(1);
								return this; // eslint-disable-line no-constructor-return
								super(); // eslint-disable-line no-unreachable
								super();
							}
						};
					},
					out: `(()=>{
						const a=Object.setPrototypeOf,
							b=class X{
								constructor(a){
									this.x=a
								}
							},
							c=(b=>b=class Y{
								constructor(){
									const a=Reflect.construct(Object.getPrototypeOf(b),[1],b);
									return a;
									a=Reflect.construct(Object.getPrototypeOf(b),[],b);
									return a=Reflect.construct(Object.getPrototypeOf(b),[],b)
								}
							})();
						a(c,b);
						a(c.prototype,b.prototype);
						return c
					})()`,
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('Y');
						const {prototype} = Klass;
						expect(prototype).toBeObject();
						expect(prototype.constructor).toBe(Klass);
						const proto = Object.getPrototypeOf(prototype);
						expect(proto).toBeObject();
						expect(proto).not.toBe(Object.prototype);
						expect(proto).toHavePrototype(Object.prototype);
						const SuperClass = proto.constructor;
						expect(SuperClass).toBeFunction();
						expect(SuperClass.name).toBe('X');

						const instance = new Klass();
						expect(instance).toBeInstanceOf(Klass);
						expect(instance).toBeInstanceOf(SuperClass);
						expect(instance).toHaveOwnPropertyNames(['x']);
						expect(instance.x).toBe(1);
					}
				});

				itSerializes('top level after nested', {
					in() {
						class X {
							constructor(x) {
								this.x = x;
							}
						}
						return class Y extends X {
							constructor(x) {
								if (x) {
									super(x);
									return this; // eslint-disable-line no-constructor-return
								}
								super(1);
								x = 2;
							}
						};
					},
					out: `(()=>{
						const a=Object.setPrototypeOf,
							b=class X{
								constructor(a){
									this.x=a
								}
							},
							c=(c=>c=class Y{
								constructor(a){
									let b;
									if(a){
										b=Reflect.construct(Object.getPrototypeOf(c),[a],c);
										return b
									}
									b=Reflect.construct(Object.getPrototypeOf(c),[1],c);
									a=2;
									return b
								}
							})();
						a(c,b);
						a(c.prototype,b.prototype);
						return c
					})()`,
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('Y');
						const {prototype} = Klass;
						expect(prototype).toBeObject();
						expect(prototype.constructor).toBe(Klass);
						const proto = Object.getPrototypeOf(prototype);
						expect(proto).toBeObject();
						expect(proto).not.toBe(Object.prototype);
						expect(proto).toHavePrototype(Object.prototype);
						const SuperClass = proto.constructor;
						expect(SuperClass).toBeFunction();
						expect(SuperClass.name).toBe('X');

						const instance1 = new Klass(3);
						expect(instance1).toBeInstanceOf(Klass);
						expect(instance1).toBeInstanceOf(SuperClass);
						expect(instance1).toHaveOwnPropertyNames(['x']);
						expect(instance1.x).toBe(3);

						const instance2 = new Klass();
						expect(instance2).toBeInstanceOf(Klass);
						expect(instance2).toBeInstanceOf(SuperClass);
						expect(instance2).toHaveOwnPropertyNames(['x']);
						expect(instance2.x).toBe(1);
					}
				});
			});
		});

		describe('with prototype method', () => {
			itSerializes('without `super`', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
					}
					return class Y extends X {
						foo() {
							this.y = 2;
						}
					};
				},
				out: `(()=>{
					const a=Object,
						b=a.setPrototypeOf,
						c=class X{
							constructor(){
								this.x=1
							}
						},
						d=(b=>b=class Y{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					b(d,c);
					b(
						a.defineProperties(
							d.prototype,
							{
								foo:{
									value:{
										foo(){
											this.y=2
										}
									}.foo,
									writable:true,configurable:true
								}
							}
						),
						c.prototype
					);
					return d
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					expect(prototype.foo).toBeFunction();
					expect(prototype.foo.name).toBe('foo');
					expect(prototype.foo.prototype).toBeUndefined();
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
					instance.foo();
					expect(instance).toHaveOwnPropertyNames(['x', 'y']);
					expect(instance.y).toBe(2);
				}
			});

			itSerializes('with `super.prop()` with no params', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
						foo() {
							this.y = 2;
						}
					}
					return class Y extends X {
						foo() {
							super.foo();
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								foo(){
									Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this).call(this)
								}
							}.foo
						])(),
						b=Object,
						c=b.setPrototypeOf,
						d=class X{
							constructor(){this.x=1}
						},
						e=d.prototype,
						f=b.defineProperties,
						g=a[0];
					f(
						e,
						{
							foo:{
								value:{foo(){this.y=2}}.foo,
								writable:true,
								configurable:true
							}
						}
					);
					c(g,d);
					c(
						f(
							g.prototype,
							{
								foo:{value:a[1],writable:true,configurable:true}
							}
						),
						e
					);
					return g
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					expect(prototype.foo).toBeFunction();
					expect(prototype.foo.name).toBe('foo');
					expect(prototype.foo.prototype).toBeUndefined();
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
					instance.foo();
					expect(instance).toHaveOwnPropertyNames(['x', 'y']);
					expect(instance.y).toBe(2);
				}
			});

			itSerializes('with `super.prop()` with params', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
						foo(p, q) {
							this.y = p + q;
						}
					}
					return class Y extends X {
						foo(m, n) {
							super.foo(m, n);
						}
					};
				},
				out: `(()=>{
					const a=(c=>[
							c=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(c),a,c)
								}
							},
							{
								foo(a,b){
									Reflect.get(Object.getPrototypeOf(c.prototype),"foo",this).call(this,a,b)
								}
							}.foo
						])(),
						b=Object,
						c=b.setPrototypeOf,
						d=class X{
							constructor(){this.x=1}
						},
						e=d.prototype,
						f=b.defineProperties,
						g=a[0];
					f(
						e,
						{
							foo:{
								value:{foo(a,b){this.y=a+b}}.foo,
								writable:true,
								configurable:true
							}
						}
					);
					c(g,d);
					c(
						f(
							g.prototype,
							{
								foo:{value:a[1],writable:true,configurable:true}
							}
						),
						e
					);
					return g
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					expect(prototype.foo).toBeFunction();
					expect(prototype.foo.name).toBe('foo');
					expect(prototype.foo.prototype).toBeUndefined();
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
					instance.foo(2, 3);
					expect(instance).toHaveOwnPropertyNames(['x', 'y']);
					expect(instance.y).toBe(5);
				}
			});

			itSerializes('with `super.prop` (not `super.prop()`)', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
						foo() { // eslint-disable-line class-methods-use-this
							return 2;
						}
					}
					return class Y extends X {
						foo() {
							return super.foo;
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								foo(){
									return Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this)
								}
							}.foo
						])(),
						b=Object,
						c=b.setPrototypeOf,
						d=class X{
							constructor(){this.x=1}
						},
						e=d.prototype,
						f=b.defineProperties,
						g=a[0];
					f(
						e,
						{
							foo:{
								value:{foo(){return 2}}.foo,
								writable:true,
								configurable:true
							}
						}
					);
					c(g,d);
					c(
						f(
							g.prototype,
							{
								foo:{value:a[1],writable:true,configurable:true}
							}
						),
						e
					);
					return g
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					expect(prototype.foo).toBeFunction();
					expect(prototype.foo.name).toBe('foo');
					expect(prototype.foo.prototype).toBeUndefined();
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
					const res = instance.foo();
					expect(res).toBe(proto.foo);
					expect(res()).toBe(2);
				}
			});

			itSerializes('assigning to property of `super`)', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
					}
					return class Y extends X {
						foo() {
							super.y = 2;
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								foo(){
									Reflect.set(Object.getPrototypeOf(b.prototype),"y",2,this)
								}
							}.foo
						])(),
						b=Object,
						c=b.setPrototypeOf,
						d=class X{
							constructor(){this.x=1}
						},
						e=a[0];
					c(e,d);
					c(
						b.defineProperties(
							e.prototype,
							{
								foo:{value:a[1],writable:true,configurable:true}
							}
						),
						d.prototype
					);
					return e
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					expect(prototype.foo).toBeFunction();
					expect(prototype.foo.name).toBe('foo');
					expect(prototype.foo.prototype).toBeUndefined();
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
					instance.foo();
					expect(instance).toHaveOwnPropertyNames(['x', 'y']);
					expect(instance.y).toBe(2);
				}
			});

			itSerializes('with getter and setter', {
				in() {
					class X {
						get foo() { // eslint-disable-line class-methods-use-this
							return 1;
						}
						set foo(v) {
							this.x = v * 3;
						}
					}
					return class Y extends X {
						get foo() {
							return super.foo * 2;
						}
						set foo(v) {
							super.foo = v * 5;
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								"get foo"(){
									return Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this)*2
								}
							}["get foo"],
							{
								"set foo"(a){
									Reflect.set(Object.getPrototypeOf(b.prototype),"foo",a*5,this)
								}
							}["set foo"]
						])(),
						b=Object,
						c=b.setPrototypeOf,
						d=class X{},
						e=d.prototype,
						f=b.defineProperties,
						g=a[0];
					f(
						e,
						{
							foo:{
								get:{"get foo"(){return 1}}["get foo"],
								set:{"set foo"(a){this.x=a*3}}["set foo"],
								configurable:true
							}
						}
					);
					c(g,d);
					c(
						f(
							g.prototype,
							{
								foo:{get:a[1],set:a[2],configurable:true}
							}
						),
						e
					);
					return g
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const descriptor = Object.getOwnPropertyDescriptor(prototype, 'foo');
					expect(descriptor.get).toBeFunction();
					expect(descriptor.get.prototype).toBeUndefined();
					expect(descriptor.set).toBeFunction();
					expect(descriptor.set.prototype).toBeUndefined();

					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');

					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames([]);

					expect(instance.foo).toBe(2);
					instance.foo = 1;
					expect(instance).toHaveOwnProperty('x');
					expect(instance.x).toBe(15);
				}
			});
		});

		describe('with static method', () => {
			itSerializes('without `super`', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
					}
					return class Y extends X {
						static bar() {
							this.y = 2;
						}
					};
				},
				out: `(()=>{
					const a=Object,
						b=a.setPrototypeOf,
						c=class X{
							constructor(){
								this.x=1
							}
						},
						d=(b=>b=class Y{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					b(
						a.defineProperties(
							d,
							{
								bar:{
									value:{
										bar(){
											this.y=2
										}
									}.bar,
									writable:true,configurable:true
								}
							}
						),
						c
					);
					b(d.prototype,c.prototype);
					return d
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					expect(Klass.bar).toBeFunction();
					expect(Klass.bar.prototype).toBeUndefined();
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');

					Klass.bar();
					expect(Klass).toHaveOwnProperty('y');
					expect(Klass.y).toBe(2);

					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
				}
			});

			itSerializes('with `super.prop()` with no params', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
						static bar() {
							this.y = 2;
						}
					}
					return class Y extends X {
						static bar() {
							super.bar();
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								bar(){
									Reflect.get(Object.getPrototypeOf(b),"bar",this).call(this)
								}
							}.bar
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class X{
								constructor(){this.x=1}
							},
							{
								bar:{
									value:{bar(){this.y=2}}.bar,
									writable:true,
									configurable:true
								}
						}),
						f=a[0];
					d(
						c(
							f,
							{
								bar:{value:a[1],writable:true,configurable:true}
							}
						),
						e
					);
					d(f.prototype,e.prototype);
					return f
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					expect(Klass.bar).toBeFunction();
					expect(Klass.bar.prototype).toBeUndefined();
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');

					Klass.bar();
					expect(Klass).toHaveOwnProperty('y');
					expect(Klass.y).toBe(2);

					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
				}
			});

			itSerializes('with `super.prop()` with params', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
						static bar(p, q) {
							this.y = p + q;
						}
					}
					return class Y extends X {
						static bar(m, n) {
							super.bar(m, n);
						}
					};
				},
				out: `(()=>{
					const a=(c=>[
							c=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(c),a,c)
								}
							},
							{
								bar(a,b){
									Reflect.get(Object.getPrototypeOf(c),"bar",this).call(this,a,b)
								}
							}.bar
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class X{
								constructor(){this.x=1}
							},
							{
								bar:{
									value:{bar(a,b){this.y=a+b}}.bar,
									writable:true,
									configurable:true
								}
							}
						),
						f=a[0];
					d(
						c(
							f,
							{
								bar:{value:a[1],writable:true,configurable:true}
							}
						),
						e
					);
					d(f.prototype,e.prototype);
					return f
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					expect(Klass.bar).toBeFunction();
					expect(Klass.bar.prototype).toBeUndefined();
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');

					Klass.bar(2, 3);
					expect(Klass).toHaveOwnProperty('y');
					expect(Klass.y).toBe(5);

					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
				}
			});

			itSerializes('with `super.prop` (not `super.prop()`)', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
						static bar() {
							return 2;
						}
					}
					return class Y extends X {
						static bar() {
							return super.bar;
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								bar(){
									return Reflect.get(Object.getPrototypeOf(b),"bar",this)
								}
							}.bar
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class X{
								constructor(){this.x=1}
							},
							{
								bar:{
									value:{bar(){return 2}}.bar,
									writable:true,
									configurable:true
								}
							}
						),
						f=a[0];
					d(
						c(
							f,
							{
								bar:{value:a[1],writable:true,configurable:true}
							}
						),
						e
					);
					d(f.prototype,e.prototype);
					return f
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					expect(Klass.bar).toBeFunction();
					expect(Klass.bar.prototype).toBeUndefined();
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');

					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);

					const res = Klass.bar();
					expect(res).toBe(SuperClass.bar);
					expect(res()).toBe(2);
				}
			});

			itSerializes('assigning to property of `super`)', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
					}
					return class Y extends X {
						static bar() {
							super.y = 2;
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								bar(){
									Reflect.set(Object.getPrototypeOf(b),"y",2,this)
								}
							}.bar
						])(),
						b=Object,
						c=b.setPrototypeOf,
						d=class X{
							constructor(){this.x=1}
						},
						e=a[0];
					c(
						b.defineProperties(
							e,
							{
								bar:{value:a[1],writable:true,configurable:true}
							}
						),
						d
					);
					c(e.prototype,d.prototype);
					return e
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					expect(Klass.bar).toBeFunction();
					expect(Klass.bar.prototype).toBeUndefined();
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');

					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);

					Klass.bar();
					expect(Klass).toHaveOwnProperty('y');
					expect(Klass.y).toBe(2);
				}
			});

			itSerializes('with getter and setter', {
				in() {
					class X {
						static get bar() {
							return 1;
						}
						static set bar(v) {
							this.y = v * 3;
						}
					}
					return class Y extends X {
						static get bar() {
							return super.bar * 2;
						}
						static set bar(v) {
							super.bar = v * 5;
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								"get bar"(){
									return Reflect.get(Object.getPrototypeOf(b),"bar",this)*2
								}
							}["get bar"],
							{
								"set bar"(a){
									Reflect.set(Object.getPrototypeOf(b),"bar",a*5,this)
								}
							}["set bar"]
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class X{},
							{
								bar:{
									get:{"get bar"(){return 1}}["get bar"],
									set:{"set bar"(a){this.y=a*3}}["set bar"],
									configurable:true
								}
							}
						),
						f=a[0];
					d(
						c(
							f,
							{
								bar:{get:a[1],set:a[2],configurable:true}
							}
						),
						e
					);
					d(f.prototype,e.prototype);
					return f
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const descriptor = Object.getOwnPropertyDescriptor(Klass, 'bar');
					expect(descriptor.get).toBeFunction();
					expect(descriptor.get.prototype).toBeUndefined();
					expect(descriptor.set).toBeFunction();
					expect(descriptor.set.prototype).toBeUndefined();

					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);

					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');

					expect(Klass.bar).toBe(2);
					Klass.bar = 1;
					expect(Klass).toHaveOwnProperty('y');
					expect(Klass.y).toBe(15);
				}
			});
		});

		describe('another class defined inline', () => {
			itSerializes('without constructor', {
				in() {
					return class Y extends class X {} {};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{},
						c=(b=>b=class Y{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
				}
			});

			itSerializes('with constructor', {
				in() {
					return class Y extends class X {} {
						constructor() {
							super();
							this.x = 1;
						}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{},
						c=(b=>b=class Y{
							constructor(){
								const a=Reflect.construct(Object.getPrototypeOf(b),[],b);
								a.x=1;
								return a
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const {prototype} = Klass;
					expect(prototype).toBeObject();
					expect(prototype.constructor).toBe(Klass);
					const proto = Object.getPrototypeOf(prototype);
					expect(proto).toBeObject();
					expect(proto).not.toBe(Object.prototype);
					expect(proto).toHavePrototype(Object.prototype);
					const SuperClass = proto.constructor;
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
					const instance = new Klass();
					expect(instance).toBeInstanceOf(Klass);
					expect(instance).toBeInstanceOf(SuperClass);
					expect(instance).toHaveOwnPropertyNames(['x']);
					expect(instance.x).toBe(1);
				}
			});
		});

		itSerializes("defined in another class method's computed key", {
			in() {
				let Klass;
				const ext = 1;
				class X { // eslint-disable-line no-unused-vars
					[ // eslint-disable-line class-methods-use-this, computed-property-spacing
					Klass = class extends Object {
						constructor() {
							super();
							this.ext = ext;
							this.superToString = super.toString;
						}

						foo() {
							return [ext, super.toString];
						}
					}
					]() {
						const ext = 2; // eslint-disable-line no-unused-vars, no-shadow
					}
				}
				return Klass;
			},
			out: `(()=>{
				const a=(c=>b=>[
						b=class Klass{
							constructor(){
								const a=Reflect.construct(Object.getPrototypeOf(b),[],b);
								a.ext=c;
								a.superToString=Reflect.get(Object.getPrototypeOf(b.prototype),"toString",a);
								return a
							}
						},
						{
							foo(){
								return[c,Reflect.get(Object.getPrototypeOf(b.prototype),"toString",this)]
							}
						}.foo
					])(1)(),
					b=Object,
					c=a[0];
				b.setPrototypeOf(c,b);
				b.defineProperties(
					c.prototype,
					{foo:{value:a[1],writable:true,configurable:true}}
				);
				return c
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('Klass');
				const instance = new Klass();
				expect(instance.ext).toBe(1);
				expect(instance.superToString).toBe(Object.prototype.toString);
				const [ext, superToString] = instance.foo();
				expect(ext).toBe(1);
				expect(superToString).toBe(Object.prototype.toString);
			}
		});

		// https://github.com/overlookmotel/livepack/issues/294
		describe('two classes using super in same scope do not have super classes confused', () => {
			itSerializes('in implicit constructor', {
				in() {
					class SuperKlass1 {
						constructor() {
							this.x = 1;
						}
					}

					class SuperKlass2 {
						constructor() {
							this.x = 2;
						}
					}

					return {
						Klass1: class extends SuperKlass1 {},
						Klass2: class extends SuperKlass2 {}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class SuperKlass1{
							constructor(){this.x=1}
						},
						c=(b=>b=class Klass1{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})(),
						d=class SuperKlass2{
							constructor(){this.x=2}
						},
						e=(b=>b=class Klass2{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(e,d);
					a(c.prototype,b.prototype);
					a(e.prototype,d.prototype);
					return{Klass1:c,Klass2:e}
				})()`,
				validate({Klass1, Klass2}) {
					expect(Klass1).toBeFunction();
					const instance1 = new Klass1();
					expect(instance1.x).toBe(1);
					expect(Klass2).toBeFunction();
					const instance2 = new Klass2();
					expect(instance2.x).toBe(2);
				}
			});

			itSerializes('in explicit constructor', {
				in() {
					class SuperKlass1 {
						constructor() {
							this.x = 1;
						}
					}

					class SuperKlass2 {
						constructor() {
							this.x = 2;
						}
					}

					return {
						Klass1: class extends SuperKlass1 {
							constructor() {
								super();
								this.y = this.x;
							}
						},
						Klass2: class extends SuperKlass2 {
							constructor() {
								super();
								this.y = this.x;
							}
						}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class SuperKlass1{
							constructor(){this.x=1}
						},
						c=(b=>b=class Klass1{
							constructor(){
								const a=Reflect.construct(Object.getPrototypeOf(b),[],b);
								a.y=a.x;
								return a
							}
						})(),
						d=class SuperKlass2{
							constructor(){this.x=2}
						},
						e=(b=>b=class Klass2{
							constructor(){
								const a=Reflect.construct(Object.getPrototypeOf(b),[],b);
								a.y=a.x;
								return a
							}
						})();
					a(c,b);
					a(e,d);
					a(c.prototype,b.prototype);
					a(e.prototype,d.prototype);
					return{Klass1:c,Klass2:e}
				})()`,
				validate({Klass1, Klass2}) {
					expect(Klass1).toBeFunction();
					const instance1 = new Klass1();
					expect(instance1.x).toBe(1);
					expect(instance1.y).toBe(1);
					expect(Klass2).toBeFunction();
					const instance2 = new Klass2();
					expect(instance2.x).toBe(2);
					expect(instance2.y).toBe(2);
				}
			});

			itSerializes('in prototype method', {
				in() {
					class SuperKlass1 {
						foo() { return 1; } // eslint-disable-line class-methods-use-this
					}

					class SuperKlass2 {
						foo() { return 2; } // eslint-disable-line class-methods-use-this
					}

					return {
						Klass1: class extends SuperKlass1 {
							foo() { return super.foo(); }
						},
						Klass2: class extends SuperKlass2 {
							foo() { return super.foo(); }
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Klass1{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								foo(){
									return Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this).call(this)
								}
							}.foo
						])(),
						b=Object,
						c=b.setPrototypeOf,
						d=class SuperKlass1{},
						e=d.prototype,
						f=b.defineProperties,
						g=a[0],
						h=(b=>[
							b=class Klass2{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								foo(){
									return Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this).call(this)
								}
							}.foo
						])(),
						i=class SuperKlass2{},
						j=i.prototype,
						k=h[0];
					f(e,{
						foo:{
							value:{foo(){return 1}}.foo,
							writable:true,
							configurable:true
						}
					});
					c(g,d);
					f(j,{
						foo:{
							value:{foo(){return 2}}.foo,
							writable:true,
							configurable:true
						}
					});
					c(k,i);
					c(
						f(
							g.prototype,
							{
								foo:{value:a[1],writable:true,configurable:true}
							}
						),
						e
					);
					c(
						f(
							k.prototype,
							{
								foo:{value:h[1],writable:true,configurable:true}
							}
						),
						j
					);
					return{Klass1:g,Klass2:k}
				})()`,
				validate({Klass1, Klass2}) {
					expect(Klass1).toBeFunction();
					const instance1 = new Klass1();
					expect(instance1.foo()).toBe(1);
					expect(Klass2).toBeFunction();
					const instance2 = new Klass2();
					expect(instance2.foo()).toBe(2);
				}
			});

			itSerializes('in static method', {
				in() {
					class SuperKlass1 {
						static foo() { return 1; }
					}

					class SuperKlass2 {
						static foo() { return 2; }
					}

					return {
						Klass1: class extends SuperKlass1 {
							static foo() { return super.foo(); }
						},
						Klass2: class extends SuperKlass2 {
							static foo() { return super.foo(); }
						}
					};
				},
				out: `(()=>{
					const a=(b=>[
							b=class Klass1{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								foo(){
									return Reflect.get(Object.getPrototypeOf(b),"foo",this).call(this)
								}
							}.foo
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class SuperKlass1{},
							{
								foo:{
									value:{foo(){return 1}}.foo,
									writable:true,
									configurable:true
								}
							}
						),
						f=a[0],
						g=(b=>[
							b=class Klass2{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								foo(){
									return Reflect.get(Object.getPrototypeOf(b),"foo",this).call(this)
								}
							}.foo
						])(),
						h=c(
							class SuperKlass2{},
							{
								foo:{
									value:{foo(){return 2}}.foo,
									writable:true,
									configurable:true
								}
							}
						),
						i=g[0];
					d(
						c(
							f,
							{foo:{value:a[1],writable:true,configurable:true}}
						),
						e
					);
					d(
						c(
							i,
							{foo:{value:g[1],writable:true,configurable:true}}
						),
						h
					);
					d(f.prototype,e.prototype);
					d(i.prototype,h.prototype);
					return{Klass1:f,Klass2:i}
				})()`,
				validate({Klass1, Klass2}) {
					expect(Klass1).toBeFunction();
					expect(Klass1.foo()).toBe(1);
					expect(Klass2).toBeFunction();
					expect(Klass2.foo()).toBe(2);
				}
			});
		});

		itSerializes('var used in transpiled super not confused with var in surrounding scope', {
			in() {
				class X {
					constructor() {
						this.x = Y; // eslint-disable-line no-use-before-define
					}
					foo() {
						this.y = Y; // eslint-disable-line no-use-before-define
					}
					static bar() {
						this.y = Y; // eslint-disable-line no-use-before-define
					}
				}
				class Y extends X {
					constructor() {
						super();
						this.z = Y;
					}
					foo() {
						super.foo();
						return Y;
					}
					static bar() {
						super.bar();
						return Y;
					}
				}
				const Klass = Y;
				Y = 1; // eslint-disable-line no-class-assign
				return Klass;
			},
			out: `(()=>{
				const a=(c=>[
						a=>c=a,
						b=>[
							b=class Y{
								constructor(){
									const a=Reflect.construct(Object.getPrototypeOf(b),[],b);
									a.z=c;
									return a
								}
							},
							{
								bar(){
									Reflect.get(Object.getPrototypeOf(b),"bar",this).call(this);
									return c
								}
							}.bar,
							{
								foo(){
									Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this).call(this);
									return c
								}
							}.foo
						]
					])(),
					b=a[1](),
					c=Object,
					d=c.defineProperties,
					e=c.setPrototypeOf,
					f=(a=>[
						class X{
							constructor(){this.x=a}
						},
						{
							bar(){this.y=a}
						}.bar,
						{
							foo(){this.y=a}
						}.foo
					])(1),
					g=d(
						f[0],
						{
							bar:{value:f[1],writable:true,configurable:true}
						}
					),
					h=g.prototype,
					i=b[0];
				a[0](i);
				d(
					h,
					{
						foo:{value:f[2],writable:true,configurable:true}
					}
				);
				e(
					d(
						i,
						{
							bar:{value:b[1],writable:true,configurable:true}
						}
					),
					g
				);
				e(
					d(
						i.prototype,
						{
							foo:{value:b[2],writable:true,configurable:true}
						}
					),
					h
				);
				return i
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.bar()).toBe(Klass);
				expect(Klass.y).toBe(1);
				const instance = new Klass();
				expect(instance.x).toBe(1);
				expect(instance.z).toBe(Klass);
				expect(instance.foo()).toEqual(Klass);
				expect(instance.y).toBe(1);
			}
		});

		describe('var used in transpiled super shadowed by local var with same name', () => {
			// NB These tests relate to correct functioning of instrumentation
			itSerializes('class declaration name', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
						foo() {
							this.y = 2;
						}
						static bar() {
							this.y = 3;
						}
					}
					class Y extends X {
						constructor() {
							const Y = 4; // eslint-disable-line no-shadow
							super();
							this.z = Y;
						}
						foo() {
							const Y = 5; // eslint-disable-line no-shadow
							super.foo();
							return Y;
						}
						static bar() {
							const Y = 6; // eslint-disable-line no-shadow
							super.bar();
							return Y;
						}
					}
					return Y;
				},
				out: `(()=>{
					const a=(c=>[
							c=class Y{
								constructor(){
									const a=4;
									const b=Reflect.construct(Object.getPrototypeOf(c),[],c);
									b.z=a;
									return b
								}
							},
							{
								bar(){
									const a=6;
									Reflect.get(Object.getPrototypeOf(c),"bar",this).call(this);
									return a
								}
							}.bar,
							{
								foo(){
									const a=5;
									Reflect.get(Object.getPrototypeOf(c.prototype),"foo",this).call(this);
									return a
								}
							}.foo
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class X{
								constructor(){this.x=1}
							},
							{
								bar:{value:{bar(){this.y=3}}.bar,writable:true,configurable:true}
							}
						),
						f=e.prototype,
						g=a[0];
					c(
						f,
						{
							foo:{value:{foo(){this.y=2}}.foo,writable:true,configurable:true}
						}
					);
					d(
						c(
							g,
							{bar:{value:a[1],writable:true,configurable:true}}
						),
						e
					);
					d(
						c(
							g.prototype,
							{foo:{value:a[2],writable:true,configurable:true}}
						),
						f
					);
					return g
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					expect(Klass.bar()).toBe(6);
					expect(Klass.y).toBe(3);
					const instance = new Klass();
					expect(instance.x).toBe(1);
					expect(instance.z).toBe(4);
					expect(instance.foo()).toBe(5);
					expect(instance.y).toBe(2);
				}
			});

			itSerializes('class expression name', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
						foo() {
							this.y = 2;
						}
						static bar() {
							this.y = 3;
						}
					}
					return class Y extends X {
						constructor() {
							const Y = 4; // eslint-disable-line no-shadow
							super();
							this.z = Y;
						}
						foo() {
							const Y = 5; // eslint-disable-line no-shadow
							super.foo();
							return Y;
						}
						static bar() {
							const Y = 6; // eslint-disable-line no-shadow
							super.bar();
							return Y;
						}
					};
				},
				out: `(()=>{
					const a=(c=>[
							c=class Y{
								constructor(){
									const a=4;
									const b=Reflect.construct(Object.getPrototypeOf(c),[],c);
									b.z=a;
									return b
								}
							},
							{
								bar(){
									const a=6;
									Reflect.get(Object.getPrototypeOf(c),"bar",this).call(this);
									return a
								}
							}.bar,
							{
								foo(){
									const a=5;
									Reflect.get(Object.getPrototypeOf(c.prototype),"foo",this).call(this);
									return a
								}
							}.foo
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class X{
								constructor(){this.x=1}
							},
							{
								bar:{value:{bar(){this.y=3}}.bar,writable:true,configurable:true}
							}
						),
						f=e.prototype,
						g=a[0];
					c(
						f,
						{
							foo:{value:{foo(){this.y=2}}.foo,writable:true,configurable:true}
						}
					);
					d(
						c(
							g,
							{bar:{value:a[1],writable:true,configurable:true}}
						),
						e
					);
					d(
						c(
							g.prototype,
							{foo:{value:a[2],writable:true,configurable:true}}
						),
						f
					);
					return g
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					expect(Klass.bar()).toBe(6);
					expect(Klass.y).toBe(3);
					const instance = new Klass();
					expect(instance.x).toBe(1);
					expect(instance.z).toBe(4);
					expect(instance.foo()).toBe(5);
					expect(instance.y).toBe(2);
				}
			});

			itSerializes('const var declaration', {
				in() {
					class X {
						constructor() {
							this.x = 1;
						}
						foo() {
							this.y = 2;
						}
						static bar() {
							this.y = 3;
						}
					}
					const Y = class extends X {
						constructor() {
							const Y = 4; // eslint-disable-line no-shadow
							super();
							this.z = Y;
						}
						foo() {
							const Y = 5; // eslint-disable-line no-shadow
							super.foo();
							return Y;
						}
						static bar() {
							const Y = 6; // eslint-disable-line no-shadow
							super.bar();
							return Y;
						}
					};
					return Y;
				},
				out: `(()=>{
					const a=(c=>[
							c=class Y{
								constructor(){
									const a=4;
									const b=Reflect.construct(Object.getPrototypeOf(c),[],c);
									b.z=a;
									return b
								}
							},
							{
								bar(){
									const a=6;
									Reflect.get(Object.getPrototypeOf(c),"bar",this).call(this);
									return a
								}
							}.bar,
							{
								foo(){
									const a=5;
									Reflect.get(Object.getPrototypeOf(c.prototype),"foo",this).call(this);
									return a
								}
							}.foo
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class X{
								constructor(){this.x=1}
							},
							{
								bar:{value:{bar(){this.y=3}}.bar,writable:true,configurable:true}
							}
						),
						f=e.prototype,
						g=a[0];
					c(
						f,
						{
							foo:{value:{foo(){this.y=2}}.foo,writable:true,configurable:true}
						}
					);
					d(
						c(
							g,
							{bar:{value:a[1],writable:true,configurable:true}}
						),
						e
					);
					d(
						c(
							g.prototype,
							{foo:{value:a[2],writable:true,configurable:true}}
						),
						f
					);
					return g
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					expect(Klass.bar()).toBe(6);
					expect(Klass.y).toBe(3);
					const instance = new Klass();
					expect(instance.x).toBe(1);
					expect(instance.z).toBe(4);
					expect(instance.foo()).toBe(5);
					expect(instance.y).toBe(2);
				}
			});
		});

		describe('class name preserved when gained implicitly', () => {
			// NB These tests relate to correct functioning of instrumentation
			itSerializes('with const definition', {
				// NB Shadow `C` var inside class ctor so instrumentation has to create temp var to access `C`
				in() {
					class S {}
					const C = class extends S {
						constructor() {
							const C = 1; // eslint-disable-line no-unused-vars, no-shadow
							super();
						}
					};
					return C;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class S{},
						c=(b=>b=class C{
							constructor(){
								const a=1;
								return Reflect.construct(Object.getPrototypeOf(b),[],b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
				}
			});

			itSerializes('with let definition', {
				in() {
					class S {}
					let x = 123, // eslint-disable-line no-unused-vars, prefer-const
						C = class extends S {}; // eslint-disable-line prefer-const
					return C;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class S{},
						c=(b=>b=class C{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
				}
			});

			itSerializes('with var definition', {
				in() {
					class S {}
					var x = 123, // eslint-disable-line no-unused-vars, no-var, vars-on-top
						C = class extends S {};
					return C;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class S{},
						c=(b=>b=class C{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
				}
			});

			itSerializes('with = assignment', {
				in() {
					class S {}
					let C;
					C = class extends S {}; // eslint-disable-line prefer-const
					return C;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class S{},
						c=(b=>b=class C{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
				}
			});

			itSerializes('with &&= assignment', {
				in() {
					class S {}
					let C = true;
					C &&= class extends S {};
					return C;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class S{},
						c=(b=>b=class C{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
				}
			});

			itSerializes('with ||= assignment', {
				in() {
					class S {}
					let C = false;
					C ||= class extends S {};
					return C;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class S{},
						c=(b=>b=class C{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
				}
			});

			itSerializes('with ??= assignment', {
				in() {
					class S {}
					let C = null;
					C ??= class extends S {};
					return C;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class S{},
						c=(b=>b=class C{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
				}
			});

			itSerializes('with = assignment pattern', {
				in() {
					class S {}
					let {
						C = class extends S {} // eslint-disable-line prefer-const
					} = {};
					return C;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class S{},
						c=(b=>b=class C{
							constructor(...a){
								return Reflect.construct(Object.getPrototypeOf(b),a,b)
							}
						})();
					a(c,b);
					a(c.prototype,b.prototype);
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
				}
			});
		});

		itSerializes('globals used in transpiled super do not clash with upper scope vars', {
			in() {
				class X {
					constructor() {
						this.x = 1;
					}
					foo() {
						this.y = 2;
					}
					static bar() {
						this.y = 3;
					}
				}
				function createClass(Object, Reflect) {
					return class Y extends X {
						constructor() {
							super();
							this.z = [Object, Reflect];
						}
						foo() {
							super.foo();
							return [Object, Reflect];
						}
						static bar() {
							super.bar();
							return [Object, Reflect];
						}
					};
				}
				return createClass(4, 5);
			},
			out: `(()=>{
				const a=((c,d)=>b=>[
						b=class Y{
							constructor(){
								const a=Reflect.construct(Object.getPrototypeOf(b),[],b);
								a.z=[c,d];
								return a
							}
						},
						{
							bar(){
								Reflect.get(Object.getPrototypeOf(b),"bar",this).call(this);
								return[c,d]
							}
						}.bar,
						{
							foo(){
								Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this).call(this);
								return[c,d]
							}
						}.foo
					])(4,5)(),
					b=Object,
					c=b.defineProperties,
					d=b.setPrototypeOf,
					e=c(
						class X{
							constructor(){this.x=1}
						},
						{
							bar:{value:{bar(){this.y=3}}.bar,writable:true,configurable:true}
						}
					),
					f=e.prototype,
					g=a[0];
				c(
					f,
					{
						foo:{
							value:{foo(){this.y=2}}.foo,
							writable:true,
							configurable:true
						}
					}
				);
				d(
					c(
						g,
						{
							bar:{value:a[1],writable:true,configurable:true}
						}
					),
					e
				);
				d(
					c(
						g.prototype,
						{
							foo:{value:a[2],writable:true,configurable:true}
						}
					),
					f
				);
				return g
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.bar()).toEqual([4, 5]);
				expect(Klass.y).toBe(3);
				const instance = new Klass();
				expect(instance.x).toBe(1);
				expect(instance.z).toEqual([4, 5]);
				expect(instance.foo()).toEqual([4, 5]);
				expect(instance.y).toBe(2);
			}
		});

		describe('transpiled super treats computed object property names correctly', () => {
			// These tests are primarily to ensure the instrumentation works correctly,
			// rather than the serialization.
			itSerializes('function call used as object prop key only called once', {
				in() {
					const fn = spy(() => 'Y');
					class X {}
					const obj = {
						[fn()]: class extends X {}
					};
					expect(fn).toHaveBeenCalledTimes(1);
					return obj;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{},
						c=(
							b=>b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							}
						)();
					a(c,b);
					a(c.prototype,b.prototype);
					return{Y:c}
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['Y']);
					const Klass = obj.Y;
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const SuperClass = Object.getPrototypeOf(Klass);
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
				}
			});

			itSerializes('object used as object prop key has `.toString()` only called once', {
				in() {
					const o = {};
					o.toString = spy(() => 'Y');
					class X {}
					const obj = {
						[o]: class extends X {}
					};
					expect(o.toString).toHaveBeenCalledTimes(1);
					return obj;
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{},
						c=(
							b=>b=class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							}
						)();
					a(c,b);
					a(c.prototype,b.prototype);
					return{Y:c}
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['Y']);
					const Klass = obj.Y;
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('Y');
					const SuperClass = Object.getPrototypeOf(Klass);
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
				}
			});

			itSerializes('undefined used as object prop key', {
				in() {
					class X {}
					return {
						[undefined]: class extends X {}
					};
				},
				out: `(()=>{
					const a=Object.setPrototypeOf,
						b=class X{},
						c=(
							b=>b=class undefined{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							}
						)();
					a(c,b);
					a(c.prototype,b.prototype);
					return{undefined:c}
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['undefined']);
					const Klass = obj.undefined;
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('undefined');
					const SuperClass = Object.getPrototypeOf(Klass);
					expect(SuperClass).toBeFunction();
					expect(SuperClass.name).toBe('X');
				}
			});
		});
	});

	describe('name maintained where', () => {
		itSerializes('unnamed class as object property', {
			in: () => ({a: (0, class {})}),
			out: '{a:(0,class{})}',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['a']);
				const Klass = obj.a;
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('');
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
				expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('named class as default export', {
			in() {
				return class X {};
			},
			format: 'esm',
			out: 'export default class X{}',
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('X');
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
				expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('unnamed class as default export', {
			in() {
				return class {};
			},
			format: 'esm',
			out: 'export default(0,class{})',
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('');
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
				expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('not valid JS identifier', {
			in: () => ({'0a': class {}}['0a']),
			out: 'Object.defineProperties(class{},{name:{value:"0a"}})',
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('0a');
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
				expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('reserved word', {
			in: () => ({export: class {}}.export),
			out: 'Object.defineProperties(class{},{name:{value:"export"}})',
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('export');
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
				expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('arguments', {
			in: () => ({arguments: class {}}.arguments),
			out: 'Object.defineProperties(class{},{name:{value:"arguments"}})',
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('arguments');
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
				expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('eval', {
			in: () => ({eval: class {}}.eval),
			out: 'Object.defineProperties(class{},{name:{value:"eval"}})',
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('eval');
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
				expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('not valid JS identifier with static method', {
			in: () => ({'0a': class {static foo() {}}}['0a']),
			out: `Object.defineProperties(
				class{},
				{
					name:{value:"0a"},
					foo:{value:{foo(){}}.foo,writable:true,configurable:true}
				}
			)`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('0a');
				expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'foo']);
				expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('name prop deleted', {
			// NB Livepack cannot detect that `name` was deleted in versions of Node
			// where anonymous classes have no `name` prop
			in() {
				class C {}
				delete C.name;
				return C;
			},
			out: '(()=>{const a=(0,class{});delete a.name;return a})()',
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('');
				expect(Klass).toHaveOwnPropertyNames(['length', 'prototype']);
			}
		});

		itSerializes('name prop deleted and redefined', {
			// NB Livepack cannot detect that `name` was deleted and redefined in versions of Node
			// where `name` prop is last
			in() {
				class C {}
				delete C.name;
				Object.defineProperty(C, 'name', {value: 'D', configurable: true});
				return C;
			},
			out: `(()=>{
				const a=class D{};
				delete a.name;
				Object.defineProperties(a,{name:{value:"D",configurable:true}});
				return a
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('D');
				expect(Klass).toHaveOwnPropertyNames(['length', 'prototype', 'name']);
				expect(Klass).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		describe('name prop descriptor changed', () => {
			describe('named class', () => {
				itSerializes('name prop descriptor `writable` changed', {
					in() {
						class C {}
						Object.defineProperty(C, 'name', {writable: true});
						return C;
					},
					out: 'Object.defineProperties(class C{},{name:{writable:true}})',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('C');
						expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
						expect(Klass).toHaveDescriptorModifiersFor('name', true, false, true);
					}
				});

				itSerializes('name prop descriptor `enumerable` changed', {
					in() {
						class C {}
						Object.defineProperty(C, 'name', {enumerable: true});
						return C;
					},
					out: 'Object.defineProperties(class C{},{name:{enumerable:true}})',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('C');
						expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
						expect(Klass).toHaveDescriptorModifiersFor('name', false, true, true);
					}
				});

				itSerializes('name prop descriptor `configurable` changed', {
					in() {
						class C {}
						Object.defineProperty(C, 'name', {configurable: false});
						return C;
					},
					out: 'Object.defineProperties(class C{},{name:{configurable:false}})',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('C');
						expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
						expect(Klass).toHaveDescriptorModifiersFor('name', false, false, false);
					}
				});
			});

			describe('unnamed class', () => {
				itSerializes('name prop descriptor `writable` changed', {
					in() {
						const C = (0, class {});
						Object.defineProperty(C, 'name', {writable: true});
						return C;
					},
					out: 'Object.defineProperties(class{},{name:{writable:true}})',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('');
						expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
						expect(Klass).toHaveDescriptorModifiersFor('name', true, false, true);
					}
				});

				itSerializes('name prop descriptor `enumerable` changed', {
					in() {
						const C = (0, class {});
						Object.defineProperty(C, 'name', {enumerable: true});
						return C;
					},
					out: 'Object.defineProperties(class{},{name:{enumerable:true}})',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('');
						expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
						expect(Klass).toHaveDescriptorModifiersFor('name', false, true, true);
					}
				});

				itSerializes('name prop descriptor `configurable` changed', {
					in() {
						const C = (0, class {});
						Object.defineProperty(C, 'name', {configurable: false});
						return C;
					},
					out: 'Object.defineProperties(class{},{name:{configurable:false}})',
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('');
						expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
						expect(Klass).toHaveDescriptorModifiersFor('name', false, false, false);
					}
				});

				itSerializes('name prop as getter+setter', {
					in() {
						const C = (0, class {});
						Object.defineProperty(C, 'name', {
							get() {
								return this._name || 'C';
							},
							set(newName) {
								this._name = newName;
							}
						});
						return C;
					},
					out: `Object.defineProperties(
						class{},
						{
							name:{
								get(){return this._name||"C"},
								set(a){this._name=a}
							}
						}
					)`,
					validate(Klass) {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('C');
						expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
						const descriptor = Object.getOwnPropertyDescriptor(Klass, 'name');
						expect(descriptor).toHaveOwnPropertyNames(['get', 'set', 'enumerable', 'configurable']);
						expect(descriptor.get).toBeFunction();
						expect(descriptor.set).toBeFunction();
						expect(Klass).toHaveDescriptorModifiersFor('name', undefined, false, true);
						Klass.name = 'D';
						expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', '_name']);
						expect(Klass._name).toBe('D');
						expect(Klass.name).toBe('D');
					}
				});
			});
		});
	});

	describe('directives retained', () => {
		/* eslint-disable lines-around-directive */
		describe('in constructor', () => {
			itSerializes('with 1 directive', {
				in: () => class {
					constructor() {
						'use fake';
						this.x = 1;
					}
				},
				out: 'class{constructor(){"use fake";this.x=1}}',
				validate(Klass) {
					expect(Klass).toBeFunction();
					const instance = new Klass();
					expect(instance.x).toBe(1);
				}
			});

			itSerializes('with multiple directives', {
				in: () => class {
					constructor() {
						'use fake';
						"use bogus"; // eslint-disable-line quotes
						'use phoney';
						this.x = 1;
					}
				},
				out: 'class{constructor(){"use fake";"use bogus";"use phoney";this.x=1}}',
				validate(Klass) {
					expect(Klass).toBeFunction();
					const instance = new Klass();
					expect(instance.x).toBe(1);
				}
			});
		});

		describe('in prototype method', () => {
			itSerializes('with 1 directive', {
				in: () => class {
					foo() { // eslint-disable-line class-methods-use-this
						'use fake';
						return 1;
					}
				},
				out: `(()=>{
					const a=(0,class{});
					Object.defineProperties(
						a.prototype,
						{
							foo:{
								value:{foo(){"use fake";return 1}}.foo,
								writable:true,
								configurable:true
							}
						}
					);
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					const instance = new Klass();
					expect(instance.foo).toBeFunction();
					expect(instance.foo()).toBe(1);
				}
			});

			itSerializes('with multiple directives', {
				in: () => class {
					foo() { // eslint-disable-line class-methods-use-this
						'use fake';
						"use bogus"; // eslint-disable-line quotes
						'use phoney';
						return 1;
					}
				},
				out: `(()=>{
					const a=(0,class{});
					Object.defineProperties(
						a.prototype,
						{
							foo:{
								value:{foo(){"use fake";"use bogus";"use phoney";return 1}}.foo,
								writable:true,
								configurable:true
							}
						}
					);
					return a
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					const instance = new Klass();
					expect(instance.foo).toBeFunction();
					expect(instance.foo()).toBe(1);
				}
			});
		});

		describe('in static method', () => {
			itSerializes('with 1 directive', {
				in: () => class {
					static foo() {
						'use fake';
						return 1;
					}
				},
				out: `Object.defineProperties(
					class{},
					{
						foo:{
							value:{foo(){"use fake";return 1}}.foo,
							writable:true,
							configurable:true
						}
					}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.foo).toBeFunction();
					expect(Klass.foo()).toBe(1);
				}
			});

			itSerializes('with multiple directives', {
				in: () => class {
					static foo() {
						'use fake';
						"use bogus"; // eslint-disable-line quotes
						'use phoney';
						return 1;
					}
				},
				out: `Object.defineProperties(
					class{},
					{
						foo:{
							value:{foo(){"use fake";"use bogus";"use phoney";return 1}}.foo,
							writable:true,
							configurable:true
						}
					}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.foo).toBeFunction();
					expect(Klass.foo()).toBe(1);
				}
			});
		});
		/* eslint-enable lines-around-directive */
	});

	describe('classes nested in functions left untouched', () => {
		describe('not extending another class', () => {
			itSerializes('empty', {
				in() {
					return () => class {};
				},
				out: '()=>class{}',
				validate(fn) {
					expect(fn).toBeFunction();
					const Klass = fn();
					expect(Klass).toBeFunction();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
					expect(Klass.prototype).toHaveOwnPropertyNames(['constructor']);
				}
			});

			itSerializes('with constructor and methods', {
				in() {
					return () => class {
						constructor(x) {
							this.x = x;
						}
						foo(y) {
							this.x = y;
						}
						static bar(z) {
							this.z = z;
						}
					};
				},
				out: '()=>class{constructor(a){this.x=a}foo(b){this.x=b}static bar(c){this.z=c}}',
				validate(fn) {
					expect(fn).toBeFunction();
					const Klass = fn();
					expect(Klass).toBeFunction();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'bar']);
					Klass.bar(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'bar', 'z']);
					expect(Klass.z).toBe(3);

					expect(Klass.prototype).toHaveOwnPropertyNames(['constructor', 'foo']);
					const instance = new Klass(1);
					expect(instance.x).toBe(1);
					instance.foo(2);
					expect(instance.x).toBe(2);
				}
			});
		});

		describe('extending another class', () => {
			itSerializes('empty', {
				in() {
					return X => class Y extends X {};
				},
				out: 'a=>class Y extends a{}',
				validate(fn) {
					expect(fn).toBeFunction();
					const SuperClass = class X {};
					const Klass = fn(SuperClass);
					expect(Klass).toBeFunction();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype']);
					expect(Klass.prototype).toHaveOwnPropertyNames(['constructor']);
					expect(Klass.name).toBe('Y');
					expect(Klass).toHavePrototype(SuperClass);
					expect(Klass.prototype).toHavePrototype(SuperClass.prototype);
				}
			});

			itSerializes('with constructor and methods', {
				in() {
					return X => class extends X {
						constructor(x) {
							super(x * 2);
						}
						foo(y) {
							super.foo(y * 2);
						}
						static bar(z) {
							super.bar(z * 2);
						}
					};
				},
				out: `a=>class extends a{
					constructor(b){super(b*2)}
					foo(c){super.foo(c*2)}
					static bar(d){super.bar(d*2)}
				}`,
				validate(fn) {
					expect(fn).toBeFunction();
					const SuperClass = class X {
						constructor(x) {
							this.x = x;
						}
						foo(y) {
							this.x = y;
						}
						static bar(z) {
							this.z = z;
						}
					};
					const Klass = fn(SuperClass);
					expect(Klass).toBeFunction();
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'bar']);
					Klass.bar(3);
					expect(Klass).toHaveOwnPropertyNames(['length', 'name', 'prototype', 'bar', 'z']);
					expect(Klass.z).toBe(6);

					expect(Klass.prototype).toHaveOwnPropertyNames(['constructor', 'foo']);
					const instance = new Klass(1);
					expect(instance.x).toBe(2);
					instance.foo(2);
					expect(instance.x).toBe(4);

					expect(Klass).toHavePrototype(SuperClass);
					expect(Klass.prototype).toHavePrototype(SuperClass.prototype);
				}
			});
		});
	});

	// Test instrumentation correctly calculating trails in constructor or following computed method key
	describe('class methods containing nested functions', () => {
		itSerializes('class constructor', {
			in() {
				return class {
					constructor() {
						function f1() { return 1; }
						this.fns = [
							f1,
							function() { return 2; },
							() => 3
						];
					}
				};
			},
			out: `class{
				constructor(){
					function f1(){return 1}
					this.fns=[f1,function(){return 2},()=>3]
				}
			}`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				const {fns} = new Klass();
				fns.forEach(fn => expect(fn).toBeFunction());
				expect(fns[0]()).toBe(1);
				expect(fns[1]()).toBe(2);
				expect(fns[2]()).toBe(3);
			}
		});

		function expectMethodToReturnFunctions(meth) {
			expect(meth).toBeFunction();
			const fns = meth();
			fns.forEach(fn => expect(fn).toBeFunction());
			expect(fns[0]()).toBe(1);
			expect(fns[1]()).toBe(2);
			expect(fns[2]()).toBe(3);
		}

		describe('prototype method', () => {
			function validate(fn) {
				expect(fn).toBeFunction();
				const Klass = fn();
				expect(Klass).toBeFunction();
				expectMethodToReturnFunctions(Klass.prototype.x);
			}

			itSerializes('with literal key', {
				in() {
					return () => class {
						x() { // eslint-disable-line class-methods-use-this
							function f1() { return 1; }
							return [
								f1,
								function() { return 2; },
								() => 3
							];
						}
					};
				},
				out: `()=>class{
					x(){
						function f1(){return 1}
						return[f1,function(){return 2},()=>3]
					}
				}`,
				validate
			});

			itSerializes('with computed key', {
				in() {
					return () => class Klass {
						[(() => 'x')()]() { // eslint-disable-line class-methods-use-this
							function f1() { return 1; }
							return [
								f1,
								function() { return 2; },
								() => 3
							];
						}
					};
				},
				out: `()=>class Klass{
					[(()=>"x")()](){
						function f1(){return 1}
						return[f1,function(){return 2},()=>3]
					}
				}`,
				validate
			});
		});

		describe('static method', () => {
			function validate(fn) {
				expect(fn).toBeFunction();
				const Klass = fn();
				expect(Klass).toBeFunction();
				expectMethodToReturnFunctions(Klass.x);
			}

			itSerializes('with literal key', {
				in() {
					return () => class Klass {
						static x() {
							function f1() { return 1; }
							return [
								f1,
								function() { return 2; },
								() => 3
							];
						}
					};
				},
				out: `()=>class Klass{
					static x(){
						function f1(){return 1}
						return[f1,function(){return 2},()=>3]
					}
				}`,
				validate
			});

			itSerializes('with computed key', {
				in() {
					return () => class Klass {
						static [(() => 'x')()]() {
							function f1() { return 1; }
							return [
								f1,
								function() { return 2; },
								() => 3
							];
						}
					};
				},
				out: `()=>class Klass{
					static[(()=>"x")()](){
						function f1(){return 1}
						return[f1,function(){return 2},()=>3]
					}
				}`,
				validate
			});
		});
	});

	describe('instances', () => {
		itSerializes('of base class', {
			in() {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				return new X();
			},
			out: `(()=>{
				const a=Object;
				return a.assign(
					a.create(
						class X{constructor(){this.x=1}}.prototype
					),
					{x:1}
				)
			})()`,
			validate(instance) {
				expect(instance).toBeObject();
				expect(instance).toHaveOwnPropertyNames(['x']);
				expect(instance.x).toBe(1);

				const proto = Object.getPrototypeOf(instance);
				expect(proto).toBeObject();
				expect(proto).toHaveOwnProperty('constructor');
				const Klass = proto.constructor;
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('X');
				expect(Klass.prototype).toBe(proto);
				expect(instance).toBeInstanceOf(Klass);

				expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
			}
		});

		itSerializes('of subclass class', {
			in() {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				class Y extends X {
					constructor() {
						super();
						this.y = 2;
					}
				}
				return new Y();
			},
			out: `(()=>{
				const a=Object,
					b=a.setPrototypeOf,
					c=class X{
						constructor(){
							this.x=1
						}
					},
					d=(b=>b=class Y{
						constructor(){
							const a=Reflect.construct(Object.getPrototypeOf(b),[],b);
							a.y=2;
							return a
						}
					})(),
					e=d.prototype;
				b(d,c);
				b(e,c.prototype);
				return a.assign(a.create(e),{x:1,y:2})
			})()`,
			validate(instance) {
				expect(instance).toBeObject();
				expect(instance).toHaveOwnPropertyNames(['x', 'y']);
				expect(instance.x).toBe(1);
				expect(instance.y).toBe(2);

				const proto = Object.getPrototypeOf(instance);
				expect(proto).toBeObject();
				expect(proto).toHaveOwnProperty('constructor');
				const Klass = proto.constructor;
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('Y');
				expect(Klass.prototype).toBe(proto);
				expect(instance).toBeInstanceOf(Klass);

				const superProto = Object.getPrototypeOf(proto);
				expect(superProto).toBeObject();
				expect(superProto).toHaveOwnProperty('constructor');
				const SuperKlass = superProto.constructor;
				expect(SuperKlass).toBeFunction();
				expect(SuperKlass.name).toBe('X');
				expect(SuperKlass.prototype).toBe(superProto);
				expect(instance).toBeInstanceOf(SuperKlass);

				expect(Object.getPrototypeOf(superProto)).toBe(Object.prototype);
			}
		});
	});
});
