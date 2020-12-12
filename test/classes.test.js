/* --------------------
 * livepack module
 * Tests for Classes
 * ------------------*/

/* eslint-disable lines-between-class-members */

'use strict';

// Modules
const {itSerializes, spy} = require('./support/index.js');

// Tests

const anonClassHasNameProp = !!Object.getOwnPropertyDescriptor(class {}, 'name');

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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					expect(Klass.z).toBeFunction();
					expect(Klass.z.prototype).toBeUndefined();
					Klass.z(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					expect(Klass.z).toBeFunction();
					expect(Klass.z.prototype).toBeUndefined();
					Klass.z(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
					class{},
					{
						z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true},
						name:{value:"C",configurable:true}
					}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name']);
					expect(Klass.z).toBeFunction();
					expect(Klass.z.prototype).toBeUndefined();
					Klass.z(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name', 'x']);
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
					class{},
					{
						z:{value:(b=>({z(a){this.x=a+b}}).z)(10),writable:true,configurable:true},
						name:{value:"C",configurable:true}
					}
				)`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name']);
					expect(Klass.z).toBeFunction();
					expect(Klass.z.prototype).toBeUndefined();
					Klass.z(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name', 'x']);
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					Klass.z(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					Klass.z(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
							class{},
							{
								z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true},
								name:{value:"C",configurable:true}
							}
						);
					a(b.prototype,{y:{value:{y(a){this.x=a}}.y,writable:true,configurable:true}});
					return b
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name']);
					Klass.z(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name', 'x']);
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
							class{},
							{
								z:{value:a[0],writable:true,configurable:true},
								name:{value:"C",configurable:true}
							}
						);
					b(c.prototype,{y:{value:a[1],writable:true,configurable:true}});
					return c
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name']);
					Klass.z(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name', 'x']);
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					Klass.z();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					Klass.z();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
					const a=Object.defineProperties,
						b=a(
							class X{
								constructor(){this.x=X}
							},
							{
								z:{
									value:{z(){}}.z,
									writable:true,
									configurable:true
								}
							}
						);
					delete b.name;
					a(b,{name:{value:"X",configurable:true}});
					return b
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name']);
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					Klass.z();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					Klass.z();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
							class{constructor(a){this.x=a+b}},
							{z(a){this.x=a+b}}.z,
							{y(a){this.x=a+b}}.y
						]
					)(10),
					b=Object.defineProperties,
					c=b(
						a[0],
						{
							z:{value:a[1],writable:true,configurable:true},
							name:{value:"C",configurable:true}
						}
					);
				b(c.prototype,{y:{value:a[2],writable:true,configurable:true}});
				return c
			})()`,
			validate(Klass) {
				expect(Klass).toBeFunction();
				expect(Klass.name).toBe('C');
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name']);
				Klass.z(3);
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name', 'x']);
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
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'y', 'z']);
				expect(Klass.y).toBeFunction();
				expect(Klass.y.prototype).toBeUndefined();
				expect(Klass.z).toBeFunction();
				expect(Klass.z.prototype).toBeUndefined();
				Klass.y();
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'y', 'z', 'x']);
				expect(Klass.x).toBe(1);
				Klass.z();
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'y', 'z', 'x']);
				expect(Klass.x).toBe(2);
			}
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
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
				expect(Klass.z).toBeFunction();
				expect(Klass.z.prototype).toBeUndefined();
				expect(Klass.z()).toBeInstanceOf(Promise);
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
				expect(Klass.z).toBeFunction();
				expect(Klass.z.prototype).toBeObject();
				expect(Klass.z.prototype).toHaveOwnPropertyNames([]);
				const res = Klass.z();
				expect(Klass.x).toBeUndefined();
				expect(res).toBeObject();
				res.next();
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
				expect(Klass.z).toBeFunction();
				expect(Klass.z.prototype).toBeObject();
				expect(Klass.z.prototype).toHaveOwnPropertyNames([]);
				const res = Klass.z();
				expect(Klass.x).toBeUndefined();
				expect(res).toBeObject();
				expect(res.next()).toBeInstanceOf(Promise);
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
				const descriptor = Object.getOwnPropertyDescriptor(Klass, 'z');
				expect(descriptor.get).toBeFunction();
				expect(descriptor.get.prototype).toBeUndefined();
				expect(descriptor.set).toBeFunction();
				expect(descriptor.set.prototype).toBeUndefined();
				Klass.z = 3;
				expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
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
							b=>[
								a=>b=a,
								class{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(b),a,b)
									}
								}
							]
						)(),
						d=a(c[1],b);
					c[0](d);
					a(d.prototype,b.prototype);
					return d
				})()`,
				validate(Klass) {
					expect(Klass).toBeFunction();
					if (anonClassHasNameProp) {
						expect(Klass.name).toBe('');
					} else {
						expect(Object.getOwnPropertyNames(Klass)).not.toContain('name');
					}
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
						c=a(
							class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
								}
							},
							b
						);
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
						c=a(
							class Y{
								constructor(){
									return Reflect.construct(Object.getPrototypeOf(Y),[],Y)
								}
							},
							b
						);
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
							return super(); // eslint-disable-line constructor-super
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
						c=a(
							class Y{
								constructor(){
									return Reflect.construct(Object.getPrototypeOf(Y),[],Y)
								}
							},
							b
						);
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
						c=a(
							class Y{
								constructor(a,b){
									return Reflect.construct(Object.getPrototypeOf(Y),[a,b,100],Y)
								}
							},
							b
						);
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
						c=a(
							class Y{
								constructor(){
									const a=1;
									return Reflect.construct(Object.getPrototypeOf(Y),[a],Y)
								}
							},
							b
						);
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
						c=a(
							class Y{
								constructor(){
									const a=Reflect.construct(Object.getPrototypeOf(Y),[],Y);
									a.y=2;
									return a
								}
							},
							b
						);
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
						c=a(
							class Y{
								constructor(){
									const a=1;
									const b=Reflect.construct(Object.getPrototypeOf(Y),[a],Y);
									b.y=2;
									return b
								}
							},
							b
						);
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

			itSerializes('multiple super() calls', {
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
						c=a(
							class Y{
								constructor(a){
									let b;
									if(a){
										b=Reflect.construct(Object.getPrototypeOf(Y),[a],Y)
									}else{
										b=Reflect.construct(Object.getPrototypeOf(Y),[1],Y)
									}
									return b
								}
							},
							b
						);
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
						d=b(
							class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
								}
							},
							c
						);
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
					const a=Object,
						b=a.setPrototypeOf,
						c=class X{
							constructor(){
								this.x=1
							}
						},
						d=c.prototype,
						e=a.defineProperties,
						f=b(
							class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
								}
							},
							c
						),
						g=(
							a=>[
								b=>a=b,
								{
									foo(){
										Reflect.get(Object.getPrototypeOf(a.prototype),"foo",this).call(this)
									}
								}.foo
							]
						)();
					e(d,{
						foo:{
							value:{
								foo(){
									this.y=2
								}
							}.foo,
							writable:true,configurable:true
						}
					});
					g[0](f);
					b(
						e(
							f.prototype,
							{
								foo:{value:g[1],writable:true,configurable:true}
							}
						),
						d
					);
					return f
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
					const a=Object,
						b=a.setPrototypeOf,
						c=class X{
							constructor(){
								this.x=1
							}
						},
						d=c.prototype,
						e=a.defineProperties,
						f=b(
							class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
								}
							},
							c
						),
						g=(
							c=>[
								a=>c=a,
								{
									foo(a,b){
										Reflect.get(Object.getPrototypeOf(c.prototype),"foo",this).call(this,a,b)
									}
								}.foo
							]
						)();
					e(d,{
						foo:{
							value:{
								foo(a,b){
									this.y=a+b
								}
							}.foo,
							writable:true,configurable:true
						}
					});
					g[0](f);
					b(
						e(
							f.prototype,
							{
								foo:{value:g[1],writable:true,configurable:true}
							}
						),
						d
					);
					return f
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
					const a=Object,
						b=a.setPrototypeOf,
						c=class X{
							constructor(){
								this.x=1
							}
						},
						d=c.prototype,
						e=a.defineProperties,
						f=b(
							class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
								}
							},
							c
						),
						g=(
							a=>[
								b=>a=b,
								{
									foo(){
										return Reflect.get(Object.getPrototypeOf(a.prototype),"foo",this)
									}
								}.foo
							]
						)();
					e(d,{
						foo:{
							value:{
								foo(){
									return 2
								}
							}.foo,
							writable:true,configurable:true
						}
					});
					g[0](f);
					b(
						e(
							f.prototype,
							{
								foo:{value:g[1],writable:true,configurable:true}
							}
						),
						d
					);
					return f
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
					const a=Object,
						b=a.setPrototypeOf,
						c=class X{
							constructor(){
								this.x=1
							}
						},
						d=b(
							class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
								}
							},
							c
						),
						e=(
							a=>[
								b=>a=b,
								{foo(){
									Reflect.set(Object.getPrototypeOf(a.prototype),"y",2,this)
								}}.foo
							]
						)();
					e[0](d);
					b(
						a.defineProperties(
							d.prototype,
							{
								foo:{value:e[1],writable:true,configurable:true}
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
					const a=Object,
						b=a.setPrototypeOf,
						c=class X{},
						d=c.prototype,
						e=a.defineProperties,
						f=b(
							class Y{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
								}
							},
							c
						),
						g=(
							b=>[
								a=>b=a,
								{"get foo"(){
									return Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this)*2
								}}["get foo"],
								{"set foo"(a){
									Reflect.set(Object.getPrototypeOf(b.prototype),"foo",a*5,this)
								}}["set foo"]
							]
						)();
					e(
						d,
						{
							foo:{
								get:{"get foo"(){return 1}}["get foo"],
								set:{"set foo"(a){this.x=a*3}}["set foo"],
								configurable:true
							}
						}
					);
					g[0](f);
					b(
						e(
							f.prototype,
							{
								foo:{
									get:g[1],
									set:g[2],
									configurable:true
								}
							}
						),
						d
					);
					return f
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
						b=a.defineProperties,
						c=a.setPrototypeOf,
						d=class X{
							constructor(){
								this.x=1
							}
						},
						e=c(
							b(
								class Y{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
									}
								},
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
							d
						);
					delete e.name;
					b(e,{name:{value:"Y",configurable:true}});
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
					const a=(
						a=>[
							b=>a=b,
							{
								bar(){
									Reflect.get(Object.getPrototypeOf(a),"bar",this).call(this)
								}
							}.bar
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class{
								constructor(){
									this.x=1
								}
							},
							{
								bar:{
									value:{
										bar(){this.y=2}
									}.bar,
									writable:true,configurable:true
								},
								name:{value:"X",configurable:true
							}
						}),
						f=d(
							c(
								class Y{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
									}
								},
								{
									bar:{value:a[1],writable:true,configurable:true}
								}
							),
							e
						);
					a[0](f);
					delete f.name;
					c(f,{name:{value:"Y",configurable:true}});
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
					const a=(
						c=>[
							a=>c=a,
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
							class{
								constructor(){
									this.x=1
								}
							},
							{
								bar:{
									value:{
										bar(a,b){this.y=a+b}
									}.bar,
									writable:true,configurable:true
								},
								name:{value:"X",configurable:true
							}
						}),
						f=d(
							c(
								class Y{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
									}
								},
								{
									bar:{value:a[1],writable:true,configurable:true}
								}
							),
							e
						);
					a[0](f);
					delete f.name;
					c(f,{name:{value:"Y",configurable:true}});
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
					const a=(
						a=>[
							b=>a=b,
							{
								bar(){
									return Reflect.get(Object.getPrototypeOf(a),"bar",this)
								}
							}.bar
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class{
								constructor(){
									this.x=1
								}
							},
							{
								bar:{
									value:{
										bar(){return 2}
									}.bar,
									writable:true,configurable:true
								},
								name:{value:"X",configurable:true
							}
						}),
						f=d(
							c(
								class Y{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
									}
								},
								{
									bar:{value:a[1],writable:true,configurable:true}
								}
							),
							e
						);
					a[0](f);
					delete f.name;
					c(f,{name:{value:"Y",configurable:true}});
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
					const a=(
							a=>[
								b=>a=b,
								{bar(){
									Reflect.set(Object.getPrototypeOf(a),"y",2,this)
								}}.bar
							]
						)(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=class X{
							constructor(){
								this.x=1
							}
						},
						f=d(
							c(
								class Y{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
									}
								},
								{
									bar:{
										value:a[1],
										writable:true,
										configurable:true
									}
								}
							),
							e
						);
					a[0](f);
					delete f.name;
					c(f,{name:{value:"Y",configurable:true}});
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
					const a=(
							b=>[
								a=>b=a,
								{"get bar"(){
									return Reflect.get(Object.getPrototypeOf(b),"bar",this)*2
								}}["get bar"],
								{"set bar"(a){
									Reflect.set(Object.getPrototypeOf(b),"bar",a*5,this)
								}}["set bar"]
							]
						)(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class{},
							{
								bar:{
									get:{"get bar"(){return 1}}["get bar"],
									set:{"set bar"(a){this.y=a*3}}["set bar"],
									configurable:true
								},
								name:{value:"X",configurable:true}
							}
						),
						f=d(
							c(
								class Y{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(Y),a,Y)
									}
								},
								{
									bar:{
										get:a[1],
										set:a[2],
										configurable:true
									}
								}
							),
							e
						);
					a[0](f);
					delete f.name;
					c(f,{name:{value:"Y",configurable:true}});
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
				const a=(
						(b,c,d)=>[
							a=>d=a,
							class Y{
								constructor(){
									const a=Reflect.construct(Object.getPrototypeOf(Y),[],Y);
									a.z=[b,c];
									return a
								}
							},
							{bar(){
								Reflect.get(Object.getPrototypeOf(d),"bar",this).call(this);
								return[b,c]
							}}.bar,
							{foo(){
								Reflect.get(Object.getPrototypeOf(d.prototype),"foo",this).call(this);
								return[b,c]
							}}.foo
						]
					)(4,5),
					b=Object,
					c=b.defineProperties,
					d=b.setPrototypeOf,
					e=c(
						class{
							constructor(){
								this.x=1
							}
						},
						{
							bar:{
								value:{bar(){this.y=3}}.bar,
								writable:true,
								configurable:true
							},
							name:{value:"X",configurable:true}
						}
					),
					f=e.prototype,
					g=d(
						c(
							a[1],
							{bar:{value:a[2],writable:true,configurable:true}}
						),
						e
					);
				a[0](g);
				c(f,{
					foo:{
						value:{foo(){this.y=2}}.foo,
						writable:true,
						configurable:true
					}
				});
				delete g.name;
				c(g,{
					name:{value:"Y",configurable:true}
				});
				d(
					c(
						g.prototype,
						{
							foo:{
								value:a[3],
								writable:true,
								configurable:true
							}
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
				expect(instance.x).toEqual(1);
				expect(instance.z).toEqual([4, 5]);
				expect(instance.foo()).toEqual([4, 5]);
				expect(instance.y).toEqual(2);
			}
		});

		describe('transpiled super treats computed object property names correctly', () => {
			// These tests are primarily to ensure the Babel plugin works correctly,
			// rather than the serialization.
			// Tests for the code at `lib/babel/visitor.js` line 684, where temp var type is 'key'.
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
							b=>[
								a=>b=a,
								class Y{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(b),a,b)
									}
								}
							]
						)(),
						d=a(c[1],b);
					c[0](d);
					a(d.prototype,b.prototype);
					return{Y:d}
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
							b=>[
								a=>b=a,
								class Y{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(b),a,b)
									}
								}
							]
						)(),
						d=a(c[1],b);
					c[0](d);
					a(d.prototype,b.prototype);
					return{Y:d}
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
							b=>[
								a=>b=a,
								class undefined{
									constructor(...a){
										return Reflect.construct(Object.getPrototypeOf(b),a,b)
									}
								}
							]
						)(),
						d=a(c[1],b);
					c[0](d);
					a(d.prototype,b.prototype);
					return{undefined:d}
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype']);
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'bar']);
					Klass.bar(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'bar', 'z']);
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
					expect(Klass).toHaveOwnPropertyNames(['length', 'prototype', 'name']);
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
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'bar']);
					Klass.bar(3);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'bar', 'z']);
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
					d=b(
						class Y{
							constructor(){
								const a=Reflect.construct(Object.getPrototypeOf(Y),[],Y);
								a.y=2;
								return a
							}
						},
						c
					).prototype;
				b(d,c.prototype);
				return a.assign(a.create(d),{x:1,y:2})
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

// In Node v12 >= 12.16.0, anonymous classes have a `name` property defined as ''.
// Work around this discrepancy by ignoring position of 'name' prop on these Node versions.
// Tests for correct JS output still ensure output is same on these Node versions.
function expectClassToHaveOwnPropertyNames(Klass, expectedPropNames) {
	if (anonClassHasNameProp) {
		const expectedIndex = expectedPropNames.indexOf('name');
		if (expectedIndex !== -1) {
			expectedPropNames = [...expectedPropNames];
			expectedPropNames.splice(expectedIndex, 1);
		}

		const index = Object.getOwnPropertyNames(Klass).indexOf('name');
		if (index !== -1) {
			expectedPropNames = [...expectedPropNames];
			expectedPropNames.splice(index, 0, 'name');
		}
	}

	expect(Klass).toHaveOwnPropertyNames(expectedPropNames);
}
