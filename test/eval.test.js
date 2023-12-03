/* --------------------
 * livepack module
 * Tests for `eval`
 * ------------------*/

/* eslint-disable no-eval */

'use strict';

// Modules
const escapeRegex = require('lodash/escapeRegExp');

// Imports
const {
	itSerializes, itSerializesEqual, tryCatch, stripSourceMapComment, stripLineBreaks
} = require('./support/index.js');

// Tests

describe('eval', () => {
	describe('serialized', () => {
		itSerializes('directly', {
			in: () => eval,
			out: 'eval',
			validateOutput: e => expect(e).toBe(global.eval)
		});

		itSerializes('in object', {
			in: () => ({e: eval}),
			out: '{e:eval}',
			validateOutput(obj) {
				expect(obj).toEqual({e: global.eval});
				expect(obj.e).toBe(global.eval);
			}
		});

		itSerializes('multiple references are de-duplicated', {
			in: () => ({e: eval, e2: eval}),
			out: '(()=>{const a=eval;return{e:a,e2:a}})()',
			validateOutput(obj) {
				expect(obj).toEqual({e: global.eval, e2: global.eval});
				expect(obj.e).toBe(global.eval);
				expect(obj.e2).toBe(global.eval);
			}
		});

		itSerializes('in function scope', {
			in() {
				const e = eval;
				return () => e;
			},
			out: '(a=>()=>a)(eval)',
			validateOutput(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(global.eval);
			}
		});
	});

	describe('evaluated before serialization', () => {
		describe('`eval()`', () => {
			describe('values', () => {
				itSerializesEqual('literal', {
					in: () => eval('123'),
					out: '123',
					validate: num => expect(num).toBe(123)
				});

				itSerializesEqual('unscoped', {
					in: () => eval('({x: 1})'),
					out: '{x:1}',
					validate: obj => expect(obj).toEqual({x: 1})
				});

				itSerializesEqual('external vars', {
					in() {
						let val;
						const extA = {x: 1}; // eslint-disable-line no-unused-vars
						{
							const extB = {y: 2}; // eslint-disable-line no-unused-vars
							val = eval('[extA, extB]');
						}
						return val;
					},
					out: '[{x:1},{y:2}]',
					validate: arr => expect(arr).toEqual([{x: 1}, {y: 2}])
				});

				describe('`this`', () => {
					itSerializesEqual('from enclosing function', {
						in() {
							function outer() {
								return eval('this');
							}
							return outer.call({x: 1});
						},
						out: '{x:1}',
						validate: obj => expect(obj).toEqual({x: 1})
					});

					itSerializesEqual('from within arrow functions', {
						in() {
							function outer() {
								return () => () => eval('this');
							}
							return outer.call({x: 1})()();
						},
						out: '{x:1}',
						validate: obj => expect(obj).toEqual({x: 1})
					});
				});

				describe('`arguments`', () => {
					itSerializesEqual('from enclosing function', {
						in() {
							function outer() {
								return eval('arguments');
							}
							return outer({x: 1}, {y: 2});
						},
						out: 'function(){return arguments}({x:1},{y:2})',
						validate(args) {
							expect(args).toBeArguments();
							expect(args).toHaveLength(2);
							expect(args[0]).toEqual({x: 1});
							expect(args[1]).toEqual({y: 2});
						}
					});

					itSerializesEqual('from within arrow functions', {
						in() {
							function outer() {
								return () => () => eval('arguments');
							}
							return outer({x: 1}, {y: 2})()();
						},
						out: 'function(){return arguments}({x:1},{y:2})',
						validate(args) {
							expect(args).toBeArguments();
							expect(args).toHaveLength(2);
							expect(args[0]).toEqual({x: 1});
							expect(args[1]).toEqual({y: 2});
						}
					});
				});

				describe('`new.target`', () => {
					itSerializes('from enclosing function', {
						in() {
							function outer() {
								return eval('new.target');
							}
							// eslint-disable-next-line prefer-arrow-callback
							return Reflect.construct(outer, [], function() { return 1; });
						},
						out: 'function(){return 1}',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(1);
						}
					});

					itSerializes('from within arrow functions', {
						in() {
							function outer() {
								return () => () => eval('new.target');
							}
							// eslint-disable-next-line prefer-arrow-callback
							return Reflect.construct(outer, [], function() { return 1; })()();
						},
						out: 'function(){return 1}',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(1);
						}
					});
				});

				describe('`super`', () => {
					describe('in object literal method', () => {
						itSerializesEqual('with no prefix num change', {
							in() {
								const obj = {
									meth() {
										return eval('super.meth()');
									},
									__proto__: {
										meth() { return 123; }
									}
								};
								return obj.meth();
							},
							out: '123'
						});

						itSerializesEqual('with prefix num change', {
							in() {
								const obj = {
									meth() {
										return eval('let livepack_tracker; super.meth()');
									},
									__proto__: {
										meth() { return 123; }
									}
								};
								return obj.meth();
							},
							out: '123'
						});
					});

					describe('in class prototype method', () => {
						/* eslint-disable class-methods-use-this */
						itSerializesEqual('with no prefix num change', {
							in() {
								class S {
									meth() { return 123; }
								}
								class C extends S {
									meth() {
										return eval('super.meth()');
									}
								}
								const obj = new C();
								return obj.meth();
							},
							out: '123'
						});

						itSerializesEqual('with prefix num change', {
							in() {
								class S {
									meth() { return 123; }
								}
								class C extends S {
									meth() {
										return eval('let livepack_tracker; super.meth()');
									}
								}
								const obj = new C();
								return obj.meth();
							},
							out: '123'
						});
						/* eslint-enable class-methods-use-this */
					});

					describe('in class static method', () => {
						itSerializesEqual('with no prefix num change', {
							in() {
								class S {
									static meth() { return 123; }
								}
								class C extends S {
									static meth() {
										return eval('super.meth()');
									}
								}
								return C.meth();
							},
							out: '123'
						});

						itSerializesEqual('with prefix num change', {
							in() {
								class S {
									static meth() { return 123; }
								}
								class C extends S {
									static meth() {
										return eval('let livepack_tracker; super.meth()');
									}
								}
								return C.meth();
							},
							out: '123'
						});
					});

					describe('in class constructor', () => {
						/* eslint-disable class-methods-use-this, constructor-super */
						itSerializesEqual('with no prefix num change', {
							in() {
								class S {
									constructor() { this.x = 456; }
									meth() { return 123; }
								}
								class C extends S {
									constructor() {
										eval('super()');
										eval('this.n = super.meth();');
									}
								}
								const obj = new C();
								return [obj.n, obj.x];
							},
							out: '[123,456]'
						});

						itSerializesEqual('with prefix num change', {
							in() {
								class S {
									constructor() { this.x = 456; }
									meth() { return 123; }
								}
								class C extends S {
									constructor() {
										eval('let livepack_tracker; super()');
										eval('let livepack1_tracker; this.n = super.meth()');
									}
								}
								const obj = new C();
								return [obj.n, obj.x];
							},
							out: '[123,456]'
						});
						/* eslint-enable class-methods-use-this, constructor-super */
					});
				});
			});

			describe('functions', () => {
				itSerializes('returning literal', {
					in: () => eval('() => 123'),
					out: '()=>123',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(123);
					}
				});

				itSerializes('returning unscoped', {
					in: () => eval('() => ({x: 1})'),
					out: '()=>({x:1})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual({x: 1});
					}
				});

				itSerializes('returning var local to eval', {
					in: () => eval('const x = {x: 1}; () => x'),
					out: '(a=>()=>a)({x:1})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual({x: 1});
					}
				});

				itSerializes('returning external vars', {
					in() {
						let fn;
						const extA = {x: 1}; // eslint-disable-line no-unused-vars
						{
							const extB = {y: 2}; // eslint-disable-line no-unused-vars
							fn = eval('() => [extA, extB]');
						}
						return fn;
					},
					out: '(b=>a=>()=>[b,a])({x:1})({y:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{x: 1}, {y: 2}]);
					}
				});

				describe('returning `this`', () => {
					itSerializes('from enclosing function', {
						in() {
							function outer() {
								return eval('() => this');
							}
							return outer.call({x: 1});
						},
						out: '(a=>()=>a)({x:1})',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					});

					itSerializes('from within arrow functions', {
						in() {
							function outer() {
								return () => () => eval('() => this');
							}
							return outer.call({x: 1})()();
						},
						out: '(a=>()=>a)({x:1})',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					});

					itSerializes('from within function inside eval', {
						in() {
							function outer() {
								return eval('(function() { return this; })');
							}
							return outer.call({x: 1});
						},
						out: 'function(){return this}',
						validate(fn) {
							expect(fn).toBeFunction();
							const ctx = {y: 2};
							expect(fn.call(ctx)).toBe(ctx);
						}
					});
				});

				describe('returning `arguments`', () => {
					itSerializes('from enclosing function', {
						in() {
							function outer() {
								return eval('() => arguments');
							}
							return outer({x: 1}, {y: 2});
						},
						out: '(a=>()=>a)(function(){return arguments}({x:1},{y:2}))',
						validate(fn) {
							expect(fn).toBeFunction();
							const args = fn();
							expect(args).toBeArguments();
							expect(args).toHaveLength(2);
							expect(args[0]).toEqual({x: 1});
							expect(args[1]).toEqual({y: 2});
						}
					});

					itSerializes('from within arrow functions', {
						in() {
							function outer() {
								return () => () => eval('() => arguments');
							}
							return outer({x: 1}, {y: 2})()();
						},
						out: '(a=>()=>a)(function(){return arguments}({x:1},{y:2}))',
						validate(fn) {
							expect(fn).toBeFunction();
							const args = fn();
							expect(args).toBeArguments();
							expect(args).toHaveLength(2);
							expect(args[0]).toEqual({x: 1});
							expect(args[1]).toEqual({y: 2});
						}
					});

					itSerializes('from within function inside eval', {
						in() {
							function outer() {
								return eval('(function() { return arguments; })');
							}
							return outer({a: 1}, {b: 2});
						},
						out: 'function(){return arguments}',
						validate(fn) {
							expect(fn).toBeFunction();
							const arg1 = {x: 1},
								arg2 = {y: 2};
							const args = fn(arg1, arg2);
							expect(args).toBeArguments();
							expect(args).toHaveLength(2);
							expect(args[0]).toBe(arg1);
							expect(args[1]).toBe(arg2);
						}
					});
				});

				describe('returning `new.target`', () => {
					itSerializes('from enclosing function', {
						in() {
							function outer() {
								return eval('() => new.target');
							}
							// eslint-disable-next-line prefer-arrow-callback
							return Reflect.construct(outer, [], function() { return 1; });
						},
						out: '(a=>()=>a)(function(){return 1})',
						validate(fn) {
							expect(fn).toBeFunction();
							const inner = fn();
							expect(inner).toBeFunction();
							expect(inner()).toBe(1);
						}
					});

					itSerializes('from within arrow functions', {
						in() {
							function outer() {
								return () => () => eval('() => new.target');
							}
							// eslint-disable-next-line prefer-arrow-callback
							return Reflect.construct(outer, [], function() { return 1; })()();
						},
						out: '(a=>()=>a)(function(){return 1})',
						validate(fn) {
							expect(fn).toBeFunction();
							const inner = fn();
							expect(inner).toBeFunction();
							expect(inner()).toBe(1);
						}
					});

					itSerializes('from within function inside eval', {
						in() {
							function outer() {
								return eval('(function() { return new.target; })');
							}
							return outer();
						},
						out: 'function(){return new.target}',
						validate(fn) {
							expect(fn).toBeFunction();
							const ctor = function() { return 1; };
							expect(Reflect.construct(fn, [], ctor)).toBe(ctor);
						}
					});
				});

				describe('using `super`', () => {
					describe('in object literal method', () => {
						itSerializesEqual('with no prefix num change', {
							in() {
								const obj = {
									meth() {
										return eval('() => super.meth()');
									},
									__proto__: {
										meth() { return 123; }
									}
								};
								return obj.meth()();
							},
							out: '123'
						});

						itSerializesEqual('with prefix num change', {
							in() {
								const obj = {
									meth() {
										return eval('let livepack_tracker; () => super.meth()');
									},
									__proto__: {
										meth() { return 123; }
									}
								};
								return obj.meth()();
							},
							out: '123'
						});
					});

					describe('in class prototype method', () => {
						/* eslint-disable class-methods-use-this */
						itSerializesEqual('with no prefix num change', {
							in() {
								class S {
									meth() { return 123; }
								}
								class C extends S {
									meth() {
										return eval('() => super.meth()');
									}
								}
								const obj = new C();
								return obj.meth()();
							},
							out: '123'
						});

						itSerializesEqual('with prefix num change', {
							in() {
								class S {
									meth() { return 123; }
								}
								class C extends S {
									meth() {
										return eval('let livepack_tracker; () => super.meth()');
									}
								}
								const obj = new C();
								return obj.meth()();
							},
							out: '123'
						});
						/* eslint-enable class-methods-use-this */
					});

					describe('in class static method', () => {
						itSerializesEqual('with no prefix num change', {
							in() {
								class S {
									static meth() { return 123; }
								}
								class C extends S {
									static meth() {
										return eval('() => super.meth()');
									}
								}
								return C.meth()();
							},
							out: '123'
						});

						itSerializesEqual('with prefix num change', {
							in() {
								class S {
									static meth() { return 123; }
								}
								class C extends S {
									static meth() {
										return eval('let livepack_tracker; () => super.meth()');
									}
								}
								return C.meth()();
							},
							out: '123'
						});
					});

					describe('in class constructor', () => {
						/* eslint-disable class-methods-use-this, constructor-super, no-this-before-super */
						itSerializesEqual('with no prefix num change', {
							in() {
								class S {
									constructor() { this.x = 456; }
									meth() { return 123; }
								}
								class C extends S {
									constructor() {
										const callSuper = eval('() => super()');
										callSuper();
										this.f = eval('() => super.meth()');
									}
								}
								const obj = new C();
								return [obj.f(), obj.x];
							},
							out: '[123,456]'
						});

						itSerializesEqual('with prefix num change', {
							in() {
								class S {
									constructor() { this.x = 456; }
									meth() { return 123; }
								}
								class C extends S {
									constructor() {
										const callSuper = eval('let livepack_tracker; () => super()');
										callSuper();
										this.f = eval('let livepack1_tracker; () => super.meth()');
									}
								}
								const obj = new C();
								return [obj.f(), obj.x];
							},
							out: '[123,456]'
						});
						/* eslint-enable class-methods-use-this, constructor-super, no-this-before-super */
					});
				});

				describe('multiple `eval()`s do not confuse scopes', () => {
					itSerializes('in 1 function, called multiple times', {
						in() {
							function create(ext) { // eslint-disable-line no-unused-vars
								return eval('() => ext');
							}
							return [
								create({x: 1}),
								create({y: 2}),
								create({z: 3})
							];
						},
						out: `(()=>{
							const a=a=>[
								()=>a,
								()=>a,
								()=>a
							];
							return[
								a({x:1})[0],
								a({y:2})[1],
								a({z:3})[2]
							]
						})()`,
						validate(arr) {
							expect(arr).toBeArrayOfSize(3);
							const [fn1, fn2, fn3] = arr;
							expect(fn1).toBeFunction();
							expect(fn1()).toEqual({x: 1});
							expect(fn2).toBeFunction();
							expect(fn2()).toEqual({y: 2});
							expect(fn3).toBeFunction();
							expect(fn3()).toEqual({z: 3});
						}
					});

					itSerializes('in different functions', {
						in() {
							function createA(ext) { // eslint-disable-line no-unused-vars
								return eval('() => ext');
							}
							function createB(ext) { // eslint-disable-line no-unused-vars
								return eval('() => ext');
							}
							function createC(ext) { // eslint-disable-line no-unused-vars
								return eval('() => ext');
							}
							return [
								createA({x: 1}),
								createB({y: 2}),
								createC({z: 3})
							];
						},
						out: '[(a=>()=>a)({x:1}),(a=>()=>a)({y:2}),(a=>()=>a)({z:3})]',
						validate(arr) {
							expect(arr).toBeArrayOfSize(3);
							const [fn1, fn2, fn3] = arr;
							expect(fn1).toBeFunction();
							expect(fn1()).toEqual({x: 1});
							expect(fn2).toBeFunction();
							expect(fn2()).toEqual({y: 2});
							expect(fn3).toBeFunction();
							expect(fn3()).toEqual({z: 3});
						}
					});
				});

				// These tests don't work due to https://github.com/overlookmotel/livepack/issues/102
				// TODO: Uncomment these tests once that issue resolved.
				// eslint-disable-next-line jest/no-commented-out-tests
				/*
				describe('defined in method key', () => {
					itSerializes('in function', {
						in() {
							let fn;
							const ext = {x: 1}; // eslint-disable-line no-unused-vars
							const obj = { // eslint-disable-line no-unused-vars
								[fn = eval('() => ext')]() {}
							};
							return fn;
						},
						out: '(a=>()=>a)({x:1})',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					});

					itSerializes('at top level', {
						in: `
							let fn;
							const ext = {x: 1};
							const obj = {
								[fn = eval('() => ext')]() {}
							};
							module.exports = fn;
						`,
						out: '(a=>()=>a)({x:1})',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					});
				});
				*/
			});

			describe('multi-statement eval', () => {
				describe('with no prefix change', () => {
					itSerializesEqual('with expression as last statement', {
						in: () => eval('const a = 123; a;'),
						out: '123',
						validate: num => expect(num).toBe(123)
					});

					itSerializesEqual('with statement as last statement', {
						in: () => eval('const a = 123; if (true) { a; } else { false; }'),
						out: '123',
						validate: num => expect(num).toBe(123)
					});
				});

				describe('with prefix change', () => {
					itSerializes('with expression as last statement', {
						in: `
							'use strict';
							const livepack_tracker = 123;
							module.exports = eval('let ext = 456; () => [livepack_tracker, ext];');
						`,
						out: '(b=>a=>()=>[b,a])(123)(456)',
						validate(fn, {transpiled}) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([123, 456]);

							// Sanity check: Ensure var used has changed prefix outside eval
							expect(transpiled).toInclude('const [livepack1_tracker, livepack1_getScopeId] = require(');
						}
					});

					itSerializes('with statement as last statement', {
						in: `
							'use strict';
							const livepack_tracker = 123;
							module.exports = eval('let ext = 456; if (true) { () => [livepack_tracker, ext]; } else { false; }');
						`,
						out: '(b=>a=>()=>[b,a])(123)(456)',
						validate(fn, {transpiled}) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([123, 456]);

							// Sanity check: Ensure var used has changed prefix outside eval
							expect(transpiled).toInclude('const [livepack1_tracker, livepack1_getScopeId] = require(');
						}
					});
				});
			});

			describe('called with', () => {
				// Tests instrumentation does not change behavior
				itSerializes('spread element acts as indirect eval', {
					in() {
						const x = 123; // eslint-disable-line no-unused-vars
						return eval(...['() => x']);
					},
					strictEnv: false,
					out: '()=>x',
					validate(fn) {
						expect(fn).toBeFunction();
						try {
							const globalX = {};
							global.x = globalX;
							expect(fn()).toBe(globalX);
						} finally {
							delete global.x;
						}
					}
				});

				itSerializes('multiple arguments acts as direct eval', {
					in() {
						const x = 123; // eslint-disable-line no-unused-vars
						return eval('() => x', 456, 789);
					},
					out: '(a=>()=>a)(123)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(123);
					}
				});

				itSerializes('multiple arguments with spread acts as direct eval', {
					in() {
						const x = 123; // eslint-disable-line no-unused-vars
						return eval('() => x', ...[456, 789]);
					},
					out: '(a=>()=>a)(123)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(123);
					}
				});
			});

			it('throws if invalid eval code', () => {
				const err = tryCatch(() => eval('return 123;'));
				expect(err).toBeInstanceOf(SyntaxError);
				expect(err.message).toBe('Illegal return statement');

				// Check stack trace does not include internal Livepack code
				const stackLines = err.stack.split(/\r?\n/);
				expect(stackLines[0]).toBe('SyntaxError: Illegal return statement');
				expect(stackLines[1]).toMatch(new RegExp(`\\s+at fn \\(${escapeRegex(__filename)}:\\d+:\\d+\\)`));
			});

			describe('handles internal var name prefixes', () => {
				itSerializes('altered external to eval', {
					in: `
						'use strict';
						const livepack_tracker = 1;
						module.exports = eval('() => livepack_tracker');
					`,
					out: '(a=>()=>a)(1)',
					validate(fn, {transpiled}) {
						expect(fn()).toBe(1);

						// Sanity check: Ensure var used has changed prefix outside eval
						expect(transpiled).toInclude('const [livepack1_tracker, livepack1_getScopeId] = require(');
					}
				});

				itSerializes('altered internal to eval', {
					in: `
						'use strict';
						module.exports = eval('const livepack_tracker = 1; () => livepack_tracker');
					`,
					out: '(a=>()=>a)(1)',
					validate(fn, {transpiled}) {
						expect(fn()).toBe(1);

						// Sanity check: Ensure var used has not changed prefix outside eval
						expect(transpiled).toInclude('const [livepack_tracker, livepack_getScopeId] = require(');
					}
				});

				itSerializes('altered internal and external to eval, matched prefixes', {
					in: `
						'use strict';
						const livepack_tracker = 1;\n
						module.exports = eval('const livepack_tracker = 2; () => livepack_tracker');
					`,
					out: '(a=>()=>a)(2)',
					validate(fn, {transpiled}) {
						expect(fn()).toBe(2);

						// Sanity check: Ensure var used has changed prefix outside eval
						expect(transpiled).toInclude('const [livepack1_tracker, livepack1_getScopeId] = require(');
					}
				});

				itSerializes('altered internal and external to eval, unmatched prefixes', {
					in: `
						'use strict';
						const livepack_tracker = 1;
						module.exports = eval('const livepack1_tracker = 2; () => [livepack_tracker, livepack1_tracker]');
					`,
					out: '(b=>a=>()=>[b,a])(1)(2)',
					validate(fn, {transpiled}) {
						expect(fn()).toEqual([1, 2]);

						// Sanity check: Ensure var used has changed prefix outside eval
						expect(transpiled).toInclude('const [livepack1_tracker, livepack1_getScopeId] = require(');
					}
				});
			});
		});

		describe('indirect `eval`', () => {
			describe('values', () => {
				itSerializesEqual('can evaluate literal', {
					in: () => (0, eval)('123'),
					out: '123',
					validate: num => expect(num).toBe(123)
				});

				itSerializesEqual('can evaluate unscoped object value', {
					in: () => (0, eval)('({x: 1})'),
					out: '{x:1}',
					validate: obj => expect(obj).toEqual({x: 1})
				});

				itSerializesEqual('can evaluate var local to eval', {
					in: () => (0, eval)('const x = 123; x'),
					out: '123',
					validate: num => expect(num).toBe(123)
				});

				itSerializesEqual('cannot access external vars', {
					in() {
						const extA = {x: 1}; // eslint-disable-line no-unused-vars
						return (0, eval)('typeof extA');
					},
					out: '"undefined"',
					validate: ext => expect(ext).toBe('undefined')
				});

				itSerializesEqual('cannot access external `this`', {
					in() {
						function outer() {
							return (0, eval)('this');
						}
						return outer.call({x: 1});
					},
					out: 'globalThis',
					validate: glob => expect(glob).toBe(global)
				});

				itSerializesEqual('cannot access external `arguments`', {
					in() {
						function outer() {
							return (0, eval)('typeof arguments');
						}
						return outer(1, 2, 3);
					},
					out: '"undefined"',
					validate: args => expect(args).toBe('undefined')
				});
			});

			describe('functions', () => {
				itSerializes('returning literal', {
					in: () => (0, eval)('() => 123'),
					strictEnv: false,
					out: '()=>123',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(123);
					}
				});

				itSerializes('returning unscoped', {
					in: () => (0, eval)('() => ({x: 1})'),
					strictEnv: false,
					out: '()=>({x:1})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual({x: 1});
					}
				});

				itSerializes('returning var local to eval', {
					in: () => (0, eval)('const x = {x: 1}; () => x'),
					strictEnv: false,
					out: '(a=>()=>a)({x:1})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual({x: 1});
					}
				});

				itSerializes('cannot access external vars', {
					in() {
						const extA = {x: 1}; // eslint-disable-line no-unused-vars
						return (0, eval)('() => typeof extA');
					},
					strictEnv: false,
					out: '()=>typeof extA',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe('undefined');
					}
				});

				itSerializes('cannot access external `this`', {
					in() {
						function outer() {
							return (0, eval)('() => this');
						}
						return outer.call({x: 1});
					},
					strictEnv: false,
					out: '()=>this',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(global);
					}
				});

				itSerializes('cannot access external `arguments`', {
					// This test is incompete. Only tests that the value returned from function
					// is *not* the arguments object of the outer function.
					// It doesn't test what it is, because it's not performing exactly right.
					// It's picking up the `arguments` object of the CJS loader function wrapping this module.
					// TODO: Fix this.
					in() {
						function outer() {
							return (0, eval)("() => typeof arguments === 'undefined' ? undefined : arguments");
						}
						return outer(1, 2, 3);
					},
					strictEnv: false,
					out: '()=>typeof arguments==="undefined"?undefined:arguments',
					validate(fn, {isOutput}) {
						expect(fn).toBeFunction();
						if (isOutput) expect(fn()[0]).not.toBe(1);
					}
				});
			});

			describe('multi-statement eval', () => {
				itSerializesEqual('with expression as last statement', {
					in: () => (0, eval)('const a = 123; a;'),
					out: '123',
					validate: num => expect(num).toBe(123)
				});

				itSerializesEqual('with statement as last statement', {
					in: () => (0, eval)('const a = 123; if (true) { a; } else { false; }'),
					out: '123',
					validate: num => expect(num).toBe(123)
				});
			});
		});
	});

	describe('in functions which are serialized', () => {
		describe('`eval()`', () => {
			describe('values', () => {
				const input = `
					const extA = 1;
					const outer = (0, function() {
						const extB = 2;
						return () => {
							const extC = 3;
							return eval('({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})');
						};
					});
					outer.isOuter = true;

					const extD = 4;

					module.exports = outer.call({x: 7}, 8, 9, 10);

					if (true) {
						var extE = 5;
						const extF = 6;
					}
				`;

				itSerializes('serializes correctly', {
					in: input,
					out: `(()=>{
						const a={},
							b=(0,eval)("
								(module,exports)=>(extA,extD,extE,outer)=>[
									outer=(0,function(){
										const extB=2;
										return()=>{
											const extC=3;
											return eval(\\"({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})\\")
										}
									}),
									(_a,_b)=>function(){
										return extB=>()=>{
											const extC=3;
											return eval(\\"({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})\\")
										}
									}.apply(_a,_b)
								]
							")(a,{})(1,4,5),
							c=b[1](
								{x:7},
								function(){
									return arguments
								}(8,9,10)
							)(2);
						a.exports=c;
						Object.assign(b[0],{isOuter:true});
						return c
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBeObject();
					}
				});

				itSerializes('can access vars from internal scope', {
					in: input,
					validate: fn => expect(fn().extC).toBe(3)
				});

				itSerializes('can access vars from immediate upper scope', {
					in: input,
					validate: fn => expect(fn().extB).toBe(2)
				});

				itSerializes('can access vars from further upper scope', {
					in: input,
					validate(fn) {
						const res = fn();
						expect(res.extA).toBe(1);
						expect(res.outer).toBeFunction();
						expect(res.outer.isOuter).toBeTrue();
					}
				});

				itSerializes('can access vars declared later in file', {
					in: input,
					validate: fn => expect(fn().extD).toBe(4)
				});

				itSerializes('can access vars declared with `var` in block nested in root', {
					in: input,
					validate: fn => expect(fn().extE).toBe(5)
				});

				itSerializes('cannot access vars declared with `const` in block nested in root', {
					in: input,
					validate: fn => expect(fn().typeofExtF).toBe('undefined')
				});

				itSerializes('can access `this` from external context', {
					in: input,
					validate: fn => expect(fn().this).toEqual({x: 7})
				});

				itSerializes('can access `arguments` from external context', {
					in: input,
					validate(fn) {
						const args = fn().arguments;
						expect(args).toBeArguments();
						expect(args).toHaveLength(3);
						expect(args[0]).toBe(8);
						expect(args[1]).toBe(9);
						expect(args[2]).toBe(10);
					}
				});
			});

			describe('values without context', () => {
				const input = `
					const extA = 1;
					const outer = (0, function() {
						const extB = 2;
						return function() {
							const extC = 3;
							return eval('({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})');
						};
					});
					outer.isOuter = true;

					const extD = 4;

					module.exports = outer.call({x: 7}, 8, 9, 10);

					if (true) {
						var extE = 5;
						const extF = 6;
					}
				`;

				itSerializes('serializes correctly', {
					in: input,
					out: `(()=>{
						const a={},
							b=(0,eval)("
								(module,exports)=>(extA,extD,extE,outer)=>[
									outer=(0,function(){
										const extB=2;
										return function(){
											const extC=3;
											return eval(\\"({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})\\")
										}
									}),
									extB=>function(){
										const extC=3;
										return eval(\\"({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})\\")
									}
								]
							")(a,{})(1,4,5),
							c=b[1](2);
						a.exports=c;
						Object.assign(b[0],{isOuter:true});
						return c
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBeObject();
					}
				});

				itSerializes('can access vars from internal scope', {
					in: input,
					validate: fn => expect(fn().extC).toBe(3)
				});

				itSerializes('can access vars from immediate upper scope', {
					in: input,
					validate: fn => expect(fn().extB).toBe(2)
				});

				itSerializes('can access vars from further upper scope', {
					in: input,
					validate(fn) {
						const res = fn();
						expect(res.extA).toBe(1);
						expect(res.outer).toBeFunction();
						expect(res.outer.isOuter).toBeTrue();
					}
				});

				itSerializes('can access vars declared later in file', {
					in: input,
					validate: fn => expect(fn().extD).toBe(4)
				});

				itSerializes('can access vars declared with `var` in block nested in root', {
					in: input,
					validate: fn => expect(fn().extE).toBe(5)
				});

				itSerializes('cannot access vars declared with `const` in block nested in root', {
					in: input,
					validate: fn => expect(fn().typeofExtF).toBe('undefined')
				});

				itSerializes('cannot access `this` from external context', {
					in: input,
					validate: fn => expect(fn.call({y: 77}).this).toEqual({y: 77})
				});

				itSerializes('cannot access `arguments` from external context', {
					in: input,
					validate(fn) {
						const args = fn(88, 99, 1010).arguments;
						expect(args).toBeArguments();
						expect(args).toHaveLength(3);
						expect(args[0]).toBe(88);
						expect(args[1]).toBe(99);
						expect(args[2]).toBe(1010);
					}
				});
			});

			describe('`super`', () => {
				describe('in object literal method', () => {
					itSerializes('with no prefix num change', {
						in: `
							'use strict';
							const obj = {
								meth() {
									return eval('() => super.meth()');
								},
								__proto__: {
									meth() { return 123; }
								}
							};
							module.exports = obj.meth();
							delete obj.meth;
						`,
						out: `(()=>{
							const a=Object.create({meth(){return 123}});
							return(
								b=>a=>()=>Reflect.get(Object.getPrototypeOf(b),"meth",a).call(a)
							)(a)(a)
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					});

					itSerializes('with prefix num change', {
						in: `
							'use strict';
							const obj = {
								meth() {
									return eval('let livepack_tracker; () => super.meth()');
								},
								__proto__: {
									meth() { return 123; }
								}
							};
							module.exports = obj.meth();
							delete obj.meth;
						`,
						out: `(()=>{
							const a=Object.create({meth(){return 123}});
							return(
								b=>a=>()=>Reflect.get(Object.getPrototypeOf(b),"meth",a).call(a)
							)(a)(a)
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					});
				});

				describe('in class prototype method', () => {
					itSerializes('with no prefix num change', {
						in: `
							class S {
								meth() { return 123; }
							}
							class C extends S {
								meth() {
									return eval('() => super.meth()');
								}
							}
							const obj = new C();
							module.exports = obj.meth();
							delete C.prototype.meth;
						`,
						out: `(()=>{
							const a=Object,
								b=a.setPrototypeOf,
								c=class S{},
								d=c.prototype,
								e=b(class C extends class{}{},c),
								f=e.prototype;
							a.defineProperties(d,{
								meth:{value:{meth(){return 123}}.meth,writable:true,configurable:true}
							});
							b(f,d);
							return(
								b=>a=>()=>Reflect.get(Object.getPrototypeOf(b.prototype),"meth",a).call(a)
							)(e)(a.create(f))
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					});

					itSerializes('with prefix num change', {
						in: `
							class S {
								meth() { return 123; }
							}
							class C extends S {
								meth() {
									return eval('let livepack_tracker; () => super.meth()');
								}
							}
							const obj = new C();
							module.exports = obj.meth();
							delete C.prototype.meth;
						`,
						out: `(()=>{
							const a=Object,
								b=a.setPrototypeOf,
								c=class S{},
								d=c.prototype,
								e=b(class C extends class{}{},c),
								f=e.prototype;
							a.defineProperties(d,{
								meth:{value:{meth(){return 123}}.meth,writable:true,configurable:true}
							});
							b(f,d);
							return(
								b=>a=>()=>Reflect.get(Object.getPrototypeOf(b.prototype),"meth",a).call(a)
							)(e)(a.create(f))
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					});
				});

				describe('in class static method', () => {
					itSerializes('with no prefix num change', {
						in: `
							class S {
								static meth() { return 123; }
							}
							class C extends S {
								static meth() {
									return eval('() => super.meth()');
								}
							}
							module.exports = C.meth();
							delete C.meth;
						`,
						out: `(()=>{
							const a=Object,
								b=a.setPrototypeOf,
								c=a.defineProperties(
									class S{},
									{meth:{value:{meth(){return 123}}.meth,writable:true,configurable:true}}
								),
								d=b(class C extends class{}{},c);
							b(d.prototype,c.prototype);
							return(
								b=>a=>()=>Reflect.get(Object.getPrototypeOf(b),"meth",a).call(a)
							)(d)(d)
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					});

					itSerializes('with prefix num change', {
						in: `
							class S {
								static meth() { return 123; }
							}
							class C extends S {
								static meth() {
									return eval('let livepack_tracker; () => super.meth()');
								}
							}
							module.exports = C.meth();
							delete C.meth;
						`,
						out: `(()=>{
							const a=Object,
								b=a.setPrototypeOf,
								c=a.defineProperties(
									class S{},
									{meth:{value:{meth(){return 123}}.meth,writable:true,configurable:true}}
								),
								d=b(class C extends class{}{},c);
							b(d.prototype,c.prototype);
							return(
								b=>a=>()=>Reflect.get(Object.getPrototypeOf(b),"meth",a).call(a)
							)(d)(d)
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					});
				});

				describe('in class constructor', () => {
					itSerializes('with no prefix num change', {
						in: `
							class S {
								meth() { return 123; }
							}
							class C extends S {
								constructor(module, exports, S, obj) {
									super();
									this.f = eval('() => super.meth()');
								}
							}
							const obj = new C();
							delete C.prototype.meth;
							module.exports = obj.f;
							delete obj.f;
						`,
						out: `(()=>{
							const a=Object,
								b=a.setPrototypeOf,
								c=class S{},
								d=c.prototype,
								e=b(
									(0,eval)("(class C extends class{}{constructor(module,exports,S,obj){super();this.f=eval(\\"() => super.meth()\\")}})"),
									c
								),
								f=e.prototype;
							a.defineProperties(d,{
								meth:{value:{meth(){return 123}}.meth,writable:true,configurable:true}
							});
							b(f,d);
							return(
								b=>a=>()=>Reflect.get(Object.getPrototypeOf(b.prototype),"meth",a).call(a)
							)(e)(a.create(f))
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					});

					itSerializes('with prefix num change', {
						in: `
							class S {
								meth() { return 123; }
							}
							class C extends S {
								constructor(module, exports, S, obj) {
									super();
									this.f = eval('let livepack_tracker; () => super.meth()');
								}
							}
							const obj = new C();
							delete C.prototype.meth;
							module.exports = obj.f;
							delete obj.f;
						`,
						out: `(()=>{
							const a=Object,
								b=a.setPrototypeOf,
								c=class S{},
								d=c.prototype,
								e=b(
									(0,eval)("(class C extends class{}{constructor(module,exports,S,obj){super();this.f=eval(\\"let livepack_tracker; () => super.meth()\\")}})"),
									c
								),
								f=e.prototype;
							a.defineProperties(d,{
								meth:{value:{meth(){return 123}}.meth,writable:true,configurable:true}
							});
							b(f,d);
							return(
								b=>a=>()=>Reflect.get(Object.getPrototypeOf(b.prototype),"meth",a).call(a)
							)(e)(a.create(f))
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					});
				});
			});

			describe('functions', () => {
				const input = `
					const extA = 1;
					const outer = (0, function() {
						const extB = 2;
						return () => {
							const extC = 3;
							return eval('() => ({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})');
						};
					});
					outer.isOuter = true;

					const extD = 4;

					module.exports = outer.call({x: 7}, 8, 9, 10);

					if (true) {
						var extE = 5;
						const extF = 6;
					}
				`;

				itSerializes('serializes correctly', {
					in: input,
					out: `(()=>{
						const a={},
							b=(0,eval)("
								(module,exports)=>(extA,extD,extE,outer)=>[
									outer=(0,function(){
										const extB=2;
										return()=>{
											const extC=3;
											return eval(\\"() => ({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})\\")
										}
									}),
									(_a,_b)=>function(){
										return extB=>()=>{
											const extC=3;
											return eval(\\"() => ({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})\\")
										}
									}.apply(_a,_b)
								]
							")(a,{})(1,4,5),
							c=b[1](
								{x:7},
								function(){
									return arguments
								}(8,9,10)
							)(2);
						a.exports=c;
						Object.assign(b[0],{isOuter:true});
						return c
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn();
						expect(fnInner).toBeFunction();
						expect(fnInner()).toBeObject();
					}
				});

				itSerializes('can access vars from internal scope', {
					in: input,
					validate: fn => expect(fn()().extC).toBe(3)
				});

				itSerializes('can access vars from immediate upper scope', {
					in: input,
					validate: fn => expect(fn()().extB).toBe(2)
				});

				itSerializes('can access vars from further upper scope', {
					in: input,
					validate(fn) {
						const res = fn()();
						expect(res.extA).toBe(1);
						expect(res.outer).toBeFunction();
						expect(res.outer.isOuter).toBeTrue();
					}
				});

				itSerializes('can access vars declared later in file', {
					in: input,
					validate: fn => expect(fn()().extD).toBe(4)
				});

				itSerializes('can access vars declared with `var` in block nested in root', {
					in: input,
					validate: fn => expect(fn()().extE).toBe(5)
				});

				itSerializes('cannot access vars declared with `const` in block nested in root', {
					in: input,
					validate: fn => expect(fn()().typeofExtF).toBe('undefined')
				});

				itSerializes('can access `this` from external context', {
					in: input,
					validate: fn => expect(fn()().this).toEqual({x: 7})
				});

				itSerializes('can access `arguments` from external context', {
					in: input,
					validate(fn) {
						const args = fn()().arguments;
						expect(args).toBeArguments();
						expect(args).toHaveLength(3);
						expect(args[0]).toBe(8);
						expect(args[1]).toBe(9);
						expect(args[2]).toBe(10);
					}
				});
			});

			describe('does not freeze vars internal to function where not accessible to eval', () => {
				describe('in nested blocks', () => {
					itSerializes('where vars differently named from frozen vars', {
						in: `
							module.exports = function(module, exports) {
								const intA = 1;
								{
									let intB;
									intB = 2;
									{
										let intC = 3;
									}
								}
								return eval('intA');
							};
						`,
						out: `(0,eval)("
							(function(module,exports){const intA=1;{let a;a=2;{let b=3}}return eval(\\"intA\\")})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(1);
						}
					});

					itSerializes('where var shares name with frozen var', {
						in: `
							module.exports = function(module, exports) {
								const intA = 1;
								{
									let intA;
									intA = 2;
									{
										let intC = 3;
									}
								}
								return eval('intA');
							};
						`,
						out: `(0,eval)("
							(function(module,exports){const intA=1;{let a;a=2;{let b=3}}return eval(\\"intA\\")})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(1);
						}
					});
				});

				describe('in nested functions', () => {
					itSerializes('where vars differently named from frozen vars', {
						in: `
							module.exports = function(module, exports) {
								const intA = 1, intB = 2;
								return [
									...eval('[intA, intB]'),
									...(intC => { let intD = 4; return [intC, intD]; })(3)
								];
							};
						`,
						out: `(0,eval)("
							(function(module,exports){
								const intA=1,intB=2;
								return[...eval(\\"[intA, intB]\\"),...(a=>{let b=4;return[a,b]})(3)]
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([1, 2, 3, 4]);
						}
					});

					itSerializes('where vars share names with frozen vars', {
						in: `
							module.exports = function(module, exports) {
								const intA = 1, intB = 2;
								return [
									...eval('[intA, intB]'),
									...(intA => { let intB = 4; return [intA, intB]; })(3)
								];
							};
						`,
						out: `(0,eval)("
							(function(module,exports){
								const intA=1,intB=2;
								return[...eval(\\"[intA, intB]\\"),...(a=>{let b=4;return[a,b]})(3)]
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([1, 2, 3, 4]);
						}
					});
				});

				describe('in function body where eval in function params', () => {
					itSerializes('where vars differently named from frozen vars', {
						in: `
							module.exports = function(intA = 1, intB = eval('intA'), module, exports) {
								const intC = 2;
								{
									const intD = 3;
									return [intA, intB, intC, intD];
								}
							};
						`,
						out: `(0,eval)("
							(function(intA=1,intB=eval(\\"intA\\"),module,exports){
								const a=2;
								{
									const b=3;
									return[intA,intB,a,b]
								}
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([1, 1, 2, 3]);
						}
					});

					itSerializes('where vars share names with frozen vars', {
						in: `
							module.exports = function(intA = 1, intB = eval('intA'), module, exports) {
								const out = [intA, intB];
								{
									const intA = 2, intB = 3;
									return [...out, intA, intB];
								}
							};
						`,
						out: `(0,eval)("
							(function(intA=1,intB=eval(\\"intA\\"),module,exports){
								const a=[intA,intB];
								{
									const b=2,c=3;
									return[...a,b,c]
								}
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([1, 1, 2, 3]);
						}
					});
				});

				describe('where eval in nested function', () => {
					itSerializes('where vars differently named from frozen vars', {
						in: `
							module.exports = function(module, exports) {
								const intA = 1, intB = 2;
								const fn = () => eval('[intA, intB]');
								{
									const intC = 3;
									const intD = (intE => intE)(4);
									return [intA, intB, ...fn(), intC, intD];
								}
							};
						`,
						out: `(0,eval)("
							(function(module,exports){
								const intA=1,intB=2;
								const fn=()=>eval(\\"[intA, intB]\\");
								{
									const a=3;
									const b=(c=>c)(4);
									return[intA,intB,...fn(),a,b]
								}
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([1, 2, 1, 2, 3, 4]);
						}
					});

					itSerializes('where vars share names with frozen vars', {
						in: `
							module.exports = function(module, exports) {
								const intA = 1, intB = 2, intC = 3;
								const fn = () => eval('[intA, intB, intC]');
								{
									const intA = 4;
									const intB = (intC => intC)(5);
									return [...fn(), intA, intB];
								}
							};
						`,
						out: `(0,eval)("
							(function(module,exports){
								const intA=1,intB=2,intC=3;
								const fn=()=>eval(\\"[intA, intB, intC]\\");
								{
									const a=4;
									const b=(c=>c)(5);
									return[...fn(),a,b]
								}
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([1, 2, 3, 4, 5]);
						}
					});
				});
			});

			describe('freezes linked vars internal to function where one is in scope of eval', () => {
				describe('function param + var binding', () => {
					itSerializes('where var binding is frozen', {
						in: `
							module.exports = function(param = 1, module, exports) {
								var param;
								eval('param');
								return param;
							};
						`,
						out: `(0,eval)("
							(function(param=1,module,exports){var param;eval(\\"param\\");return param})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toBe(1);
						}
					});

					itSerializes('where function param is frozen', {
						in: `
							module.exports = function(param = {x: 1}, y = eval('param'), module, exports) {
								var param;
								return [param, y];
							};
						`,
						out: `(0,eval)("
							(function(param={x:1},y=eval(\\"param\\"),module,exports){
								var param;
								return[param,y]
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							const arr = fn();
							expect(arr).toEqual([{x: 1}, {x: 1}]);
							expect(arr[1]).toBe(arr[0]);
						}
					});
				});

				describe('for statement bindings', () => {
					itSerializes('where left binding is frozen', {
						in: `
							module.exports = function(module, exports) {
								let getLeft, getRight;
								for (
									let [x, y = getLeft = () => x, z = () => eval('x')]
									of (getRight = () => typeof x, [[1]])
								) ;
								return {getLeft, getRight};
							};
						`,
						out: `(0,eval)("
							(function(module,exports){
								let getLeft,getRight;
								for(let[x,y=getLeft=()=>x,z=()=>eval(\\"x\\")]of(getRight=()=>typeof x,[[1]]));
								return{getLeft,getRight}
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							const {getLeft, getRight} = fn();
							expect(getLeft).toBeFunction();
							expect(getLeft()).toBe(1);
							expect(getRight).toBeFunction();
							expect(getRight).toThrowWithMessage(
								ReferenceError, "Cannot access 'x' before initialization"
							);
						}
					});

					itSerializes('where right binding is frozen', {
						in: `
							module.exports = function(module, exports) {
								let getLeft, getRight;
								for (
									let [x, y = getLeft = () => x]
									of (getRight = () => typeof x, () => eval('x'), [[1]])
								) ;
								return {getLeft, getRight};
							};
						`,
						out: `(0,eval)("
							(function(module,exports){
								let getLeft,getRight;
								for(let[x,y=getLeft=()=>x]of(getRight=()=>typeof x,()=>eval(\\"x\\"),[[1]]));
								return{getLeft,getRight}
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							const {getLeft, getRight} = fn();
							expect(getLeft).toBeFunction();
							expect(getLeft()).toBe(1);
							expect(getRight).toBeFunction();
							expect(getRight).toThrowWithMessage(
								ReferenceError, "Cannot access 'x' before initialization"
							);
						}
					});
				});
			});

			describe('prevents shadowed vars in upper scopes being accessible to eval', () => {
				itSerializes('simple case', {
					in: `
						'use strict';
						const extA = 1,
							extB = 2;
						const fns = {getOuterExts: (0, () => ({extA, extB}))};
						{
							const extB = 10;
							fns.evalFn = function(module, exports, fns) {
								return eval('({extA, extB, typeofA: typeof a})');
							};
						}
						module.exports = fns;
					`,
					out: `(()=>{
						const a=(0,eval)("
								\\"use strict\\";
								(extA,extB)=>[
									()=>({extA,extB}),
									extB=>function(module,exports,fns){
										return eval(\\"({extA, extB, typeofA: typeof a})\\")
									}
								]
							")(1,2);
						return{getOuterExts:a[0],evalFn:a[1](10)}
					})()`,
					validate({getOuterExts, evalFn}) {
						expect(getOuterExts).toBeFunction();
						expect(getOuterExts()).toEqual({extA: 1, extB: 2});
						expect(evalFn).toBeFunction();
						expect(evalFn()).toEqual({extA: 1, extB: 10, typeofA: 'undefined'});
					}
				});

				itSerializes('where shadowed var block is separate', {
					in: `
						'use strict';
						const fns = {};
						const extA = 1;
						{
							const extB = 2;
							{
								const extB = 10;
								fns.evalFn = function(module, exports, fns) {
									return eval('({extA, extB, typeofA: typeof a})');
								};
							}
							fns.getOuterExts = () => ({extA, extB});
						}
						module.exports = fns;
					`,
					out: `(()=>{
						const a=(0,eval)("
								\\"use strict\\";
								extA=>[
									extB=>function(module,exports,fns){
										return eval(\\"({extA, extB, typeofA: typeof a})\\")
									},
									a=>()=>({extA,extB:a})
								]
							")(1);
						return{evalFn:a[0](10),getOuterExts:a[1](2)}
					})()`,
					validate({getOuterExts, evalFn}) {
						expect(getOuterExts).toBeFunction();
						expect(getOuterExts()).toEqual({extA: 1, extB: 2});
						expect(evalFn).toBeFunction();
						expect(evalFn()).toEqual({extA: 1, extB: 10, typeofA: 'undefined'});
					}
				});

				itSerializes('where shadowed var introduced to scope chain later', {
					in: `
						'use strict';
						const fns = {};
						const extA = 1;
						{
							const extB = 2;
							{
								const extC = 3;
								{
									const extB = 10;
									fns.evalFn = function(module, exports, fns) {
										return eval('({extA, extB, extC, typeofA: typeof a})');
									};
								}
								// This function inserts outer extB block into scope chain below inner extB
								fns.getOuterExts = () => ({extA, extB, extC});
							}
						}
						module.exports = fns;
					`,
					out: `(()=>{
						const a=(0,eval)("
								\\"use strict\\";
								extA=>extB=>extC=>[
									()=>({extA,extB,extC}),
									extB=>function(module,exports,fns){
										return eval(\\"({extA, extB, extC, typeofA: typeof a})\\")
									}
								]
							")(1)(2)(3);
						return{evalFn:a[1](10),getOuterExts:a[0]}
					})()`,
					validate({getOuterExts, evalFn}) {
						expect(getOuterExts).toBeFunction();
						expect(getOuterExts()).toEqual({extA: 1, extB: 2, extC: 3});
						expect(evalFn).toBeFunction();
						expect(evalFn()).toEqual({extA: 1, extB: 10, extC: 3, typeofA: 'undefined'});
					}
				});

				describe('where shadowed var internal to function', () => {
					itSerializes('simple case', {
						in: `
							module.exports = function(module, exports) {
								const intA = 1, intB = intA;
								{
									const intA = 2;
									return eval('({intA, intB, typeofA: typeof a})');
								}
							};
						`,
						out: `(0,eval)("
							(function(module,exports){
								const intA=1,intB=intA;
								{
									const intA=2;
									return eval(\\"({intA, intB, typeofA: typeof a})\\")
								}
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({intA: 2, intB: 1, typeofA: 'undefined'});
						}
					});

					itSerializes('where var is not accessible to eval due to strict mode rules', {
						// `package` is a reserved keyword in strict mode
						in: `
							module.exports = function(module, exports) {
								const package = 1, intA = package;
								return (() => {
									'use strict';
									return eval('({intA, typeofA: typeof a})')
								})();
							};
						`,
						out: `(0,eval)("
							(function(module,exports){
								const package=1,intA=package;
								return(()=>{
									\\"use strict\\";
									return eval(\\"({intA, typeofA: typeof a})\\")
								})()
							})
						")`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({intA: 1, typeofA: 'undefined'});
						}
					});
				});
			});

			describe('prevents Livepack external vars blocking access to globals in eval', () => {
				itSerializes('where function containing eval has external scope', {
					in: `
						const ext = {x: 1};
						module.exports = {
							console: ext,
							ext,
							evalFn: (0, function(module, exports) {
								return eval('({console, typeofA: typeof a})');
							})
						};
					`,
					out: `(()=>{
						const a={x:1};
						return{
							console:a,
							ext:a,
							evalFn:(0,eval)("
								ext=>function(module,exports){return eval(\\"({console, typeofA: typeof a})\\")}
							")(a)
						}
					})()`,
					validate({evalFn, ext, console: ext2}, {isOutput, minify, mangle, inline, outputJs}) {
						expect(evalFn).toBeFunction();
						const res = evalFn();
						expect(res).toBeObject();
						expect(res.console).toBe(console);
						expect(res.typeofA).toBe('undefined');
						expect(ext).toEqual({x: 1});
						expect(ext2).toBe(ext);

						// Test top level var naming unaffected by global use inside eval when mangle disabled
						if (isOutput && minify && !mangle && inline) {
							expect(stripSourceMapComment(outputJs)).toBe(stripLineBreaks(`
								(()=>{
									const console={x:1};
									return{
										console,
										ext:console,
										evalFn:(0,eval)("
											ext=>function(module,exports){
												return eval(\\"({console, typeofA: typeof a})\\")
											}
										")(console)
									}
								})()
							`));
						}
					}
				});

				itSerializes('where function containing eval has no external scope', {
					in() {
						const ext = {x: 1};
						return {
							console: ext,
							ext,
							evalFn: (0, eval)('() => eval("({console, typeofA: typeof a})")')
						};
					},
					out: `(()=>{
						const a={x:1};
						return{
							console:a,
							ext:a,
							evalFn:(0,eval)("()=>eval(\\"({console, typeofA: typeof a})\\")")
						}
					})()`,
					validate({evalFn, ext, console: ext2}, {isOutput, minify, mangle, inline, outputJs}) {
						expect(evalFn).toBeFunction();
						const res = evalFn();
						expect(res).toBeObject();
						expect(res.console).toBe(console);
						expect(res.typeofA).toBe('undefined');
						expect(ext).toEqual({x: 1});
						expect(ext2).toBe(ext);

						// Test top level var naming unaffected by global use inside eval when mangle disabled
						if (isOutput && minify && !mangle && inline) {
							expect(stripSourceMapComment(outputJs)).toBe(stripLineBreaks(`
								(()=>{
									const console={x:1};
									return{
										console,
										ext:console,
										evalFn:(0,eval)("()=>eval(\\"({console, typeofA: typeof a})\\")")
									}
								})()
							`));
						}
					}
				});
			});

			describe('where var frozen by eval also used in const violation', () => {
				describe('where const violation in body of function', () => {
					describe('no other bindings with same name', () => {
						itSerializes('direct assignment', {
							in: `
								module.exports = function(module, exports) {
									const x = 1;
									eval('x');
									x = 2;
								};
							`,
							out: `(0,eval)("
								(function(module,exports){const x=1;eval(\\"x\\");x=2;})
							")`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
							}
						});

						itSerializes('read-write assignment', {
							in: `
								module.exports = function(module, exports) {
									const x = 1;
									eval('x');
									x += 2;
								};
							`,
							out: `(0,eval)("
								(function(module,exports){const x=1;eval(\\"x\\");x+=2;})
							")`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
							}
						});
					});

					describe('other bindings with same name', () => {
						itSerializes('direct assignment', {
							in: `
								module.exports = function(module, exports) {
									const x = 1;
									eval('x');
									{
										let x = 3;
									}
									x = 2;
								};
							`,
							out: `(0,eval)("
								(function(module,exports){const x=1;eval(\\"x\\");{let a=3}x=2;})
							")`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
							}
						});

						itSerializes('read-write assignment', {
							in: `
								module.exports = function(module, exports) {
									const x = 1;
									eval('x');
									{
										let x = 4;
									}
									x += 2;
								};
							`,
							out: `(0,eval)("
								(function(module,exports){const x=1;eval(\\"x\\");{let a=4}x+=2;})
							")`,
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
							}
						});
					});
				});

				describe('where const violation in nested function', () => {
					describe('no other bindings with same name', () => {
						itSerializes('direct assignment', {
							in: `
								module.exports = function(module, exports) {
									const x = 1;
									eval('x');
									return () => x = 2;
								};
							`,
							out: `(0,eval)("
								(function(module,exports){const x=1;eval(\\"x\\");return()=>x=2;})
							")`,
							validate(fn) {
								expect(fn).toBeFunction();
								const innerFn = fn();
								expect(innerFn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
							}
						});

						itSerializes('read-write assignment', {
							in: `
								module.exports = function(module, exports) {
									const x = 1;
									eval('x');
									return () => x += 2;
								};
							`,
							out: `(0,eval)("
								(function(module,exports){const x=1;eval(\\"x\\");return()=>x+=2;})
							")`,
							validate(fn) {
								expect(fn).toBeFunction();
								const innerFn = fn();
								expect(innerFn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
							}
						});
					});

					describe('other bindings with same name', () => {
						itSerializes('direct assignment', {
							in: `
								module.exports = function(module, exports) {
									const x = 1;
									eval('x');
									{
										let x = 3;
									}
									return () => x = 2;
								};
							`,
							out: `(0,eval)("
								(function(module,exports){const x=1;eval(\\"x\\");{let a=3}return()=>x=2;})
							")`,
							validate(fn) {
								expect(fn).toBeFunction();
								const innerFn = fn();
								expect(innerFn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
							}
						});

						itSerializes('read-write assignment', {
							in: `
								module.exports = function(module, exports) {
									const x = 1;
									eval('x');
									{
										let x = 4;
									}
									return () => x += 2;
								};
							`,
							out: `(0,eval)("
								(function(module,exports){const x=1;eval(\\"x\\");{let a=4}return()=>x+=2;})
							")`,
							validate(fn) {
								expect(fn).toBeFunction();
								const innerFn = fn();
								expect(innerFn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
							}
						});
					});
				});
			});

			itSerializes('eval expression contains function', {
				in: `module.exports = function(module, exports) {
					return eval((() => '123')());
				};`,
				out: '(0,eval)("(function(module,exports){return eval((()=>\\"123\\")())})")',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(123);
				}
			});
		});

		describe('indirect `eval`', () => {
			describe('values', () => {
				itSerializes('can evaluate literal', {
					in() {
						return () => (0, eval)('123');
					},
					out: '()=>(0,eval)("123")',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(123);
					}
				});

				itSerializes('can evaluate unscoped object value', {
					in() {
						return () => (0, eval)('({x: 1})');
					},
					out: '()=>(0,eval)("({x: 1})")',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual({x: 1});
					}
				});

				itSerializes('can evaluate var local to eval', {
					in() {
						return () => (0, eval)('const x = 123; x');
					},
					out: '()=>(0,eval)("const x = 123; x")',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(123);
					}
				});

				itSerializes('cannot access external vars', {
					in() {
						const extA = {x: 1}; // eslint-disable-line no-unused-vars
						return () => (0, eval)('typeof extA');
					},
					out: '()=>(0,eval)("typeof extA")',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe('undefined');
					}
				});

				itSerializes('cannot access external `this`', {
					in() {
						function outer() {
							return () => (0, eval)('this');
						}
						return outer.call({x: 1});
					},
					out: '()=>(0,eval)("this")',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(global);
					}
				});

				itSerializes('cannot access external `arguments`', {
					in() {
						function outer() {
							return () => (0, eval)('typeof arguments');
						}
						return outer(1, 2, 3);
					},
					out: '()=>(0,eval)("typeof arguments")',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe('undefined');
					}
				});
			});

			describe('functions', () => {
				itSerializes('returning literal', {
					in() {
						return () => (0, eval)('() => 123');
					},
					out: '()=>(0,eval)("() => 123")',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn();
						expect(fnInner).toBeFunction();
						expect(fnInner()).toBe(123);
					}
				});

				itSerializes('returning unscoped', {
					in() {
						return () => (0, eval)('() => ({x: 1})');
					},
					out: '()=>(0,eval)("() => ({x: 1})")',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn();
						expect(fnInner).toBeFunction();
						expect(fnInner()).toEqual({x: 1});
					}
				});

				itSerializes('returning var local to eval', {
					in() {
						return () => (0, eval)('const x = {x: 1}; () => x');
					},
					out: '()=>(0,eval)("const x = {x: 1}; () => x")',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn();
						expect(fnInner).toBeFunction();
						expect(fnInner()).toEqual({x: 1});
					}
				});

				itSerializes('cannot access external vars', {
					in() {
						const extA = {x: 1}; // eslint-disable-line no-unused-vars
						return () => (0, eval)('() => typeof extA');
					},
					out: '()=>(0,eval)("() => typeof extA")',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn();
						expect(fnInner).toBeFunction();
						expect(fnInner()).toBe('undefined');
					}
				});

				itSerializes('cannot access external `this`', {
					in() {
						return function() {
							return (0, eval)('() => this');
						};
					},
					out: 'function(){return(0,eval)("() => this")}',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn.call({x: 1});
						expect(fnInner).toBeFunction();
						expect(fnInner()).toBe(global);
					}
				});

				itSerializes('cannot access external `arguments`', {
					in() {
						return function() {
							return (0, eval)('() => typeof arguments');
						};
					},
					out: 'function(){return(0,eval)("() => typeof arguments")}',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn(1, 2, 3);
						expect(fnInner).toBeFunction();
						expect(fnInner()).toBe('undefined');
					}
				});
			});
		});
	});

	describe('`eval()` within `eval()`', () => {
		itSerializes('with no prefix changes', {
			in() {
				const ext = 1; // eslint-disable-line no-unused-vars
				return eval('eval("() => ext")');
			},
			out: '(a=>()=>a)(1)',
			validate: fn => expect(fn()).toBe(1)
		});

		describe('with prefix changes', () => {
			itSerializes('altered external to eval', {
				in: `
					'use strict';
					const livepack_tracker = 1;
					module.exports = eval('eval("() => livepack_tracker")');
				`,
				out: '(a=>()=>a)(1)',
				validate(fn, {transpiled}) {
					expect(fn()).toBe(1);

					// Sanity check: Ensure var used has changed prefix outside eval
					expect(transpiled).toInclude('const [livepack1_tracker, livepack1_getScopeId] = require(');
				}
			});

			itSerializes('altered internal to outer eval', {
				in: `
					'use strict';
					module.exports = eval('const livepack_tracker = 1; eval("() => livepack_tracker")');
				`,
				out: '(a=>()=>a)(1)',
				validate(fn, {transpiled}) {
					expect(fn()).toBe(1);

					// Sanity check: Ensure var used has not changed prefix outside eval
					expect(transpiled).toInclude('const [livepack_tracker, livepack_getScopeId] = require(');
				}
			});

			itSerializes('altered internal to inner eval', {
				in: `
					'use strict';
					module.exports = eval('eval("const livepack_tracker = 1; () => livepack_tracker")');
				`,
				out: '(a=>()=>a)(1)',
				validate(fn, {transpiled}) {
					expect(fn()).toBe(1);

					// Sanity check: Ensure var used has not changed prefix outside eval
					expect(transpiled).toInclude('const [livepack_tracker, livepack_getScopeId] = require(');
				}
			});

			itSerializes('altered internal and external to eval, matched prefixes', {
				in: `
					'use strict';
					const livepack_tracker = 1;
					module.exports = eval('const livepack_tracker = 2; eval("const livepack_tracker = 3; () => livepack_tracker")');
				`,
				out: '(a=>()=>a)(3)',
				validate(fn, {transpiled}) {
					expect(fn()).toBe(3);

					// Sanity check: Ensure var used has changed prefix outside eval
					expect(transpiled).toInclude('const [livepack1_tracker, livepack1_getScopeId] = require(');
				}
			});

			itSerializes('altered internal and external to eval, unmatched prefixes', {
				in: `
					'use strict';
					const livepack_tracker = 1;\n
					module.exports = eval('const livepack1_tracker = 2; eval("const livepack2_tracker = 3; () => [livepack_tracker, livepack1_tracker, livepack2_tracker]")');
				`,
				out: '(c=>b=>a=>()=>[c,b,a])(1)(2)(3)',
				validate(fn, {transpiled}) {
					expect(fn()).toEqual([1, 2, 3]);

					// Sanity check: Ensure var used has changed prefix outside eval
					expect(transpiled).toInclude('const [livepack1_tracker, livepack1_getScopeId] = require(');
				}
			});
		});

		describe('inner eval in function', () => {
			const input = `
				const extA = 1;
				const outer = (0, function() {
					const extB = 2;
					return eval('() => {const extC = 3; return eval("const extD = 4; () => ({extA, extB, extC, extD, outer, module, exports, this: this, arguments: arguments})")}');
				});
				outer.isOuter = true;

				module.exports = outer.call({x: 5}, 6, 7, 8);
			`;

			itSerializes('serializes correctly', {
				in: input,
				out: `(()=>{
					const a={},
						b=(0,eval)("
							(module,exports)=>(extA,outer)=>[
								outer=(0,function(){
									const extB=2;
									return eval(\\"() => {const extC = 3; return eval(\\\\\\"const extD = 4; () => ({extA, extB, extC, extD, outer, module, exports, this: this, arguments: arguments})\\\\\\")}\\")
								}),
								(_a,_b)=>function(){
									return extB=>()=>{
										const extC=3;
										return eval(\\"const extD = 4; () => ({extA, extB, extC, extD, outer, module, exports, this: this, arguments: arguments})\\")
									}
								}.apply(_a,_b)
							]
						")(a,{})(1),
						c=b[1](
							{x:5},
							function(){return arguments}(6,7,8)
						)(2);
					a.exports=c;
					Object.assign(b[0],{isOuter:true});
					return c
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBeFunction();
				}
			});

			itSerializes('can access vars from internal scope', {
				in: input,
				validate: fn => expect(fn()().extD).toBe(4)
			});

			itSerializes('can access vars from internal scope of outer `eval()`', {
				in: input,
				validate: fn => expect(fn()().extC).toBe(3)
			});

			itSerializes('can access vars from immediate upper scope', {
				in: input,
				validate: fn => expect(fn()().extB).toBe(2)
			});

			itSerializes('can access vars from further upper scope', {
				in: input,
				validate(fn) {
					const res = fn()();
					expect(res.extA).toBe(1);
					expect(res.outer).toBeFunction();
					expect(res.outer.isOuter).toBeTrue();
				}
			});

			itSerializes('can access `this` from external context', {
				in: input,
				validate: fn => expect(fn()().this).toEqual({x: 5})
			});

			itSerializes('can access `arguments` from external context', {
				in: input,
				validate(fn) {
					const args = fn()().arguments;
					expect(args).toBeArguments();
					expect(args).toHaveLength(3);
					expect(args[0]).toBe(6);
					expect(args[1]).toBe(7);
					expect(args[2]).toBe(8);
				}
			});
		});
	});

	describe('`eval()` within indirect `eval()` evaluated before serialization', () => {
		itSerializes('can access vars within outer eval', {
			in() {
				return (0, eval)(`
					const ext = 1;
					() => eval('ext')
				`);
			},
			strictEnv: false,
			out: '(0,eval)("ext=>()=>eval(\\"ext\\")")(1)',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(1);
			}
		});

		itSerializes('cannot access vars outside outer eval', {
			in() {
				const ext = 1; // eslint-disable-line no-unused-vars
				return (0, eval)('() => eval("typeof ext")');
			},
			strictEnv: false,
			out: '(0,eval)("()=>eval(\\"typeof ext\\")")',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe('undefined');
			}
		});

		itSerializes('cannot access CommonJS vars', {
			in() {
				return (0, eval)('() => eval("[typeof module, typeof exports]")');
			},
			strictEnv: false,
			out: '(0,eval)("()=>eval(\\"[typeof module, typeof exports]\\")")',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toEqual(['undefined', 'undefined']);
			}
		});
	});

	describe('multiple `eval()`s evaluated before serialization', () => {
		// Tests cover https://github.com/overlookmotel/livepack/issues/538
		itSerializesEqual('simple case', {
			in: `
				'use strict';
				const x = 11, y = 22;
				module.exports = [eval('x'), eval('y')];
			`,
			out: '[11,22]'
		});

		describe('with prefix num change in 1st eval', () => {
			itSerializes('with direct eval containing prefix num change', {
				in: `
					'use strict';
					const x = 11, y = 22;
					module.exports = [
						eval('let livepack_temp; () => x'),
						eval('() => y')
					];
				`,
				out: '(()=>{const a=((a,b)=>[()=>a,()=>b])(11,22);return[a[0],a[1]]})()',
				validate([fn1, fn2]) {
					expect(fn1).toBeFunction();
					expect(fn2).toBeFunction();
					expect(fn1()).toBe(11);
					expect(fn2()).toBe(22);
				}
			});

			itSerializes('with indirect eval containing prefix num change', {
				in: `
					'use strict';
					const y = 22;
					module.exports = [
						eval('let livepack_temp; () => 11'),
						eval('() => y')
					];
				`,
				out: '[()=>11,(a=>()=>a)(22)]',
				validate([fn1, fn2]) {
					expect(fn1).toBeFunction();
					expect(fn2).toBeFunction();
					expect(fn1()).toBe(11);
					expect(fn2()).toBe(22);
				}
			});
		});
	});
});
