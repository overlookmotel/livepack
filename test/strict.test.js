/* --------------------
 * livepack module
 * Tests for strict/sloppy mode functions
 * ------------------*/

/* eslint-disable strict, lines-around-directive */

// Imports
const {itSerializes, resetSplitPoints} = require('./support/index.js');

// Tests

// NB `delete Object.prototype` throws in strict mode, but returns false in sloppy mode

const itSerializesEntries = itSerializes.withOptions({entries: true});

describe('Strict mode', () => {
	describe('single function', () => {
		describe('strict mode function', () => {
			itSerializes('in strict env has directive removed', {
				in() {
					return () => {
						'use strict';
						return delete Object.prototype;
					};
				},
				strictEnv: true,
				out: '()=>delete Object.prototype',
				validate: expectToThrowStrictError
			});

			itSerializes('in sloppy env has directive added', {
				in() {
					'use strict';
					return () => delete Object.prototype;
				},
				strictEnv: false,
				out: '()=>{"use strict";return delete Object.prototype}',
				validate: expectToThrowStrictError
			});
		});

		describe('sloppy mode function', () => {
			itSerializes('in strict env is wrapped in eval', {
				in() {
					return () => delete Object.prototype;
				},
				strictEnv: true,
				out: '(0,eval)("()=>delete Object.prototype")',
				validate: expectNotToThrowStrictError
			});

			itSerializes('in sloppy env has no directive added', {
				in() {
					return () => delete Object.prototype;
				},
				strictEnv: false,
				out: '()=>delete Object.prototype',
				validate: expectNotToThrowStrictError
			});
		});

		itSerializes('function defined in dynamic method key of strict mode method is not strict', {
			in() {
				let fn;
				({ // eslint-disable-line no-unused-expressions
					[fn = (0, () => delete Object.prototype)]() {
						'use strict';
					}
				});
				return fn;
			},
			strictEnv: false,
			out: '()=>delete Object.prototype',
			validate: expectNotToThrowStrictError
		});
	});

	describe('sloppy env adds "use strict" directive to strict', () => {
		itSerializes('function', {
			in() {
				'use strict';
				return function() { delete Object.prototype; };
			},
			strictEnv: false,
			out: 'function(){"use strict";delete Object.prototype}',
			validate: expectToThrowStrictError
		});

		itSerializes('function with simple params', {
			in() {
				'use strict';
				return function(x, y, z) { delete Object.prototype; }; // eslint-disable-line no-unused-vars
			},
			strictEnv: false,
			out: 'function(a,b,c){"use strict";delete Object.prototype}',
			validate: expectToThrowStrictError
		});

		itSerializes('function with properties', {
			in() {
				'use strict';
				function fn() { delete Object.prototype; }
				fn.x = 1;
				Object.setPrototypeOf(fn, Array);
				Object.freeze(fn);
				return fn;
			},
			strictEnv: false,
			out: `(()=>{
				const a=Object;
				return a.freeze(
					a.setPrototypeOf(
						a.assign(
							function fn(){"use strict";delete Object.prototype},
							{x:1}
						),
						Array
					)
				)
			})()`,
			validate(fn) {
				expectToThrowStrictError(fn);
				expect(fn.x).toBe(1);
				expect(fn).toHavePrototype(Array);
				expect(Object.isFrozen(fn)).toBeTrue();
			}
		});

		itSerializes('arrow function', {
			in() {
				'use strict';
				return () => delete Object.prototype;
			},
			strictEnv: false,
			out: '()=>{"use strict";return delete Object.prototype}',
			validate: expectToThrowStrictError
		});

		itSerializes('method', {
			in() {
				'use strict';
				return {
					x() {
						delete Object.prototype;
					}
				}.x;
			},
			strictEnv: false,
			out: '{x(){"use strict";delete Object.prototype}}.x',
			validate: expectToThrowStrictError
		});
	});

	describe('strict env removes "use strict" directive from strict', () => {
		itSerializes('function', {
			in() {
				return function() {
					'use strict';
					delete Object.prototype;
				};
			},
			strictEnv: true,
			out: 'function(){delete Object.prototype}',
			validate: expectToThrowStrictError
		});

		itSerializes('function with simple params', {
			in() {
				return function(x, y, z) { // eslint-disable-line no-unused-vars
					'use strict';
					delete Object.prototype;
				};
			},
			strictEnv: true,
			out: 'function(a,b,c){delete Object.prototype}',
			validate: expectToThrowStrictError
		});

		itSerializes('function with properties', {
			in() {
				function fn() {
					'use strict';
					delete Object.prototype;
				}
				fn.x = 1;
				Object.setPrototypeOf(fn, Array);
				Object.freeze(fn);
				return fn;
			},
			strictEnv: true,
			out: `(()=>{
				const a=Object;
				return a.freeze(
					a.setPrototypeOf(
						a.assign(
							function fn(){delete Object.prototype},
							{x:1}
						),
						Array
					)
				)
			})()`,
			validate(fn) {
				expectToThrowStrictError(fn);
				expect(fn.x).toBe(1);
				expect(fn).toHavePrototype(Array);
				expect(Object.isFrozen(fn)).toBeTrue();
			}
		});

		itSerializes('arrow function with return statement', {
			in() {
				return () => {
					'use strict';
					return delete Object.prototype;
				};
			},
			strictEnv: true,
			out: '()=>delete Object.prototype',
			validate: expectToThrowStrictError
		});

		itSerializes('arrow function with no return statement', {
			in() {
				return () => {
					'use strict';
					delete Object.prototype;
				};
			},
			strictEnv: true,
			out: '()=>{delete Object.prototype}',
			validate: expectToThrowStrictError
		});

		itSerializes('class', {
			in() {
				'use strict';
				return class {
					constructor() {
						'use strict';
						delete Object.prototype;
					}
				};
			},
			strictEnv: true,
			out: 'class{constructor(){delete Object.prototype}}',
			validate(Klass) {
				expectToThrowStrictError(() => new Klass());
			}
		});

		itSerializes('method', {
			in() {
				return {
					x() {
						'use strict';
						delete Object.prototype;
					}
				}.x;
			},
			strictEnv: true,
			out: '{x(){delete Object.prototype}}.x',
			validate: expectToThrowStrictError
		});
	});

	describe('mix of strict and sloppy functions in', () => {
		itSerializes('strict env adds wrappers around sloppy functions', {
			in: createMixedFunctions,
			strictEnv: true,
			out: `[
				function strictFn1(){delete Object.prototype},
				(0,eval)("(function sloppyFn1(){return delete Object.prototype})"),
				function strictFn2(){delete Object.prototype},
				(0,eval)("(function sloppyFn2(){return delete Object.prototype})")
			]`,
			validate: validateMixedFunctions
		});

		itSerializes('sloppy env adds directives to strict functions', {
			in: createMixedFunctions,
			strictEnv: false,
			out: `[
				function strictFn1(){"use strict";delete Object.prototype},
				function sloppyFn1(){return delete Object.prototype},
				function strictFn2(){"use strict";delete Object.prototype},
				function sloppyFn2(){return delete Object.prototype}
			]`,
			validate: validateMixedFunctions
		});
	});

	describe('functions in scopes', () => {
		describe('one function', () => {
			describe('strict', () => {
				itSerializes('in sloppy env adds directive to scope function', {
					in() {
						'use strict';
						const x = 1;
						return () => (x, delete Object.prototype); // eslint-disable-line no-sequences
					},
					strictEnv: false,
					out: '(a=>{"use strict";return()=>(a,delete Object.prototype)})(1)',
					validate: expectToThrowStrictError
				});

				itSerializes('in strict env removes directive from function', {
					in() {
						const x = 1;
						return () => {
							'use strict';
							return x, delete Object.prototype; // eslint-disable-line no-sequences
						};
					},
					strictEnv: true,
					out: '(a=>()=>(a,delete Object.prototype))(1)',
					validate: expectToThrowStrictError
				});
			});

			describe('sloppy', () => {
				itSerializes('in sloppy env adds no directives', {
					in() {
						const x = 1;
						return () => [x, delete Object.prototype];
					},
					strictEnv: false,
					out: '(a=>()=>[a,delete Object.prototype])(1)',
					validate(fn) {
						expect(fn()).toEqual([1, false]);
					}
				});

				itSerializes('in strict env wraps scope function in sloppy eval', {
					in() {
						const x = 1;
						return () => [x, delete Object.prototype];
					},
					strictEnv: true,
					out: '(0,eval)("a=>()=>[a,delete Object.prototype]")(1)',
					validate(fn) {
						expect(fn()).toEqual([1, false]);
					}
				});
			});
		});

		describe('multiple functions in one scope', () => {
			describe('all strict', () => {
				itSerializes('in sloppy env adds directive to scope function', {
					in() {
						'use strict';
						const x = 1;
						{
							const y = 2;
							return [
								() => (x, delete Object.prototype), // eslint-disable-line no-sequences
								() => (y, delete Object.prototype), // eslint-disable-line no-sequences
								() => (x, y, delete Object.prototype) // eslint-disable-line no-sequences
							];
						}
					},
					strictEnv: false,
					out: `(()=>{
						const a=(b=>{
								"use strict";
								return[
									()=>(b,delete Object.prototype),
									a=>[
										()=>(a,delete Object.prototype),
										()=>(b,a,delete Object.prototype)
									]
								]
							})(1),
							b=a[1](2);
						return[a[0],b[0],b[1]]
					})()`,
					validate([fn1, fn2, fn3]) {
						expectToThrowStrictError(fn1);
						expectToThrowStrictError(fn2);
						expectToThrowStrictError(fn3);
					}
				});

				itSerializes('in strict env removes directive from functions', {
					in() {
						'use strict';
						const x = 1;
						{
							const y = 2;
							return [
								() => {
									'use strict';
									return x, delete Object.prototype; // eslint-disable-line no-sequences
								},
								() => {
									'use strict';
									return y, delete Object.prototype; // eslint-disable-line no-sequences
								},
								() => {
									'use strict';
									return x, y, delete Object.prototype; // eslint-disable-line no-sequences
								}
							];
						}
					},
					strictEnv: true,
					out: `(()=>{
						const a=(b=>[
								()=>(b,delete Object.prototype),
								a=>[
									()=>(a,delete Object.prototype),
									()=>(b,a,delete Object.prototype)
								]
							])(1),
							b=a[1](2);
						return[a[0],b[0],b[1]]
					})()`,
					validate([fn1, fn2, fn3]) {
						expectToThrowStrictError(fn1);
						expectToThrowStrictError(fn2);
						expectToThrowStrictError(fn3);
					}
				});
			});

			describe('all sloppy', () => {
				itSerializes('in sloppy env adds no directives', {
					in() {
						const x = 1;
						{
							const y = 2;
							return [
								() => [x, delete Object.prototype],
								() => [y, delete Object.prototype],
								() => [x, y, delete Object.prototype]
							];
						}
					},
					strictEnv: false,
					out: `(()=>{
						const a=(b=>[
								()=>[b,delete Object.prototype],
								a=>[
									()=>[a,delete Object.prototype],
									()=>[b,a,delete Object.prototype]
								]
							])(1),
							b=a[1](2);
						return[a[0],b[0],b[1]]
					})()`,
					validate([fn1, fn2, fn3]) {
						expect(fn1()).toEqual([1, false]);
						expect(fn2()).toEqual([2, false]);
						expect(fn3()).toEqual([1, 2, false]);
					}
				});

				itSerializes('in strict env wraps scope function in sloppy eval', {
					in() {
						const x = 1;
						{
							const y = 2;
							return [
								() => [x, delete Object.prototype],
								() => [y, delete Object.prototype],
								() => [x, y, delete Object.prototype]
							];
						}
					},
					strictEnv: true,
					out: `(()=>{
						const a=(0,eval)(
								"b=>[()=>[b,delete Object.prototype],a=>[()=>[a,delete Object.prototype],()=>[b,a,delete Object.prototype]]]"
							)(1),
							b=a[1](2);
						return[a[0],b[0],b[1]]
					})()`,
					validate([fn1, fn2, fn3]) {
						expect(fn1()).toEqual([1, false]);
						expect(fn2()).toEqual([2, false]);
						expect(fn3()).toEqual([1, 2, false]);
					}
				});
			});

			describe('mix of strict and sloppy', () => {
				function createFunctions() {
					const x = 1;
					const fns = [
						() => [x, delete Object.prototype],
						(() => {
							'use strict';
							return () => (x, delete Object.prototype); // eslint-disable-line no-sequences
						})()
					];
					{
						const y = 2;
						{
							const z = 3;
							fns.push(
								() => [z, delete Object.prototype],
								() => [x, y, z, delete Object.prototype],
								(() => {
									'use strict';
									return () => (z, delete Object.prototype); // eslint-disable-line no-sequences
								})(),
								(() => {
									'use strict';
									return () => (x, y, z, delete Object.prototype); // eslint-disable-line no-sequences
								})()
							);
						}
					}
					{
						const y = 4;
						{
							const z = 5;
							fns.push(
								() => [z, delete Object.prototype],
								() => [x, y, z, delete Object.prototype]
							);
						}
					}
					{
						const y = 6;
						{
							const z = 7;
							fns.push(
								(() => {
									'use strict';
									return () => (z, delete Object.prototype); // eslint-disable-line no-sequences
								})(),
								(() => {
									'use strict';
									return () => (x, y, z, delete Object.prototype); // eslint-disable-line no-sequences
								})()
							);
						}
					}
					return fns;
				}

				function validateFunctions(fns) {
					expect(fns).toBeArrayOfSize(10);
					expect(fns[0]()).toEqual([1, false]);
					expectToThrowStrictError(fns[1]);
					expect(fns[2]()).toEqual([3, false]);
					expect(fns[3]()).toEqual([1, 2, 3, false]);
					expectToThrowStrictError(fns[4]);
					expectToThrowStrictError(fns[5]);
					expect(fns[6]()).toEqual([5, false]);
					expect(fns[7]()).toEqual([1, 4, 5, false]);
					expectToThrowStrictError(fns[8]);
					expectToThrowStrictError(fns[9]);
				}

				itSerializes('in sloppy env adds directive to functions / scope functions', {
					in: createFunctions,
					strictEnv: false,
					out: `(()=>{
						const a=(
								c=>[
									()=>[c,delete Object.prototype],
									()=>{"use strict";return c,delete Object.prototype},
									b=>a=>[
										()=>[a,delete Object.prototype],
										()=>[c,b,a,delete Object.prototype],
										()=>{"use strict";return a,delete Object.prototype},
										()=>{"use strict";return c,b,a,delete Object.prototype}
									],
									b=>a=>[
										()=>[a,delete Object.prototype],
										()=>[c,b,a,delete Object.prototype]
									],
									b=>{
										"use strict";
										return a=>[
											()=>(a,delete Object.prototype),
											()=>(c,b,a,delete Object.prototype)
										]
									}
								]
							)(1),
							b=a[2](2)(3),
							c=a[3](4)(5),
							d=a[4](6)(7);
						return[a[0],a[1],b[0],b[1],b[2],b[3],c[0],c[1],d[0],d[1]]
					})()`,
					validate: validateFunctions
				});

				itSerializes(
					'in strict env wrap in sloppy eval and add directives to functions / scope functions',
					{
						in: createFunctions,
						strictEnv: true,
						out: `(()=>{
							const a=(0,eval)(
									"c=>[()=>[c,delete Object.prototype],()=>{\\"use strict\\";return c,delete Object.prototype},b=>a=>[()=>[a,delete Object.prototype],()=>[c,b,a,delete Object.prototype],()=>{\\"use strict\\";return a,delete Object.prototype},()=>{\\"use strict\\";return c,b,a,delete Object.prototype}],b=>a=>[()=>[a,delete Object.prototype],()=>[c,b,a,delete Object.prototype]],b=>{\\"use strict\\";return a=>[()=>(a,delete Object.prototype),()=>(c,b,a,delete Object.prototype)]}]"
								)(1),
								b=a[2](2)(3),
								c=a[3](4)(5),
								d=a[4](6)(7);
							return[a[0],a[1],b[0],b[1],b[2],b[3],c[0],c[1],d[0],d[1]]
						})()`,
						validate: validateFunctions
					}
				);
			});
		});

		describe('function with scope var with name reserved in strict mode', () => {
			describe('var can be accessed in sloppy mode function', () => {
				describe('in sloppy env', () => {
					itSerializes('when alone', {
						in() {
							const package = 1;
							return () => package;
						},
						strictEnv: false,
						out: '(a=>()=>a)(1)',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(1);
						}
					});

					itSerializes('with another strict function sibling', {
						in() {
							const package = 1;
							return [
								() => package,
								() => {
									'use strict';
									delete Object.prototype;
								}
							];
						},
						strictEnv: false,
						out: '[(a=>()=>a)(1),()=>{"use strict";delete Object.prototype}]',
						validate([sloppyFn, strictFn]) {
							expect(sloppyFn).toBeFunction();
							expect(sloppyFn()).toBe(1);
							expectToThrowStrictError(strictFn);
						}
					});
				});

				describe('in strict env', () => {
					itSerializes('when alone', {
						in() {
							const package = 1;
							return () => package;
						},
						strictEnv: true,
						out: '(0,eval)("a=>()=>a")(1)',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(1);
						}
					});

					itSerializes('with another strict function sibling', {
						in() {
							const package = 1;
							return [
								() => package,
								() => {
									'use strict';
									delete Object.prototype;
								}
							];
						},
						strictEnv: true,
						out: '[(0,eval)("a=>()=>a")(1),()=>{delete Object.prototype}]',
						validate([sloppyFn, strictFn]) {
							expect(sloppyFn).toBeFunction();
							expect(sloppyFn()).toBe(1);
							expectToThrowStrictError(strictFn);
						}
					});
				});
			});

			describe('in scope of `eval()`', () => {
				// NB Inputs are wrapped in `(0, eval)` to prevent test functions being included in scope of eval
				/* eslint-disable no-eval */
				describe('accessible if eval is sloppy mode', () => {
					itSerializes('alone', {
						in: () => (0, eval)(`
							const package = 1;
							() => eval('package')
						`),
						strictEnv: false,
						out: '(0,eval)("package=>()=>eval(\\"package\\")")(1)',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(1);
						}
					});

					itSerializes('with a sibling strict function', {
						in: () => (0, eval)(`
							const package = 1,
								ext = 2;
							[
								() => eval('package'),
								() => {
									'use strict';
									return ext;
								}
							];
						`),
						strictEnv: false,
						out: `(()=>{
							const a=(0,eval)("
									(package,ext)=>[
										()=>eval(\\"package\\"),
										()=>{\\"use strict\\";return ext}
									]
								")(1,2);
							return[a[0],a[1]]
						})()`,
						validate([evalFn, otherFn]) {
							expect(evalFn).toBeFunction();
							expect(evalFn()).toBe(1);
							expect(otherFn).toBeFunction();
							expect(otherFn()).toBe(2);
						}
					});
				});

				describe('not accessible if eval is strict mode', () => {
					itSerializes('alone', {
						in: () => (0, eval)(`
							const package = 1;
							() => {
								'use strict';
								return eval('2');
							}
						`),
						strictEnv: false,
						out: '(0,eval)("\\"use strict\\";()=>eval(\\"2\\")")',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(2);
						}
					});

					itSerializes('with a sibling sloppy function', {
						in: () => (0, eval)(`
							const package = 1,
								ext = 2;
							[
								() => {
									'use strict';
									return eval('ext');
								},
								() => package
							];
						`),
						strictEnv: false,
						out: `(()=>{
							const a=(0,eval)("
									(ext,package)=>[
										()=>{\\"use strict\\";return eval(\\"ext\\")},
										()=>package
									]
								")(2,1);
							return[a[0],a[1]]
						})()`,
						validate([evalFn, otherFn]) {
							expect(evalFn).toBeFunction();
							expect(evalFn()).toBe(2);
							expect(otherFn).toBeFunction();
							expect(otherFn()).toBe(1);
						}
					});
				});
				/* eslint-enable no-eval */
			});
		});

		describe('scope function with `arguments` or `eval` param', () => {
			// NB Inputs are wrapped in `(0, eval)` to prevent test functions being included in scope of eval
			/* eslint-disable no-eval */
			describe('arguments', () => {
				itSerializes('in sloppy env adds directive to child function, not scope function', {
					in: () => (0, eval)(`
						const arguments = 1;
						() => {
							'use strict';
							return eval('arguments');
						};
					`),
					strictEnv: false,
					out: '(0,eval)("arguments=>()=>{\\"use strict\\";return eval(\\"arguments\\")}")(1)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(1);
					}
				});

				itSerializes(
					'in strict env wraps scope function in sloppy eval and adds directive to child function',
					{
						in: () => (0, eval)(`
							const arguments = 1;
							() => {
								'use strict';
								return eval('arguments');
							};
						`),
						strictEnv: true,
						out: '(0,eval)("arguments=>()=>{\\"use strict\\";return eval(\\"arguments\\")}")(1)',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(1);
						}
					}
				);
			});

			// These tests don't work at present, due to bug with how Livepack handles `eval`.
			// https://github.com/overlookmotel/livepack/issues/137
			// TODO Enable these tests when issue is resolved.
			// eslint-disable-next-line jest/no-commented-out-tests
			/*
			describe('eval', () => {
				itSerializes('in sloppy env adds directive to child function, not scope function', {
					in: () => (0, eval)(`
						(eval => () => {
							'use strict';
							return eval('eval');
						})(eval);
					`),
					strictEnv: false,
					out: '(eval=>()=>{"use strict";return eval("eval")})(eval)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(eval);
					}
				});

				itSerializes(
					'in strict env wraps scope function in sloppy eval and adds directive to child function',
					{
						in: () => (0, eval)(`
							(eval => () => {
								'use strict';
								return eval('eval');
							})(eval);
						`),
						strictEnv: true,
						out: '(0,eval)("eval=>()=>{\\"use strict\\";return eval(\\"eval\\")}")(eval)',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(eval);
						}
					}
				);
			});
			*/
			/* eslint-enable no-eval */
		});
	});

	describe('strict functions with non-simple params have directive added outside function', () => {
		describe('single function', () => {
			itSerializes('default param', {
				in() {
					'use strict';
					return function(x, y, z = 1) { // eslint-disable-line no-unused-vars
						delete Object.prototype;
					};
				},
				strictEnv: false,
				out: '(()=>{"use strict";return function(a,b,c=1){delete Object.prototype}})()',
				validate: expectToThrowStrictError
			});

			itSerializes('object destructuring', {
				in() {
					'use strict';
					return function(x, {y}, z) { // eslint-disable-line no-unused-vars
						delete Object.prototype;
					};
				},
				strictEnv: false,
				out: '(()=>{"use strict";return function(a,{y:b},c){delete Object.prototype}})()',
				validate(fn) {
					expectToThrowStrictError(() => fn(1, {}, 3));
				}
			});

			itSerializes('array destructuring', {
				in() {
					'use strict';
					return function(x, [y], z) { // eslint-disable-line no-unused-vars
						delete Object.prototype;
					};
				},
				strictEnv: false,
				out: '(()=>{"use strict";return function(a,[b],c){delete Object.prototype}})()',
				validate(fn) {
					expectToThrowStrictError(() => fn(1, [], 3));
				}
			});

			itSerializes('rest param', {
				in() {
					'use strict';
					return function(x, y, ...z) { // eslint-disable-line no-unused-vars
						delete Object.prototype;
					};
				},
				strictEnv: false,
				out: '(()=>{"use strict";return function(a,b,...c){delete Object.prototype}})()',
				validate: expectToThrowStrictError
			});
		});

		describe('alongside sloppy function', () => {
			itSerializes('default param', {
				in() {
					return [
						(() => {
							'use strict';
							return function(x, y, z = 1) { // eslint-disable-line no-unused-vars
								delete Object.prototype;
							};
						})(),
						() => delete Object.prototype
					];
				},
				strictEnv: false,
				out: `[
					(()=>{"use strict";return function(a,b,c=1){delete Object.prototype}})(),
					()=>delete Object.prototype
				]`,
				validate([strictFn, sloppyFn]) {
					expectToThrowStrictError(strictFn);
					expectNotToThrowStrictError(sloppyFn);
				}
			});

			itSerializes('object destructuring', {
				in() {
					return [
						(() => {
							'use strict';
							return function(x, {y}, z) { // eslint-disable-line no-unused-vars
								delete Object.prototype;
							};
						})(),
						() => delete Object.prototype
					];
				},
				strictEnv: false,
				out: `[
					(()=>{"use strict";return function(a,{y:b},c){delete Object.prototype}})(),
					()=>delete Object.prototype
				]`,
				validate([strictFn, sloppyFn]) {
					expectToThrowStrictError(() => strictFn(1, {}, 3));
					expectNotToThrowStrictError(sloppyFn);
				}
			});

			itSerializes('array destructuring', {
				in() {
					return [
						(() => {
							'use strict';
							return function(x, [y], z) { // eslint-disable-line no-unused-vars
								delete Object.prototype;
							};
						})(),
						() => delete Object.prototype
					];
				},
				strictEnv: false,
				out: `[
					(()=>{"use strict";return function(a,[b],c){delete Object.prototype}})(),
					()=>delete Object.prototype
				]`,
				validate([strictFn, sloppyFn]) {
					expectToThrowStrictError(() => strictFn(1, [], 3));
					expectNotToThrowStrictError(sloppyFn);
				}
			});

			itSerializes('rest param', {
				in() {
					return [
						(() => {
							'use strict';
							return function(x, y, ...z) { // eslint-disable-line no-unused-vars
								delete Object.prototype;
							};
						})(),
						() => delete Object.prototype
					];
				},
				strictEnv: false,
				out: `[
					(()=>{"use strict";return function(a,b,...c){delete Object.prototype}})(),
					()=>delete Object.prototype
				]`,
				validate([strictFn, sloppyFn]) {
					expectToThrowStrictError(strictFn);
					expectNotToThrowStrictError(sloppyFn);
				}
			});
		});

		describe('in scope, alongside sloppy function', () => {
			itSerializes('default param', {
				in() {
					const ext = 1;
					return [
						(() => {
							'use strict';
							return function(x, y, z = 1) { // eslint-disable-line no-unused-vars
								delete Object.prototype;
								return ext;
							};
						})(),
						() => (ext, delete Object.prototype) // eslint-disable-line no-sequences
					];
				},
				strictEnv: false,
				out: `(()=>{
					const a=(d=>[
						(()=>{
							"use strict";
							return function(a,b,c=1){delete Object.prototype;return d}
						})(),
						()=>(d,delete Object.prototype)
					])(1);
					return[a[0],a[1]]
				})()`,
				validate([strictFn, sloppyFn]) {
					expectToThrowStrictError(strictFn);
					expectNotToThrowStrictError(sloppyFn);
				}
			});

			itSerializes('object destructuring', {
				in() {
					const ext = 1;
					return [
						(() => {
							'use strict';
							return function(x, {y}, z) { // eslint-disable-line no-unused-vars
								delete Object.prototype;
								return ext;
							};
						})(),
						() => (ext, delete Object.prototype) // eslint-disable-line no-sequences
					];
				},
				strictEnv: false,
				out: `(()=>{
					const a=(d=>[
						(()=>{
							"use strict";
							return function(a,{y:b},c){delete Object.prototype;return d}
						})(),
						()=>(d,delete Object.prototype)
					])(1);
					return[a[0],a[1]]
				})()`,
				validate([strictFn, sloppyFn]) {
					expectToThrowStrictError(() => strictFn(1, {}, 3));
					expectNotToThrowStrictError(sloppyFn);
				}
			});

			itSerializes('array destructuring', {
				in() {
					const ext = 1;
					return [
						(() => {
							'use strict';
							return function(x, [y], z) { // eslint-disable-line no-unused-vars
								delete Object.prototype;
								return ext;
							};
						})(),
						() => (ext, delete Object.prototype) // eslint-disable-line no-sequences
					];
				},
				strictEnv: false,
				out: `(()=>{
					const a=(d=>[
						(()=>{
							"use strict";
							return function(a,[b],c){delete Object.prototype;return d}
						})(),
						()=>(d,delete Object.prototype)
					])(1);
					return[a[0],a[1]]
				})()`,
				validate([strictFn, sloppyFn]) {
					expectToThrowStrictError(() => strictFn(1, [], 3));
					expectNotToThrowStrictError(sloppyFn);
				}
			});

			itSerializes('rest param', {
				in() {
					const ext = 1;
					return [
						(() => {
							'use strict';
							return function(x, y, ...z) { // eslint-disable-line no-unused-vars
								delete Object.prototype;
								return ext;
							};
						})(),
						() => (ext, delete Object.prototype) // eslint-disable-line no-sequences
					];
				},
				strictEnv: false,
				out: `(()=>{
					const a=(d=>[
						(()=>{
							"use strict";
							return function(a,b,...c){delete Object.prototype;return d}
						})(),
						()=>(d,delete Object.prototype)
					])(1);
					return[a[0],a[1]]
				})()`,
				validate([strictFn, sloppyFn]) {
					expectToThrowStrictError(strictFn);
					expectNotToThrowStrictError(sloppyFn);
				}
			});
		});
	});

	describe('classes', () => {
		describe('do not have directive added in sloppy env', () => {
			itSerializes('class with constructor', {
				in() {
					return class {
						constructor() {
							delete Object.prototype;
						}
					};
				},
				strictEnv: false,
				out: 'class{constructor(){delete Object.prototype}}',
				validate(Klass) {
					expectToThrowStrictError(() => new Klass());
				}
			});

			itSerializes('empty class', {
				in() {
					'use strict';
					return class {};
				},
				strictEnv: false,
				out: 'class{}',
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(new Klass()).toBeInstanceOf(Klass);
				}
			});
		});

		describe('do not get wrapped in eval in strict env', () => {
			itSerializes('class with constructor', {
				in() {
					return class {
						constructor() {
							delete Object.prototype;
						}
					};
				},
				strictEnv: true,
				out: 'class{constructor(){delete Object.prototype}}',
				validate(Klass) {
					expectToThrowStrictError(() => new Klass());
				}
			});

			itSerializes('empty class', {
				in() {
					'use strict';
					return class {};
				},
				strictEnv: true,
				out: 'class{}',
				validate(Klass) {
					expect(Klass).toBeFunction();
					expect(new Klass()).toBeInstanceOf(Klass);
				}
			});
		});

		describe('do not affect treatment of other functions', () => {
			describe('in sloppy env', () => {
				itSerializes('all functions are strict, directive placed at top', {
					in: () => [
						class {
							constructor() {
								delete Object.prototype;
							}
						},
						() => {
							'use strict';
							return delete Object.prototype;
						},
						() => {
							'use strict';
							return delete Object.prototype;
						}
					],
					strictEnv: false,
					out: `(()=>{
						"use strict";
						return[
							class{constructor(){delete Object.prototype}},
							()=>delete Object.prototype,
							()=>delete Object.prototype
						]
					})()`,
					validate([Klass, fn1, fn2]) {
						expectToThrowStrictError(() => new Klass());
						expectToThrowStrictError(fn1);
						expectToThrowStrictError(fn2);
					}
				});

				itSerializes('all functions are sloppy, no directive added', {
					in: () => [
						class {
							constructor() {
								delete Object.prototype;
							}
						},
						() => delete Object.prototype,
						() => delete Object.prototype
					],
					strictEnv: false,
					out: `[
						class{constructor(){delete Object.prototype}},
						()=>delete Object.prototype,
						()=>delete Object.prototype
					]`,
					validate([Klass, fn1, fn2]) {
						expectToThrowStrictError(() => new Klass());
						expectNotToThrowStrictError(fn1);
						expectNotToThrowStrictError(fn2);
					}
				});
			});

			describe('in strict env', () => {
				itSerializes('all functions are strict, no directive added', {
					in: () => [
						class {
							constructor() {
								delete Object.prototype;
							}
						},
						() => {
							'use strict';
							return delete Object.prototype;
						},
						() => {
							'use strict';
							return delete Object.prototype;
						}
					],
					strictEnv: true,
					out: `[
						class{constructor(){delete Object.prototype}},
						()=>delete Object.prototype,
						()=>delete Object.prototype
					]`,
					validate([Klass, fn1, fn2]) {
						expectToThrowStrictError(() => new Klass());
						expectToThrowStrictError(fn1);
						expectToThrowStrictError(fn2);
					}
				});

				itSerializes('all functions are sloppy, functions wrapped in eval', {
					in: () => [
						class {
							constructor() {
								delete Object.prototype;
							}
						},
						() => delete Object.prototype,
						() => delete Object.prototype
					],
					strictEnv: true,
					out: `[
						class{constructor(){delete Object.prototype}},
						(0,eval)("()=>delete Object.prototype"),
						(0,eval)("()=>delete Object.prototype")
					]`,
					validate([Klass, fn1, fn2]) {
						expectToThrowStrictError(() => new Klass());
						expectNotToThrowStrictError(fn1);
						expectNotToThrowStrictError(fn2);
					}
				});
			});
		});

		describe('in scopes', () => {
			describe('containing only classes', () => {
				itSerializes.each(
					[
						['in sloppy env, inserts no directives', false],
						['in strict env, adds no sloppy eval wrapper', true]
					],
					'%s',
					(_, strictEnv) => ({
						in() {
							const x = 1;
							return [
								class X {
									constructor() {
										return x, delete Object.prototype; // eslint-disable-line no-sequences
									}
								},
								class Y {
									constructor() {
										return x, delete Object.prototype; // eslint-disable-line no-sequences
									}
								}
							];
						},
						strictEnv,
						out: `(()=>{
							const a=(a=>[
								class X{constructor(){return a,delete Object.prototype}},
								class Y{constructor(){return a,delete Object.prototype}}
							])(1);
							return[a[0],a[1]]
						})()`,
						validate([Klass1, Klass2]) {
							expectToThrowStrictError(() => new Klass1());
							expectToThrowStrictError(() => new Klass2());
						}
					})
				);
			});

			describe('with other functions', () => {
				describe('in strict env', () => {
					itSerializes('if function strict, does not add directive', {
						in() {
							const x = 1;
							return [
								class {
									constructor() {
										return x, delete Object.prototype; // eslint-disable-line no-sequences
									}
								},
								() => {
									'use strict';
									return x, delete Object.prototype; // eslint-disable-line no-sequences
								}
							];
						},
						strictEnv: true,
						out: `(()=>{
							const a=(a=>[
								class{constructor(){return a,delete Object.prototype}},
								()=>(a,delete Object.prototype)
							])(1);
							return[a[0],a[1]]
						})()`,
						validate([Klass, fn]) {
							expectToThrowStrictError(() => new Klass());
							expectToThrowStrictError(fn);
						}
					});

					itSerializes('if function sloppy, wraps scope function in sloppy eval', {
						in() {
							const x = 1;
							/* eslint-disable no-sequences */
							return [
								class {
									constructor() {
										return x, delete Object.prototype;
									}
								},
								() => (x, delete Object.prototype)
							];
							/* eslint-enable no-sequences */
						},
						strictEnv: true,
						out: `(()=>{
							const a=(0,eval)("a=>[class{constructor(){return a,delete Object.prototype}},()=>(a,delete Object.prototype)]")(1);
							return[a[0],a[1]]
						})()`,
						validate([Klass, fn]) {
							expectToThrowStrictError(() => new Klass());
							expectNotToThrowStrictError(fn);
						}
					});
				});

				describe('in sloppy env', () => {
					itSerializes('if function strict, adds directive to scope function', {
						in() {
							const x = 1;
							return [
								class {
									constructor() {
										return x, delete Object.prototype; // eslint-disable-line no-sequences
									}
								},
								() => {
									'use strict';
									return x, delete Object.prototype; // eslint-disable-line no-sequences
								}
							];
						},
						strictEnv: false,
						out: `(()=>{
							const a=(a=>{
								"use strict";
								return[
									class{constructor(){return a,delete Object.prototype}},
									()=>(a,delete Object.prototype)
								]
							})(1);
							return[a[0],a[1]]
						})()`,
						validate([Klass, fn]) {
							expectToThrowStrictError(() => new Klass());
							expectToThrowStrictError(fn);
						}
					});

					itSerializes('if function sloppy, adds no directives', {
						in() {
							const x = 1;
							return [
								class {
									constructor() {
										return x, delete Object.prototype; // eslint-disable-line no-sequences
									}
								},
								() => (x, delete Object.prototype) // eslint-disable-line no-sequences
							];
						},
						strictEnv: false,
						out: `(()=>{
							const a=(a=>[
								class{constructor(){return a,delete Object.prototype}},
								()=>(a,delete Object.prototype)
							])(1);
							return[a[0],a[1]]
						})()`,
						validate([Klass, fn]) {
							expectToThrowStrictError(() => new Klass());
							expectNotToThrowStrictError(fn);
						}
					});
				});
			});
		});
	});

	describe('class methods always strict mode', () => {
		itSerializes('prototype method', {
			in() {
				class Klass {
					foo() { // eslint-disable-line class-methods-use-this
						return delete Object.prototype;
					}
				}
				return Klass.prototype.foo;
			},
			strictEnv: false,
			out: '{foo(){"use strict";return delete Object.prototype}}.foo',
			validate: expectToThrowStrictError
		});

		itSerializes('static method', {
			in() {
				class Klass {
					static bar() {
						return delete Object.prototype;
					}
				}
				return Klass.bar;
			},
			strictEnv: false,
			out: '{bar(){"use strict";return delete Object.prototype}}.bar',
			validate: expectToThrowStrictError
		});
	});

	describe('functions defined within `extends` clause of class are strict', () => {
		itSerializes('class declaration', {
			in() {
				let fn;
				// eslint-disable-next-line no-unused-vars
				class Y extends ((fn = (0, () => delete Object.prototype)), class {}) {}
				return fn;
			},
			strictEnv: false,
			out: '()=>{"use strict";return delete Object.prototype}',
			validate: expectToThrowStrictError
		});

		itSerializes('class expression', {
			in() {
				let fn;
				// eslint-disable-next-line no-unused-vars
				const Y = class extends ((fn = (0, () => delete Object.prototype)), class {}) {};
				return fn;
			},
			strictEnv: false,
			out: '()=>{"use strict";return delete Object.prototype}',
			validate: expectToThrowStrictError
		});
	});

	describe('nested functions', () => {
		describe('single function', () => {
			itSerializes('sloppy in sloppy has no directive added', {
				in() {
					return () => () => delete Object.prototype;
				},
				strictEnv: false,
				out: '()=>()=>delete Object.prototype',
				validate(fnOuter) {
					expect(fnOuter).toBeFunction();
					const fnInner = fnOuter();
					expect(fnInner).toBeFunction();
					expectNotToThrowStrictError(fnInner);
				}
			});

			itSerializes('containing strict mode directive inside sloppy function has directive retained', {
				in() {
					return () => () => {
						'use strict';
						return delete Object.prototype;
					};
				},
				strictEnv: false,
				out: '()=>()=>{"use strict";return delete Object.prototype}',
				validate(fnOuter) {
					expect(fnOuter).toBeFunction();
					const fnInner = fnOuter();
					expect(fnInner).toBeFunction();
					expectToThrowStrictError(fnInner);
				}
			});

			itSerializes('defined in dynamic method key where method is strict has directive retained', {
				in() {
					return () => {
						let innerFn;
						const {method} = {
							[(innerFn = () => {
								'use strict';
								return delete Object.prototype;
							}, 'method')]() {
								'use strict';
								return delete Object.prototype;
							}
						};
						return [method, innerFn];
					};
				},
				strictEnv: false,
				out: `()=>{
					let a;
					const{method:b}={
						[(a=()=>{
							"use strict";
							return delete Object.prototype
						},"method")](){
							"use strict";
							return delete Object.prototype
						}
					};
					return[b,a]
				}`,
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(2);
					const [method, innerFn] = res;
					expectToThrowStrictError(method);
					expectToThrowStrictError(innerFn);
				}
			});

			describe('containing strict mode directive inside strict function has directive removed', () => {
				itSerializes('when strict mode set externally', {
					in() {
						'use strict';
						return () => () => {
							'use strict';
							return delete Object.prototype;
						};
					},
					strictEnv: true,
					out: '()=>()=>delete Object.prototype',
					validate(fnOuter) {
						expect(fnOuter).toBeFunction();
						const fnInner = fnOuter();
						expect(fnInner).toBeFunction();
						expectToThrowStrictError(fnInner);
					}
				});

				itSerializes('when strict mode set in exported function', {
					in() {
						return () => {
							'use strict';
							return () => {
								'use strict';
								return delete Object.prototype;
							};
						};
					},
					strictEnv: true,
					out: '()=>()=>delete Object.prototype',
					validate(fnOuter) {
						expect(fnOuter).toBeFunction();
						const fnInner = fnOuter();
						expect(fnInner).toBeFunction();
						expectToThrowStrictError(fnInner);
					}
				});
			});

			itSerializes(
				'strict function contained in sloppy function with strict function in params has directive retained',
				{
					in() {
						return function(x = () => { 'use strict'; }) { // eslint-disable-line no-unused-vars
							return () => {
								'use strict';
								return delete Object.prototype;
							};
						};
					},
					strictEnv: false,
					out: 'function(a=()=>{"use strict"}){return()=>{"use strict";return delete Object.prototype}}',
					validate(fnOuter) {
						expect(fnOuter).toBeFunction();
						const fnInner = fnOuter();
						expect(fnInner).toBeFunction();
						expectToThrowStrictError(fnInner);
					}
				}
			);
		});

		describe('multiple functions', () => {
			itSerializes('in sloppy mode function retain directives as required', {
				in() {
					return () => [
						() => delete Object.prototype,
						() => {
							'use strict';
							return delete Object.prototype;
						},
						() => [
							() => delete Object.prototype,
							() => {
								'use strict';
								return delete Object.prototype;
							}
						],
						() => {
							'use strict';
							return [
								() => delete Object.prototype,
								() => {
									'use strict';
									return delete Object.prototype;
								}
							];
						}
					];
				},
				strictEnv: false,
				out: `()=>[
					()=>delete Object.prototype,
					()=>{"use strict";return delete Object.prototype},
					()=>[
						()=>delete Object.prototype,
						()=>{"use strict";return delete Object.prototype}
					],
					()=>{
						"use strict";
						return[
							()=>delete Object.prototype,
							()=>delete Object.prototype
						]
					}
				]`,
				validate(fnOuter) {
					expect(fnOuter).toBeFunction();
					const [sloppy1, strict1, sloppyGroupFn, strictGroupFn] = fnOuter();
					expectNotToThrowStrictError(sloppy1);
					expectToThrowStrictError(strict1);

					expect(sloppyGroupFn).toBeFunction();
					const [sloppy2, strict2] = sloppyGroupFn();
					expectNotToThrowStrictError(sloppy2);
					expectToThrowStrictError(strict2);

					expect(strictGroupFn).toBeFunction();
					const [strict3, strict4] = strictGroupFn();
					expectToThrowStrictError(strict3);
					expectToThrowStrictError(strict4);
				}
			});

			itSerializes('in strict mode function retain directive in top function only', {
				in() {
					return () => {
						'use strict';
						return [
							() => delete Object.prototype,
							() => {
								'use strict';
								return delete Object.prototype;
							},
							() => [
								() => delete Object.prototype,
								() => {
									'use strict';
									return delete Object.prototype;
								}
							],
							() => {
								'use strict';
								return [
									() => delete Object.prototype,
									() => {
										'use strict';
										return delete Object.prototype;
									}
								];
							}
						];
					};
				},
				strictEnv: false,
				out: `()=>{
					"use strict";
					return[
						()=>delete Object.prototype,
						()=>delete Object.prototype,
						()=>[
							()=>delete Object.prototype,
							()=>delete Object.prototype
						],
						()=>[
							()=>delete Object.prototype,
							()=>delete Object.prototype
						]
					]
				}`,
				validate(fnOuter) {
					expect(fnOuter).toBeFunction();
					const [strict1, strict2, groupFn1, groupFn2] = fnOuter();
					expectToThrowStrictError(strict1);
					expectToThrowStrictError(strict2);

					expect(groupFn1).toBeFunction();
					const [strict3, strict4] = groupFn1();
					expectToThrowStrictError(strict3);
					expectToThrowStrictError(strict4);

					expect(groupFn2).toBeFunction();
					const [strict5, strict6] = groupFn2();
					expectToThrowStrictError(strict5);
					expectToThrowStrictError(strict6);
				}
			});
		});
	});

	describe('CommonJS format', () => { // eslint-disable-line jest/lowercase-name
		itSerializes('strict function adds top-level directive', {
			in() {
				return () => {
					'use strict';
					delete Object.prototype;
				};
			},
			format: 'cjs',
			out: '"use strict";module.exports=()=>{delete Object.prototype}',
			validate: expectToThrowStrictError
		});

		itSerializes('sloppy function does not add top-level directive', {
			in() {
				return () => delete Object.prototype;
			},
			format: 'cjs',
			out: 'module.exports=()=>delete Object.prototype',
			validate: expectNotToThrowStrictError
		});

		itSerializes('mix of strict and sloppy functions adds directives to strict functions', {
			in: createMixedFunctions,
			format: 'cjs',
			out: `module.exports=[
				function strictFn1(){"use strict";delete Object.prototype},
				function sloppyFn1(){return delete Object.prototype},
				function strictFn2(){"use strict";delete Object.prototype},
				function sloppyFn2(){return delete Object.prototype}
			]`,
			validate: validateMixedFunctions
		});

		itSerializes('strict scoped function adds top-level directive', {
			in() {
				const x = 1;
				return () => {
					'use strict';
					delete Object.prototype;
					return x;
				};
			},
			format: 'cjs',
			out: '"use strict";module.exports=(a=>()=>{delete Object.prototype;return a})(1)',
			validate: expectToThrowStrictError
		});

		itSerializes('sloppy scoped function does not add top-level directive', {
			in() {
				const x = 1;
				return () => [x, delete Object.prototype];
			},
			format: 'cjs',
			out: 'module.exports=(a=>()=>[a,delete Object.prototype])(1)',
			validate(fn) {
				expect(fn()).toEqual([1, false]);
			}
		});
	});

	describe('ESM format', () => { // eslint-disable-line jest/lowercase-name
		itSerializes('strict function removes directive', {
			in() {
				return () => {
					'use strict';
					delete Object.prototype;
				};
			},
			format: 'esm',
			out: 'export default(0,()=>{delete Object.prototype})',
			validate: expectToThrowStrictError
		});

		itSerializes('sloppy function wrapped in sloppy eval', {
			in() {
				return () => delete Object.prototype;
			},
			format: 'esm',
			out: 'export default(0,eval)("()=>delete Object.prototype")',
			validate: expectNotToThrowStrictError
		});

		itSerializes('mix of strict and sloppy functions wraps sloppy functions in sloppy eval', {
			in: createMixedFunctions,
			format: 'esm',
			out: `export default[
				function strictFn1(){delete Object.prototype},
				(0,eval)("(function sloppyFn1(){return delete Object.prototype})"),
				function strictFn2(){delete Object.prototype},
				(0,eval)("(function sloppyFn2(){return delete Object.prototype})")
			]`,
			validate: validateMixedFunctions
		});

		itSerializes('strict scoped function removes directive', {
			in() {
				const x = 1;
				return () => {
					'use strict';
					return x, delete Object.prototype; // eslint-disable-line no-sequences
				};
			},
			format: 'esm',
			out: 'export default(a=>()=>(a,delete Object.prototype))(1)',
			validate: expectToThrowStrictError
		});

		itSerializes('sloppy scoped function wrapped in sloppy eval', {
			in() {
				const x = 1;
				return () => [x, delete Object.prototype];
			},
			format: 'esm',
			out: 'export default(0,eval)("a=>()=>[a,delete Object.prototype]")(1)',
			validate(fn) {
				expect(fn()).toEqual([1, false]);
			}
		});
	});

	describe('within eval', () => {
		/* eslint-disable no-eval */
		describe('direct eval', () => {
			describe('inherits strict/sloppy mode from outer environment', () => {
				itSerializes('strict mode', {
					in() {
						'use strict';
						return eval('() => delete Object.prototype');
					},
					strictEnv: false,
					out: '()=>{"use strict";return delete Object.prototype}',
					validate: expectToThrowStrictError
				});

				itSerializes('sloppy mode', {
					in() {
						return eval('() => delete Object.prototype');
					},
					strictEnv: false,
					out: '()=>delete Object.prototype',
					validate: expectNotToThrowStrictError
				});
			});

			describe('inherits strict/sloppy mode from outer environment when executing eval', () => {
				it('strict mode, throws SyntaxError for syntax illegal in strict mode', () => {
					'use strict';
					expect(() => eval('(function(x, x) { return x; })')).toThrowWithMessage(
						SyntaxError, 'Duplicate parameter name not allowed in this context'
					);
				});

				itSerializes('sloppy mode, allows syntax which would be illegal in strict mode', {
					in() {
						return eval('(function(x, x) { return x; })');
					},
					strictEnv: false,
					out: 'function(a,a){return a}',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn(1, 2)).toBe(2);
					}
				});
			});

			itSerializes('with strict mode directive renders function strict mode', {
				in() {
					return eval("'use strict'; () => delete Object.prototype");
				},
				strictEnv: false,
				out: '()=>{"use strict";return delete Object.prototype}',
				validate: expectToThrowStrictError
			});
		});

		describe('indirect eval', () => {
			describe('indirect eval always sloppy mode when outer environment', () => {
				itSerializes('strict mode', {
					in() {
						'use strict';
						return (0, eval)('() => delete Object.prototype');
					},
					strictEnv: false,
					out: '()=>delete Object.prototype',
					validate: expectNotToThrowStrictError
				});

				itSerializes('sloppy mode', {
					in() {
						return (0, eval)('() => delete Object.prototype');
					},
					strictEnv: false,
					out: '()=>delete Object.prototype',
					validate: expectNotToThrowStrictError
				});
			});

			describe('with strict mode directive renders function strict mode when outer environment', () => {
				itSerializes('strict mode', {
					in() {
						'use strict';
						return (0, eval)("'use strict'; () => delete Object.prototype");
					},
					strictEnv: false,
					out: '()=>{"use strict";return delete Object.prototype}',
					validate: expectToThrowStrictError
				});

				itSerializes('sloppy mode', {
					in() {
						return (0, eval)("'use strict'; () => delete Object.prototype");
					},
					strictEnv: false,
					out: '()=>{"use strict";return delete Object.prototype}',
					validate: expectToThrowStrictError
				});
			});
		});

		describe('functions containing direct eval', () => {
			describe('strict mode retained for function containing eval when it is', () => {
				itSerializes('strict mode', {
					in() {
						return (0, eval)("'use strict'; () => (eval('0'), delete Object.prototype)");
					},
					out: '(0,eval)("\\"use strict\\";()=>(eval(\\"0\\"),delete Object.prototype)")',
					validate: expectToThrowStrictError
				});

				itSerializes('sloppy mode', {
					in() {
						return (0, eval)("() => (eval('0'), delete Object.prototype)");
					},
					out: '(0,eval)("()=>(eval(\\"0\\"),delete Object.prototype)")',
					validate: expectNotToThrowStrictError
				});
			});

			describe(
				'strict mode retained for function in same scope as function containing eval when it is',
				() => {
					itSerializes('strict mode', {
						in() {
							return (0, eval)(`
								const ext = 1;
								[
									(() => {
										'use strict';
										return () => (ext, delete Object.prototype);
									})(),
									() => (ext, eval('0'))
								];
							`);
						},
						out: `(()=>{
							const a=(0,eval)("
								ext=>[
									()=>{\\"use strict\\";return ext,delete Object.prototype},
									()=>(ext,eval(\\"0\\"))
								]
							")(1);
							return[a[0],a[1]]
						})()`,
						validate: ([fn]) => expectToThrowStrictError(fn)
					});

					itSerializes('sloppy mode', {
						in() {
							return (0, eval)(`
								const ext = 1;
								[
									() => (ext, delete Object.prototype),
									() => (ext, eval('0'))
								];
							`);
						},
						out: `(()=>{
							const a=(0,eval)("
								ext=>[
									()=>(ext,delete Object.prototype),
									()=>(ext,eval(\\"0\\"))
								]
							")(1);
							return[a[0],a[1]]
						})()`,
						validate: ([fn]) => expectNotToThrowStrictError(fn)
					});
				}
			);

			describe('strict mode of file not affected by strict mode of function containing eval', () => {
				itSerializes('strict mode', {
					in() {
						return (0, eval)(`
							[
								() => {
									'use strict';
									return delete Object.prototype;
								},
								() => {
									'use strict';
									return delete Object.prototype;
								},
								() => (eval('0'), delete Object.prototype)
							]
						`);
					},
					strictEnv: false,
					out: `(()=>{
						"use strict";
						return[
							()=>delete Object.prototype,
							()=>delete Object.prototype,
							(0,eval)("()=>(eval(\\"0\\"),delete Object.prototype)")
						]
					})()`,
					validate([fn, fn2, evalFn]) {
						expectToThrowStrictError(fn);
						expectToThrowStrictError(fn2);
						expectNotToThrowStrictError(evalFn);
					}
				});

				itSerializes('sloppy mode', {
					in() {
						return (0, eval)(`
							[
								() => delete Object.prototype,
								() => delete Object.prototype,
								() => {
									'use strict';
									return eval('0'), delete Object.prototype;
								}
							]
						`);
					},
					strictEnv: false,
					out: `[
						()=>delete Object.prototype,
						()=>delete Object.prototype,
						(0,eval)("\\"use strict\\";()=>(eval(\\"0\\"),delete Object.prototype)")
					]`,
					validate([fn, fn2, evalFn]) {
						expectNotToThrowStrictError(fn);
						expectNotToThrowStrictError(fn2);
						expectToThrowStrictError(evalFn);
					}
				});
			});
		});
		/* eslint-enable no-eval */
	});

	describe('runtime functions', () => {
		describe('in sloppy env do not have directive added', () => {
			itSerializes('createArguments', {
				in: () => (function() { return arguments; }(1, 2, 3)), // eslint-disable-line prefer-rest-params
				strictEnv: false,
				out: 'function(){return arguments}(1,2,3)',
				validate(args) {
					expect(args).toBeArguments();
					expect(args).toHaveLength(3);
					expect(args[0]).toBe(1);
					expect(args[1]).toBe(2);
					expect(args[2]).toBe(3);
				}
			});

			itSerializes('createBinding', {
				in() {
					const obj = {};
					obj.fn = function fn() { return this; }.bind(obj);
					return obj;
				},
				strictEnv: false,
				out: `(()=>{
					const a=(a=>[
							(...b)=>a(...b),
							c=>a=c
						])(),
						b={
							fn:Object.defineProperties(a[0],{name:{value:"bound fn"}})
						};
					a[1](function fn(){return this}.bind(b));
					return b
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					const {fn} = obj;
					expect(fn).toBeFunction();
					expect(fn()).toBe(obj);
				}
			});

			itSerializes('getCallSite', {
				in() {
					const obj = {};
					const {prepareStackTrace} = Error;
					Error.prepareStackTrace = (_, stack) => stack;
					Error.captureStackTrace(obj);
					const stackItem = obj.stack[0];
					Error.prepareStackTrace = prepareStackTrace;
					return stackItem;
				},
				strictEnv: false,
				out: `Object.create(
					(()=>{
						const a={};
						const{prepareStackTrace:b}=Error;
						Error.prepareStackTrace=(c,d)=>d;
						Error.captureStackTrace(a);
						const e=a.stack[0].constructor;
						Error.prepareStackTrace=b;
						return e
					})().prototype
				)`,
				validate(obj) {
					expect(obj).toBeObject();
				}
			});
		});

		describe('in strict env do not get wrapped in eval', () => {
			itSerializes('createArguments', {
				in: () => (function() { return arguments; }(1, 2, 3)), // eslint-disable-line prefer-rest-params
				strictEnv: true,
				out: 'function(){return arguments}(1,2,3)',
				validate(args) {
					expect(args).toBeArguments();
					expect(args).toHaveLength(3);
					expect(args[0]).toBe(1);
					expect(args[1]).toBe(2);
					expect(args[2]).toBe(3);
				}
			});

			itSerializes('createBinding', {
				in() {
					'use strict';
					const obj = {};
					obj.fn = function fn() { return this; }.bind(obj);
					return obj;
				},
				strictEnv: true,
				out: `(()=>{
					const a=(a=>[
							(...b)=>a(...b),
							c=>a=c
						])(),
						b={
							fn:Object.defineProperties(a[0],{name:{value:"bound fn"}})
						};
					a[1](function fn(){return this}.bind(b));
					return b
				})()`,
				validate(obj) {
					expect(obj).toBeObject();
					const {fn} = obj;
					expect(fn).toBeFunction();
					expect(fn()).toBe(obj);
				}
			});

			itSerializes('getCallSite', {
				in() {
					const obj = {};
					const {prepareStackTrace} = Error;
					Error.prepareStackTrace = (_, stack) => stack;
					Error.captureStackTrace(obj);
					const stackItem = obj.stack[0];
					Error.prepareStackTrace = prepareStackTrace;
					return stackItem;
				},
				strictEnv: true,
				out: `Object.create(
					(()=>{
						const a={};
						const{prepareStackTrace:b}=Error;
						Error.prepareStackTrace=(c,d)=>d;
						Error.captureStackTrace(a);
						const e=a.stack[0].constructor;
						Error.prepareStackTrace=b;
						return e
					})().prototype
				)`,
				validate(obj) {
					expect(obj).toBeObject();
				}
			});
		});
	});

	describe('with code-splitting', () => {
		afterEach(resetSplitPoints);

		describe('determines strict mode in common files from format', () => {
			function createInput() {
				const shared = (0, () => {
					'use strict';
					return delete Object.prototype;
				});
				return {
					one: {x: shared},
					two: {y: shared}
				};
			}

			function validate({one, two}) {
				expectToThrowStrictError(one.x);
				expect(two.y).toBe(one.x);
			}

			itSerializesEntries('js with strictEnv false', {
				in: createInput,
				format: 'js',
				strictEnv: false,
				out: {
					'one.js': '{x:require("./common.ZNM7FYJG.js")}',
					'two.js': '{y:require("./common.ZNM7FYJG.js")}',
					'common.ZNM7FYJG.js': '"use strict";module.exports=()=>delete Object.prototype'
				},
				validate
			});

			itSerializesEntries('js with strictEnv true', {
				in: createInput,
				format: 'js',
				strictEnv: true,
				out: {
					'one.js': '{x:require("./common.ZNM7FYJG.js")}',
					'two.js': '{y:require("./common.ZNM7FYJG.js")}',
					'common.ZNM7FYJG.js': '"use strict";module.exports=()=>delete Object.prototype'
				},
				validate
			});

			itSerializesEntries('cjs', {
				in: createInput,
				format: 'cjs',
				out: {
					'one.js': 'module.exports={x:require("./common.ZNM7FYJG.js")}',
					'two.js': 'module.exports={y:require("./common.ZNM7FYJG.js")}',
					'common.ZNM7FYJG.js': '"use strict";module.exports=()=>delete Object.prototype'
				},
				validate
			});

			itSerializesEntries('esm', {
				in: createInput,
				format: 'esm',
				out: {
					'one.js': 'import a from"./common.5MGLH46L.js";export default{x:a}',
					'two.js': 'import a from"./common.5MGLH46L.js";export default{y:a}',
					'common.5MGLH46L.js': 'export default(0,()=>delete Object.prototype)'
				},
				validate
			});
		});

		describe('strict mode of each file derived independently', () => {
			function createInput() {
				const sharedStrict = (0, () => {
					'use strict';
					return delete Object.prototype;
				});
				const sharedSloppy = (0, () => delete Object.prototype);
				return {
					one: {
						strict: (0, () => {
							'use strict';
							return delete Object.prototype;
						}),
						sharedStrict,
						sharedSloppy
					},
					two: {
						sloppy: (0, () => delete Object.prototype),
						sharedStrict,
						sharedSloppy
					},
					three: {
						sharedStrict
					}
				};
			}

			function validate({one, two, three}) {
				expectToThrowStrictError(one.strict);
				expectNotToThrowStrictError(two.sloppy);
				expectToThrowStrictError(one.sharedStrict);
				expectNotToThrowStrictError(one.sharedSloppy);
				expect(two.sharedStrict).toBe(one.sharedStrict);
				expect(two.sharedSloppy).toBe(one.sharedSloppy);
				expect(three.sharedStrict).toBe(one.sharedStrict);
			}

			itSerializesEntries('format js with strictEnv false', {
				in: createInput,
				format: 'js',
				strictEnv: false,
				out: {
					'one.js': `{
						strict:(0,()=>{"use strict";return delete Object.prototype}),
						sharedStrict:require("./common.ZNM7FYJG.js"),
						sharedSloppy:require("./common.XY2LSDIE.js")
					}`,
					'two.js': `{
						sloppy:(0,()=>delete Object.prototype),
						sharedStrict:require("./common.ZNM7FYJG.js"),
						sharedSloppy:require("./common.XY2LSDIE.js")
					}`,
					'three.js': '{sharedStrict:require("./common.ZNM7FYJG.js")}',
					'common.ZNM7FYJG.js': '"use strict";module.exports=()=>delete Object.prototype',
					'common.XY2LSDIE.js': 'module.exports=()=>delete Object.prototype'
				},
				validate
			});

			itSerializesEntries('format js with strictEnv true', {
				in: createInput,
				format: 'js',
				strictEnv: true,
				out: {
					'one.js': `{
						strict:(0,()=>delete Object.prototype),
						sharedStrict:require("./common.ZNM7FYJG.js"),
						sharedSloppy:require("./common.XY2LSDIE.js")
					}`,
					'two.js': `{
						sloppy:(0,eval)("()=>delete Object.prototype"),
						sharedStrict:require("./common.ZNM7FYJG.js"),
						sharedSloppy:require("./common.XY2LSDIE.js")
					}`,
					'three.js': '{sharedStrict:require("./common.ZNM7FYJG.js")}',
					'common.ZNM7FYJG.js': '"use strict";module.exports=()=>delete Object.prototype',
					'common.XY2LSDIE.js': 'module.exports=()=>delete Object.prototype'
				},
				validate
			});

			itSerializesEntries('format cjs', {
				in: createInput,
				format: 'cjs',
				out: {
					'one.js': `
						"use strict";
						module.exports={
							strict:(0,()=>delete Object.prototype),
							sharedStrict:require("./common.ZNM7FYJG.js"),
							sharedSloppy:require("./common.XY2LSDIE.js")
						}
					`,
					'two.js': `module.exports={
						sloppy:(0,()=>delete Object.prototype),
						sharedStrict:require("./common.ZNM7FYJG.js"),
						sharedSloppy:require("./common.XY2LSDIE.js")
					}`,
					'three.js': 'module.exports={sharedStrict:require("./common.ZNM7FYJG.js")}',
					'common.ZNM7FYJG.js': '"use strict";module.exports=()=>delete Object.prototype',
					'common.XY2LSDIE.js': 'module.exports=()=>delete Object.prototype'
				},
				validate
			});

			itSerializesEntries('format esm', {
				in: createInput,
				format: 'esm',
				out: {
					'one.js': `
						import a from"./common.5MGLH46L.js";
						import b from"./common.KTMROI6E.js";
						export default{
							strict:(0,()=>delete Object.prototype),
							sharedStrict:a,
							sharedSloppy:b
						}
					`,
					'two.js': `
						import a from"./common.5MGLH46L.js";
						import b from"./common.KTMROI6E.js";
						export default{
							sloppy:(0,eval)("()=>delete Object.prototype"),
							sharedStrict:a,
							sharedSloppy:b
						}
					`,
					'three.js': 'import a from"./common.5MGLH46L.js";export default{sharedStrict:a}',
					'common.5MGLH46L.js': 'export default(0,()=>delete Object.prototype)',
					'common.KTMROI6E.js': 'export default(0,eval)("()=>delete Object.prototype")'
				},
				validate
			});
		});
	});
});

function createMixedFunctions() {
	return [
		function strictFn1() {
			'use strict';
			delete Object.prototype;
		},
		function sloppyFn1() {
			return delete Object.prototype;
		},
		function strictFn2() {
			'use strict';
			delete Object.prototype;
		},
		function sloppyFn2() {
			return delete Object.prototype;
		}
	];
}

function validateMixedFunctions(arr) {
	expect(arr).toBeArrayOfSize(4);
	const [strictFn1, sloppyFn1, strictFn2, sloppyFn2] = arr;
	expectToThrowStrictError(strictFn1);
	expectToThrowStrictError(strictFn2);
	expectNotToThrowStrictError(sloppyFn1);
	expectNotToThrowStrictError(sloppyFn2);
}

function expectToThrowStrictError(fn) {
	expect(fn).toBeFunction();
	expect(fn).toThrowWithMessage(
		TypeError, "Cannot delete property 'prototype' of function Object() { [native code] }"
	);
}

function expectNotToThrowStrictError(fn) {
	expect(fn).toBeFunction();
	expect(fn()).toBe(false);
}
