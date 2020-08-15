/* --------------------
 * livepack module
 * Tests for Classes
 * ------------------*/

/* eslint-disable lines-between-class-members */

'use strict';

// Modules
const {describeWithAllOptions, stripLineBreaks} = require('./support/index.js');

// Tests

const anonClassHasNameProp = !!Object.getOwnPropertyDescriptor(class {}, 'name');

describeWithAllOptions('Classes', ({run}) => {
	describe('empty class', () => {
		it('anonymous', () => {
			run(
				class {},
				'class{}',
				(Klass) => {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('');
				}
			);
		});

		it('named', () => {
			run(
				class C {},
				'class C{}',
				(Klass) => {
					expect(Klass).toBeFunction();
					expect(Klass.name).toBe('C');
				}
			);
		});
	});

	describe('with constructor only', () => {
		it('no external vars', () => {
			run(
				class {
					constructor(param) {
						this.x = param;
					}
				},
				'class{constructor(a){this.x=a}}',
				(Klass) => {
					expect(Klass).toBeFunction();
					const instance = new Klass(1);
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(1);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			);
		});

		it('with external vars', () => {
			const ext = 10;
			run(
				class {
					constructor(param) {
						this.x = param + ext;
					}
				},
				'(b=>class{constructor(a){this.x=a+b}})(10)',
				(Klass) => {
					expect(Klass).toBeFunction();
					const instance = new Klass(1);
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(11);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			);
		});
	});

	describe('with prototype method only', () => {
		it('no external vars', () => {
			run(
				class {
					y(param) {
						this.x = param;
					}
				},
				'(()=>{const a=(0,class{});Object.defineProperties(a.prototype,{y:{value:{y(a){this.x=a}}.y,writable:true,configurable:true}});return a})()',
				(Klass) => {
					expect(Klass).toBeFunction();
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys([]);
					instance.y(2);
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(2);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			);
		});

		it('with external vars', () => {
			const ext = 10;
			run(
				class {
					y(param) {
						this.x = param + ext;
					}
				},
				'(()=>{const a=(0,class{});Object.defineProperties(a.prototype,{y:{value:(b=>({y(a){this.x=a+b}}).y)(10),writable:true,configurable:true}});return a})()',
				(Klass) => {
					expect(Klass).toBeFunction();
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys([]);
					instance.y(2);
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(12);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			);
		});
	});

	describe('with static method only', () => {
		describe('anonymous', () => {
			it('no external vars', () => {
				run(
					class {
						static z(param) {
							this.x = param;
						}
					},
					'Object.defineProperties(class{},{z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true}})',
					(Klass) => {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('');
						expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
						Klass.z(3);
						expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
						expect(Klass.x).toBe(3);
						const instance = new Klass();
						expect(instance).toBeObject();
						expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
					}
				);
			});

			it('with external vars', () => {
				const ext = 10;
				run(
					class {
						static z(param) {
							this.x = param + ext;
						}
					},
					'Object.defineProperties(class{},{z:{value:(b=>({z(a){this.x=a+b}}).z)(10),writable:true,configurable:true}})',
					(Klass) => {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('');
						expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
						Klass.z(3);
						expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
						expect(Klass.x).toBe(13);
						const instance = new Klass();
						expect(instance).toBeObject();
						expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
					}
				);
			});
		});

		describe('named', () => {
			it('no external vars', () => {
				run(
					class C {
						static z(param) {
							this.x = param;
						}
					},
					'Object.defineProperties(class{},{z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true},name:{value:"C",configurable:true}})',
					(Klass) => {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('C');
						expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name']);
						Klass.z(3);
						expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name', 'x']);
						expect(Klass.x).toBe(3);
						const instance = new Klass();
						expect(instance).toBeObject();
						expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
					}
				);
			});

			it('with external vars', () => {
				const ext = 10;
				run(
					class C {
						static z(param) {
							this.x = param + ext;
						}
					},
					'Object.defineProperties(class{},{z:{value:(b=>({z(a){this.x=a+b}}).z)(10),writable:true,configurable:true},name:{value:"C",configurable:true}})',
					(Klass) => {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('C');
						expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name']);
						Klass.z(3);
						expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'name', 'x']);
						expect(Klass.x).toBe(13);
						const instance = new Klass();
						expect(instance).toBeObject();
						expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
					}
				);
			});
		});
	});

	describe('with prototype and static methods', () => {
		describe('anonymous', () => {
			it('no external vars', () => {
				run(
					class {
						y(param) {
							this.x = param;
						}
						static z(param) {
							this.x = param;
						}
					},
					'(()=>{const a=Object.defineProperties,b=a(class{},{z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true}});a(b.prototype,{y:{value:{y(a){this.x=a}}.y,writable:true,configurable:true}});return b})()',
					(Klass) => {
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
				);
			});

			it('with external vars', () => {
				const ext = 10;
				run(
					class {
						y(param) {
							this.x = param + ext;
						}
						static z(param) {
							this.x = param + ext;
						}
					},
					'(()=>{const a=(b=>[{z(a){this.x=a+b}}.z,{y(a){this.x=a+b}}.y])(10),b=Object.defineProperties,c=b(class{},{z:{value:a[0],writable:true,configurable:true}});b(c.prototype,{y:{value:a[1],writable:true,configurable:true}});return c})()',
					(Klass) => {
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
				);
			});
		});

		describe('named', () => {
			it('no external vars', () => {
				run(
					class C {
						y(param) {
							this.x = param;
						}
						static z(param) {
							this.x = param;
						}
					},
					'(()=>{const a=Object.defineProperties,b=a(class{},{z:{value:{z(a){this.x=a}}.z,writable:true,configurable:true},name:{value:"C",configurable:true}});a(b.prototype,{y:{value:{y(a){this.x=a}}.y,writable:true,configurable:true}});return b})()',
					(Klass) => {
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
				);
			});

			it('with external vars', () => {
				const ext = 10;
				run(
					class C {
						y(param) {
							this.x = param + ext;
						}
						static z(param) {
							this.x = param + ext;
						}
					},
					'(()=>{const a=(b=>[{z(a){this.x=a+b}}.z,{y(a){this.x=a+b}}.y])(10),b=Object.defineProperties,c=b(class{},{z:{value:a[0],writable:true,configurable:true},name:{value:"C",configurable:true}});b(c.prototype,{y:{value:a[1],writable:true,configurable:true}});return c})()',
					(Klass) => {
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
				);
			});
		});
	});

	describe('with constructor and', () => {
		describe('with prototype method only', () => {
			it('constructor first', () => {
				run(
					class {
						constructor() {
							this.x = 1;
						}
						y() {
							this.x = 2;
						}
					},
					'(()=>{const a=(0,class{constructor(){this.x=1}});Object.defineProperties(a.prototype,{y:{value:{y(){this.x=2}}.y,writable:true,configurable:true}});return a})()',
					(Klass) => {
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
				);
			});

			it('method first', () => {
				run(
					class {
						y() {
							this.x = 2;
						}
						constructor() {
							this.x = 1;
						}
					},
					'(()=>{const a=(0,class{constructor(){this.x=1}});Object.defineProperties(a.prototype,{y:{value:{y(){this.x=2}}.y,writable:true,configurable:true}});return a})()',
					(Klass) => {
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
				);
			});
		});

		describe('with static method only', () => {
			it('constructor first', () => {
				run(
					class {
						constructor() {
							this.x = 1;
						}
						static z() {
							this.x = 3;
						}
					},
					'Object.defineProperties(class{constructor(){this.x=1}},{z:{value:{z(){this.x=3}}.z,writable:true,configurable:true}})',
					(Klass) => {
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
				);
			});

			it('method first', () => {
				run(
					class {
						static z() {
							this.x = 3;
						}
						constructor() {
							this.x = 1;
						}
					},
					'Object.defineProperties(class{constructor(){this.x=1}},{z:{value:{z(){this.x=3}}.z,writable:true,configurable:true}})',
					(Klass) => {
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
				);
			});
		});

		describe('with prototype and static methods', () => {
			it('constructor first', () => {
				run(
					class {
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
					'(()=>{const a=Object.defineProperties,b=a(class{constructor(){this.x=1}},{z:{value:{z(){this.x=3}}.z,writable:true,configurable:true}});a(b.prototype,{y:{value:{y(){this.x=2}}.y,writable:true,configurable:true}});return b})()',
					(Klass) => {
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
				);
			});

			it('method first', () => {
				run(
					class {
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
					'(()=>{const a=Object.defineProperties,b=a(class{constructor(){this.x=1}},{z:{value:{z(){this.x=3}}.z,writable:true,configurable:true}});a(b.prototype,{y:{value:{y(){this.x=2}}.y,writable:true,configurable:true}});return b})()',
					(Klass) => {
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
				);
			});
		});

		it('with external vars', () => {
			const ext = 10;
			run(
				class C {
					constructor(param) {
						this.x = param + ext;
					}
					y(param) {
						this.x = param + ext;
					}
					static z(param) {
						this.x = param + ext;
					}
				},
				'(()=>{const a=(b=>[class{constructor(a){this.x=a+b}},{z(a){this.x=a+b}}.z,{y(a){this.x=a+b}}.y])(10),b=Object.defineProperties,c=b(a[0],{z:{value:a[1],writable:true,configurable:true},name:{value:"C",configurable:true}});b(c.prototype,{y:{value:a[2],writable:true,configurable:true}});return c})()',
				(Klass) => {
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
			);
		});
	});

	describe('with computed method keys', () => {
		it('prototype methods', () => {
			const yy = 'y';
			function getZ() { return 'z'; }
			run(
				class {
					[yy]() {
						this.x = 1;
					}
					[getZ()]() {
						this.x = 2;
					}
				},
				'(()=>{const a=(0,class{});Object.defineProperties(a.prototype,{y:{value:{y(){this.x=1}}.y,writable:true,configurable:true},z:{value:{z(){this.x=2}}.z,writable:true,configurable:true}});return a})()',
				(Klass) => {
					expect(Klass).toBeFunction();
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
			);
		});

		it('static method', () => {
			const yy = 'y';
			function getZ() { return 'z'; }
			run(
				class {
					static [yy]() {
						this.x = 1;
					}
					static [getZ()]() {
						this.x = 2;
					}
				},
				'Object.defineProperties(class{},{y:{value:{y(){this.x=1}}.y,writable:true,configurable:true},z:{value:{z(){this.x=2}}.z,writable:true,configurable:true}})',
				(Klass) => {
					expect(Klass).toBeFunction();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'y', 'z']);
					Klass.y();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'y', 'z', 'x']);
					expect(Klass.x).toBe(1);
					Klass.z();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'y', 'z', 'x']);
					expect(Klass.x).toBe(2);
				}
			);
		});
	});

	describe('async methods', () => {
		it('prototype', () => {
			run(
				class {
					async y() {
						this.x = 2;
					}
				},
				'(()=>{const a=(0,class{});Object.defineProperties(a.prototype,{y:{value:{async y(){this.x=2}}.y,writable:true,configurable:true}});return a})()',
				(Klass) => {
					expect(Klass).toBeFunction();
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(instance).toContainAllKeys([]);
					expect(instance.y()).toBeInstanceOf(Promise);
					expect(instance).toContainAllKeys(['x']);
					expect(instance.x).toBe(2);
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			);
		});

		it('static', () => {
			run(
				class {
					static async z() {
						this.x = 3;
					}
				},
				'Object.defineProperties(class{},{z:{value:{async z(){this.x=3}}.z,writable:true,configurable:true}})',
				(Klass) => {
					expect(Klass).toBeFunction();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					expect(Klass.z()).toBeInstanceOf(Promise);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
				}
			);
		});
	});

	describe('generator methods', () => {
		it('prototype', () => {
			run(
				class {
					*y() { // eslint-disable-line require-yield
						this.x = 2;
					}
				},
				'(()=>{const a=(0,class{});Object.defineProperties(a.prototype,{y:{value:{*y(){this.x=2}}.y,writable:true,configurable:true}});return a})()',
				(Klass) => {
					expect(Klass).toBeFunction();
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
			);
		});

		it('static', () => {
			run(
				class {
					static*z() { // eslint-disable-line require-yield
						this.x = 3;
					}
				},
				'Object.defineProperties(class{},{z:{value:{*z(){this.x=3}}.z,writable:true,configurable:true}})',
				(Klass) => {
					expect(Klass).toBeFunction();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					const res = Klass.z();
					expect(Klass.x).toBeUndefined();
					expect(res).toBeObject();
					res.next();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
				}
			);
		});
	});

	describe('async generator methods', () => {
		it('prototype', () => {
			run(
				class {
					async*y() { // eslint-disable-line require-yield
						this.x = 2;
					}
				},
				'(()=>{const a=(0,class{});Object.defineProperties(a.prototype,{y:{value:{async*y(){this.x=2}}.y,writable:true,configurable:true}});return a})()',
				(Klass) => {
					expect(Klass).toBeFunction();
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
			);
		});

		it('static', () => {
			run(
				class {
					static async*z() { // eslint-disable-line require-yield
						this.x = 3;
					}
				},
				'Object.defineProperties(class{},{z:{value:{async*z(){this.x=3}}.z,writable:true,configurable:true}})',
				(Klass) => {
					expect(Klass).toBeFunction();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					const res = Klass.z();
					expect(Klass.x).toBeUndefined();
					expect(res).toBeObject();
					expect(res.next()).toBeInstanceOf(Promise);
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
				}
			);
		});
	});

	describe('getter + setters', () => {
		it('prototype method', () => {
			run(
				class {
					get y() {
						return this.x;
					}
					set y(param) {
						this.x = param;
					}
				},
				'(()=>{const a=(0,class{});Object.defineProperties(a.prototype,{y:{get:{"get y"(){return this.x}}["get y"],set:{"set y"(a){this.x=a}}["set y"],configurable:true}});return a})()',
				(Klass) => {
					expect(Klass).toBeFunction();
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
			);
		});

		it('static method', () => {
			run(
				class {
					static get z() {
						return this.x;
					}
					static set z(param) {
						this.x = param;
					}
				},
				'Object.defineProperties(class{},{z:{get:{"get z"(){return this.x}}["get z"],set:{"set z"(a){this.x=a}}["set z"],configurable:true}})',
				(Klass) => {
					expect(Klass).toBeFunction();
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z']);
					Klass.z = 3;
					expectClassToHaveOwnPropertyNames(Klass, ['length', 'prototype', 'z', 'x']);
					expect(Klass.x).toBe(3);
					Klass.x = 2;
					expect(Klass.z).toBe(2);
					const instance = new Klass();
					expect(instance).toBeObject();
					expect(Object.getPrototypeOf(instance)).toBe(Klass.prototype);
				}
			);
		});
	});

	describe('extends', () => {
		describe('empty class', () => {
			it('anonymous', () => {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				const input = (0, class extends X {});
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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
				);
			});

			it('named', () => {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				const input = class Y extends X {};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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
				);
			});
		});

		describe('with constructor', () => {
			it('super() called with no params', () => {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				const input = class Y extends X {
					constructor() { // eslint-disable-line no-useless-constructor
						super();
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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
				);
			});

			it('result of super() returned', () => {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				const input = class Y extends X {
					constructor() {
						return super(); // eslint-disable-line constructor-super
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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
				);
			});

			it('super() called with params', () => {
				class X {
					constructor(x, y, z) {
						this.x = x + y + z;
					}
				}
				const input = class Y extends X {
					constructor(x, y) {
						super(x, y, 100);
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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
				);
			});

			it('statements before super()', () => {
				class X {
					constructor(x) {
						this.x = x + 10;
					}
				}
				const input = class Y extends X {
					constructor() {
						const x = 1;
						super(x);
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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
				);
			});

			it('statements after super()', () => {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				const input = class Y extends X {
					constructor() {
						super();
						this.y = 2;
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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
				);
			});

			it('statements before and after super()', () => {
				class X {
					constructor(x) {
						this.x = x + 10;
					}
				}
				const input = class Y extends X {
					constructor() {
						const x = 1;
						super(x);
						this.y = 2;
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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
				);
			});

			it('multiple super() calls', () => {
				class X {
					constructor(x) {
						this.x = x;
					}
				}
				const input = class Y extends X {
					constructor(x) {
						if (x) {
							super(x);
						} else {
							super(1);
						}
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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
				);
			});
		});

		describe('with prototype method', () => {
			it('without `super`', () => {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				const input = class Y extends X {
					foo() {
						this.y = 2;
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('Y');
						const {prototype} = Klass;
						expect(prototype).toBeObject();
						expect(prototype.constructor).toBe(Klass);
						expect(prototype.foo).toBeFunction();
						expect(prototype.foo.name).toBe('foo');
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
				);
			});

			it('with `super()` with no params', () => {
				class X {
					constructor() {
						this.x = 1;
					}
					foo() {
						this.y = 2;
					}
				}
				const input = class Y extends X {
					foo() {
						super.foo();
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('Y');
						const {prototype} = Klass;
						expect(prototype).toBeObject();
						expect(prototype.constructor).toBe(Klass);
						expect(prototype.foo).toBeFunction();
						expect(prototype.foo.name).toBe('foo');
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
				);
			});

			it('with `super()` with params', () => {
				class X {
					constructor() {
						this.x = 1;
					}
					foo(p, q) {
						this.y = p + q;
					}
				}
				const input = class Y extends X {
					foo(m, n) {
						super.foo(m, n);
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('Y');
						const {prototype} = Klass;
						expect(prototype).toBeObject();
						expect(prototype.constructor).toBe(Klass);
						expect(prototype.foo).toBeFunction();
						expect(prototype.foo.name).toBe('foo');
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
				);
			});

			it('with `super.prop` (not `super.prop()`)', () => {
				class X {
					constructor() {
						this.x = 1;
					}
					foo() { // eslint-disable-line class-methods-use-this
						return 2;
					}
				}
				const input = class Y extends X {
					foo() {
						return super.foo;
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('Y');
						const {prototype} = Klass;
						expect(prototype).toBeObject();
						expect(prototype.constructor).toBe(Klass);
						expect(prototype.foo).toBeFunction();
						expect(prototype.foo.name).toBe('foo');
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
				);
			});

			it('assigning to property of `super`)', () => {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				const input = class Y extends X {
					foo() {
						super.y = 2;
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
									foo:{value:{foo(){this.y=2}}.foo,writable:true,configurable:true}
								}
							),
							c.prototype
						);
						return d
					})()`),
					(Klass) => {
						expect(Klass).toBeFunction();
						expect(Klass.name).toBe('Y');
						const {prototype} = Klass;
						expect(prototype).toBeObject();
						expect(prototype.constructor).toBe(Klass);
						expect(prototype.foo).toBeFunction();
						expect(prototype.foo.name).toBe('foo');
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
				);
			});
		});

		describe('with static method', () => {
			it('without `super`', () => {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				const input = class Y extends X {
					static bar() {
						this.y = 2;
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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

						Klass.bar();
						expect(Klass).toHaveOwnProperty('y');
						expect(Klass.y).toBe(2);

						const instance = new Klass();
						expect(instance).toBeInstanceOf(Klass);
						expect(instance).toBeInstanceOf(SuperClass);
						expect(instance).toHaveOwnPropertyNames(['x']);
						expect(instance.x).toBe(1);
					}
				);
			});

			it('with `super()` with no params', () => {
				class X {
					constructor() {
						this.x = 1;
					}
					static bar() {
						this.y = 2;
					}
				}
				const input = class Y extends X {
					static bar() {
						super.bar();
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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

						Klass.bar();
						expect(Klass).toHaveOwnProperty('y');
						expect(Klass.y).toBe(2);

						const instance = new Klass();
						expect(instance).toBeInstanceOf(Klass);
						expect(instance).toBeInstanceOf(SuperClass);
						expect(instance).toHaveOwnPropertyNames(['x']);
						expect(instance.x).toBe(1);
					}
				);
			});

			it('with `super()` with params', () => {
				class X {
					constructor() {
						this.x = 1;
					}
					static bar(p, q) {
						this.y = p + q;
					}
				}
				const input = class Y extends X {
					static bar(m, n) {
						super.bar(m, n);
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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

						Klass.bar(2, 3);
						expect(Klass).toHaveOwnProperty('y');
						expect(Klass.y).toBe(5);

						const instance = new Klass();
						expect(instance).toBeInstanceOf(Klass);
						expect(instance).toBeInstanceOf(SuperClass);
						expect(instance).toHaveOwnPropertyNames(['x']);
						expect(instance.x).toBe(1);
					}
				);
			});

			it('with `super.prop` (not `super.prop()`)', () => {
				class X {
					constructor() {
						this.x = 1;
					}
					static bar() {
						return 2;
					}
				}
				const input = class Y extends X {
					static bar() {
						return super.bar;
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
					})()`),
					(Klass) => {
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

						const res = Klass.bar();
						expect(res).toBe(SuperClass.bar);
						expect(res()).toBe(2);
					}
				);
			});

			it('assigning to property of `super`)', () => {
				class X {
					constructor() {
						this.x = 1;
					}
				}
				const input = class Y extends X {
					static bar() {
						super.y = 2;
					}
				};
				run(
					input,
					stripLineBreaks(`(()=>{
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
												bar(){this.y=2}
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
					})()`),
					(Klass) => {
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

						Klass.bar();
						expect(Klass).toHaveOwnProperty('y');
						expect(Klass.y).toBe(2);
					}
				);
			});
		});
	});

	describe('instances', () => {
		it('of base class', () => {
			class X {
				constructor() {
					this.x = 1;
				}
			}
			run(
				new X(),
				'(()=>{const a=Object;return a.assign(a.create(class X{constructor(){this.x=1}}.prototype),{x:1})})()',
				(instance) => {
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
			);
		});

		it('of subclass class', () => {
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
			run(
				new Y(),
				stripLineBreaks(`(()=>{
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
					})()`),
				(instance) => {
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
			);
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
