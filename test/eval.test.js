/* --------------------
 * livepack module
 * Tests for `eval`
 * ------------------*/

/* eslint-disable no-eval, global-require, import/no-dynamic-require */

'use strict';

// Modules
const escapeRegex = require('lodash/escapeRegExp');

// Imports
const {
		itSerializes, itSerializesEqual, createFixturesFunctions, tryCatch
	} = require('./support/index.js'),
	{transpiledFiles} = require('../lib/shared/internal.js');

const {createFixture, requireFixture} = createFixturesFunctions(__filename);

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
				// TODO Uncomment these tests once that issue resolved.
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
						in: () => requireFixture(`
							let fn;
							const ext = {x: 1};
							const obj = {
								[fn = eval('() => ext')]() {}
							};
							module.exports = fn;
						`),
						out: '(a=>()=>a)({x:1})',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					});
				});
				*/
			});

			itSerializesEqual('multi-statement eval', {
				in: () => eval('const a = 123; a;'),
				out: '123',
				validate: num => expect(num).toBe(123)
			});

			it('throws if invalid eval code', () => {
				const err = tryCatch(() => eval('return 123;'));
				expect(err).toBeInstanceOf(SyntaxError);
				expect(err.message).toBe('Illegal return statement');

				// Check stack trace does not include internal livepack code
				const stackLines = err.stack.split(/\r?\n/);
				expect(stackLines[0]).toBe('SyntaxError: Illegal return statement');
				expect(stackLines[1]).toMatch(
					new RegExp(`\\s+at \\S+ \\(${escapeRegex(__filename)}:\\d+:\\d+\\)`)
				);
			});

			describe('handles internal var name prefixes', () => {
				itSerializes('altered external to eval', {
					in() {
						const srcPath = createFixture(`
							'use strict';
							const livepack_tracker = 1;
							module.exports = eval('() => livepack_tracker');
						`);
						const fn = require(srcPath);

						// Sanity check: Ensure var used has changed prefix outside eval
						expect(transpiledFiles[srcPath].code).toInclude(
							'const [livepack1_tracker, livepack1_getScopeId] = require("'
						);

						return fn;
					},
					out: '(a=>()=>a)(1)',
					validate: fn => expect(fn()).toBe(1)
				});

				itSerializes('altered internal to eval', {
					in() {
						const srcPath = createFixture(`
							'use strict';
							module.exports = eval('const livepack_tracker = 1; () => livepack_tracker');
						`);
						const fn = require(srcPath);

						// Sanity check: Ensure var used has not changed prefix outside eval
						expect(transpiledFiles[srcPath].code).toInclude(
							'const [livepack_tracker, livepack_getScopeId] = require("'
						);

						return fn;
					},
					out: '(a=>()=>a)(1)',
					validate: fn => expect(fn()).toBe(1)
				});

				itSerializes('altered internal and external to eval, matched prefixes', {
					in() {
						const srcPath = createFixture(`
							'use strict';
							const livepack_tracker = 1;\n
							module.exports = eval('const livepack_tracker = 2; () => livepack_tracker');
						`);
						const fn = require(srcPath);

						// Sanity check: Ensure var used has changed prefix outside eval
						expect(transpiledFiles[srcPath].code).toInclude(
							'const [livepack1_tracker, livepack1_getScopeId] = require("'
						);

						return fn;
					},
					out: '(a=>()=>a)(2)',
					validate: fn => expect(fn()).toBe(2)
				});

				itSerializes('altered internal and external to eval, unmatched prefixes', {
					in() {
						const srcPath = createFixture(`
							'use strict';
							const livepack_tracker = 1;
							module.exports = eval('const livepack1_tracker = 2; () => [livepack_tracker, livepack1_tracker]');
						`);
						const fn = require(srcPath);

						// Sanity check: Ensure var used has changed prefix outside eval
						expect(transpiledFiles[srcPath].code).toInclude(
							'const [livepack1_tracker, livepack1_getScopeId] = require("'
						);

						return fn;
					},
					out: '(b=>a=>()=>[b,a])(1)(2)',
					validate: fn => expect(fn()).toEqual([1, 2])
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
					// TODO Fix this.
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
		});
	});

	describe('in functions which are serialized', () => {
		describe('`eval()`', () => {
			describe('values', () => {
				// `Object.setPrototypeOf` necessary because Jest creates `module.exports` in another
				// execution context, so prototype of `export` object is a *different* `Object.prototype`.
				// This is just an artefact of the testing environment - does not affect real code.
				const getInput = () => requireFixture(`
					Object.setPrototypeOf(exports, Object.prototype);

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
				`);

				itSerializes('serializes correctly', {
					in: getInput,
					strictEnv: false,
					out: `(()=>{
						const a={},
							b=(
								(extA,extD,extE,module,exports,outer)=>[
									outer=(0,function(){
										const extB=2;
										return()=>{
											const extC=3;
											return eval("({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
										}
									}),
									(extB,a,b)=>function(){
										return()=>{
											const extC=3;
											return eval("({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
										}
									}.apply(a,b)
								]
							)(1,4,5,a,{}),
							c=b[1](
								2,
								{x:7},
								function(){
									return arguments
								}(8,9,10)
							);
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
					in: getInput,
					validate: fn => expect(fn().extC).toBe(3)
				});

				itSerializes('can access vars from immediate upper scope', {
					in: getInput,
					validate: fn => expect(fn().extB).toBe(2)
				});

				itSerializes('can access vars from further upper scope', {
					in: getInput,
					validate(fn) {
						const res = fn();
						expect(res.extA).toBe(1);
						expect(res.outer).toBeFunction();
						expect(res.outer.isOuter).toBeTrue();
					}
				});

				itSerializes('can access vars declared later in file', {
					in: getInput,
					validate: fn => expect(fn().extD).toBe(4)
				});

				itSerializes('can access vars declared with `var` in block nested in root', {
					in: getInput,
					validate: fn => expect(fn().extE).toBe(5)
				});

				itSerializes('cannot access vars declared with `const` in block nested in root', {
					in: getInput,
					validate: fn => expect(fn().typeofExtF).toBe('undefined')
				});

				itSerializes('can access `this` from external context', {
					in: getInput,
					validate: fn => expect(fn().this).toEqual({x: 7})
				});

				itSerializes('can access `arguments` from external context', {
					in: getInput,
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
				// `Object.setPrototypeOf` necessary because Jest creates `module.exports` in another
				// execution context, so prototype of `export` object is a *different* `Object.prototype`.
				// This is just an artefact of the testing environment - does not affect real code.
				const getInput = () => requireFixture(`
					Object.setPrototypeOf(exports, Object.prototype);

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
				`);

				itSerializes('serializes correctly', {
					in: getInput,
					strictEnv: false,
					out: `(()=>{
						const a={},
							b=(
								(extA,extD,extE,module,exports,outer)=>[
									outer=(0,function(){
										const extB=2;
										return function(){
											const extC=3;
											return eval("({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
										}
									}),
									extB=>function(){
										const extC=3;
										return eval("({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
									}
								]
							)(1,4,5,a,{}),
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
					in: getInput,
					validate: fn => expect(fn().extC).toBe(3)
				});

				itSerializes('can access vars from immediate upper scope', {
					in: getInput,
					validate: fn => expect(fn().extB).toBe(2)
				});

				itSerializes('can access vars from further upper scope', {
					in: getInput,
					validate(fn) {
						const res = fn();
						expect(res.extA).toBe(1);
						expect(res.outer).toBeFunction();
						expect(res.outer.isOuter).toBeTrue();
					}
				});

				itSerializes('can access vars declared later in file', {
					in: getInput,
					validate: fn => expect(fn().extD).toBe(4)
				});

				itSerializes('can access vars declared with `var` in block nested in root', {
					in: getInput,
					validate: fn => expect(fn().extE).toBe(5)
				});

				itSerializes('cannot access vars declared with `const` in block nested in root', {
					in: getInput,
					validate: fn => expect(fn().typeofExtF).toBe('undefined')
				});

				itSerializes('cannot access `this` from external context', {
					in: getInput,
					validate: fn => expect(fn.call({y: 77}).this).toEqual({y: 77})
				});

				itSerializes('cannot access `arguments` from external context', {
					in: getInput,
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

			describe('functions', () => {
				// `Object.setPrototypeOf` necessary because Jest creates `module.exports` in another
				// execution context, so prototype of `export` object is a *different* `Object.prototype`.
				// This is just an artefact of the testing environment - does not affect real code.
				const getInput = () => requireFixture(`
					Object.setPrototypeOf(exports, Object.prototype);

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
				`);

				itSerializes('serializes correctly', {
					in: getInput,
					strictEnv: false,
					out: `(()=>{
						const a={},
							b=(
								(extA,extD,extE,module,exports,outer)=>[
									outer=(0,function(){
										const extB=2;
										return()=>{
											const extC=3;
											return eval("() => ({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
										}
									}),
									(extB,a,b)=>function(){
										return()=>{
											const extC=3;
											return eval("() => ({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
										}
									}.apply(a,b)
								]
							)(1,4,5,a,{}),
							c=b[1](
								2,
								{x:7},
								function(){
									return arguments
								}(8,9,10)
							);
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
					in: getInput,
					validate: fn => expect(fn()().extC).toBe(3)
				});

				itSerializes('can access vars from immediate upper scope', {
					in: getInput,
					validate: fn => expect(fn()().extB).toBe(2)
				});

				itSerializes('can access vars from further upper scope', {
					in: getInput,
					validate(fn) {
						const res = fn()();
						expect(res.extA).toBe(1);
						expect(res.outer).toBeFunction();
						expect(res.outer.isOuter).toBeTrue();
					}
				});

				itSerializes('can access vars declared later in file', {
					in: getInput,
					validate: fn => expect(fn()().extD).toBe(4)
				});

				itSerializes('can access vars declared with `var` in block nested in root', {
					in: getInput,
					validate: fn => expect(fn()().extE).toBe(5)
				});

				itSerializes('cannot access vars declared with `const` in block nested in root', {
					in: getInput,
					validate: fn => expect(fn()().typeofExtF).toBe('undefined')
				});

				itSerializes('can access `this` from external context', {
					in: getInput,
					validate: fn => expect(fn()().this).toEqual({x: 7})
				});

				itSerializes('can access `arguments` from external context', {
					in: getInput,
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

			describe('prevents shadowed vars in upper scopes being accessible to eval', () => {
				itSerializes('simple case', {
					in: () => requireFixture(`
						'use strict';
						const extA = 1,
							extB = 2;
						const fns = {getOuterExts: (0, () => ({extA, extB}))};
						{
							const extB = 10;
							fns.evalFn = (module, exports, fns) => eval('({extA, extB, typeofA: typeof a})');
						}
						module.exports = fns;
					`),
					out: `(()=>{
						const a=((extA,extB)=>[
								()=>({extA,extB}),
								extB=>(module,exports,fns)=>eval("({extA, extB, typeofA: typeof a})")
							])(1,2);
						return{getOuterExts:a[0],evalFn:a[1](10)}
					})()`,
					validate({getOuterExts, evalFn}) {
						expect(getOuterExts).toBeFunction();
						expect(getOuterExts()).toEqual({extA: 1, extB: 2});
						expect(evalFn).toBeFunction();
						// This doesn't work correctly due to https://github.com/overlookmotel/livepack/issues/114.
						// `typeof a` should equal 'undefined', but at present it doesn't.
						// So test currently just makes sure outer `extB` var has not been renamed to `a`.
						// TODO Change this to `expect(evalFn()).toEqual({extA: 1, extB: 10, typeofA: 'undefined'})`
						// once #114 is fixed.
						const res = evalFn();
						expect(res.extA).toBe(1);
						expect(res.extB).toBe(10);
						expect(res.typeofA).not.toBeNumber();
					}
				});

				itSerializes('where shadowed var block is separate', {
					in: () => requireFixture(`
						'use strict';
						const fns = {};
						const extA = 1;
						{
							const extB = 2;
							{
								const extB = 10;
								fns.evalFn = (module, exports, fns) => eval('({extA, extB, typeofA: typeof a})');
							}
							fns.getOuterExts = () => ({extA, extB});
						}
						module.exports = fns;
					`),
					out: `(()=>{
						const a=(extA=>[
								extB=>(module,exports,fns)=>eval("({extA, extB, typeofA: typeof a})"),
								a=>()=>({extA,extB:a})
							])(1);
						return{evalFn:a[0](10),getOuterExts:a[1](2)}
					})()`,
					validate({getOuterExts, evalFn}) {
						expect(getOuterExts).toBeFunction();
						expect(getOuterExts()).toEqual({extA: 1, extB: 2});
						expect(evalFn).toBeFunction();
						// This doesn't work correctly due to https://github.com/overlookmotel/livepack/issues/114.
						// `typeof a` should equal 'undefined', but at present it doesn't.
						// So test currently just makes sure outer `extB` var has not been renamed to `a`.
						// TODO Once #114 is fixed, change this to
						// `expect(evalFn()).toEqual({extA: 1, extB: 10, typeofA: 'undefined'})`.
						const res = evalFn();
						expect(res.extA).toBe(1);
						expect(res.extB).toBe(10);
						expect(res.typeofA).not.toBeNumber();
					}
				});

				itSerializes('where shadowed var introduced to scope chain later', {
					in: () => requireFixture(`
						'use strict';
						const fns = {};
						const extA = 1;
						{
							const extB = 2;
							{
								const extC = 3;
								{
									const extB = 10;
									fns.evalFn = (module, exports, fns) => eval('({extA, extB, extC, typeofA: typeof a})');
								}
								// This function inserts outer extB block into scope chain below inner extB
								fns.getOuterExts = () => ({extA, extB, extC});
							}
						}
						module.exports = fns;
					`),
					out: `(()=>{
						const a=(extA=>extB=>extC=>[
								()=>({extA,extB,extC}),
								extB=>(module,exports,fns)=>eval("({extA, extB, extC, typeofA: typeof a})")
							])(1)(2)(3);
						return{evalFn:a[1](10),getOuterExts:a[0]}
					})()`,
					validate({getOuterExts, evalFn}) {
						expect(getOuterExts).toBeFunction();
						expect(getOuterExts()).toEqual({extA: 1, extB: 2, extC: 3});
						expect(evalFn).toBeFunction();
						// This doesn't work correctly due to https://github.com/overlookmotel/livepack/issues/114.
						// `typeof a` should equal 'undefined', but at present it doesn't.
						// So test currently just makes sure outer `extB` var has not been renamed to `a`.
						// TODO Once #114 is fixed, change this to
						// `expect(evalFn()).toEqual({extA: 1, extB: 10, extC: 3, typeofA: 'undefined'})`.
						const res = evalFn();
						expect(res.extA).toBe(1);
						expect(res.extB).toBe(10);
						expect(res.extC).toBe(3);
						expect(res.typeofA).not.toBeNumber();
					}
				});
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
				in() {
					const srcPath = createFixture(`
						'use strict';
						const livepack_tracker = 1;
						module.exports = eval('eval("() => livepack_tracker")');
					`);
					const fn = require(srcPath);

					// Sanity check: Ensure var used has changed prefix outside eval
					expect(transpiledFiles[srcPath].code).toInclude(
						'const [livepack1_tracker, livepack1_getScopeId] = require("'
					);

					return fn;
				},
				out: '(a=>()=>a)(1)',
				validate: fn => expect(fn()).toBe(1)
			});

			itSerializes('altered internal to outer eval', {
				in() {
					const srcPath = createFixture(`
						'use strict';
						module.exports = eval('const livepack_tracker = 1; eval("() => livepack_tracker")');
					`);
					const fn = require(srcPath);

					// Sanity check: Ensure var used has not changed prefix outside eval
					expect(transpiledFiles[srcPath].code).toInclude(
						'const [livepack_tracker, livepack_getScopeId] = require("'
					);

					return fn;
				},
				out: '(a=>()=>a)(1)',
				validate: fn => expect(fn()).toBe(1)
			});

			itSerializes('altered internal to inner eval', {
				in() {
					const srcPath = createFixture(`
						'use strict';
						module.exports = eval('eval("const livepack_tracker = 1; () => livepack_tracker")');
					`);
					const fn = require(srcPath);

					// Sanity check: Ensure var used has not changed prefix outside eval
					expect(transpiledFiles[srcPath].code).toInclude(
						'const [livepack_tracker, livepack_getScopeId] = require("'
					);

					return fn;
				},
				out: '(a=>()=>a)(1)',
				validate: fn => expect(fn()).toBe(1)
			});

			itSerializes('altered internal and external to eval, matched prefixes', {
				in() {
					const srcPath = createFixture(`
						'use strict';
						const livepack_tracker = 1;
						module.exports = eval('const livepack_tracker = 2; eval("const livepack_tracker = 3; () => livepack_tracker")');
					`);
					const fn = require(srcPath);

					// Sanity check: Ensure var used has changed prefix outside eval
					expect(transpiledFiles[srcPath].code).toInclude(
						'const [livepack1_tracker, livepack1_getScopeId] = require("'
					);

					return fn;
				},
				out: '(a=>()=>a)(3)',
				validate: fn => expect(fn()).toBe(3)
			});

			itSerializes('altered internal and external to eval, unmatched prefixes', {
				in() {
					const srcPath = createFixture(`
						'use strict';
						const livepack_tracker = 1;\n
						module.exports = eval('const livepack1_tracker = 2; eval("const livepack2_tracker = 3; () => [livepack_tracker, livepack1_tracker, livepack2_tracker]")');
					`);
					const fn = require(srcPath);

					// Sanity check: Ensure var used has changed prefix outside eval
					expect(transpiledFiles[srcPath].code).toInclude(
						'const [livepack1_tracker, livepack1_getScopeId] = require("'
					);

					return fn;
				},
				out: '(c=>b=>a=>()=>[c,b,a])(1)(2)(3)',
				validate: fn => expect(fn()).toEqual([1, 2, 3])
			});
		});

		describe('inner eval in function', () => {
			// `Object.setPrototypeOf` necessary because Jest creates `module.exports` in another
			// execution context, so prototype of `export` object is a *different* `Object.prototype`.
			// This is just an artefact of the testing environment - does not affect real code.
			const input = requireFixture(`
				Object.setPrototypeOf(exports, Object.prototype);

				const extA = 1;
				const outer = (0, function() {
					const extB = 2;
					return eval('() => {const extC = 3; return eval("const extD = 4; () => ({extA, extB, extC, extD, outer, module, exports, this: this, arguments: arguments})")}');
				});
				outer.isOuter = true;

				module.exports = outer.call({x: 5}, 6, 7, 8);
			`);

			itSerializes('serializes correctly', {
				in: () => input,
				strictEnv: false,
				out: `(()=>{
					const a={},
						b=(
							(extA,module,exports,outer)=>[
								outer=(0,function(){
									const extB=2;
									return eval("() => {const extC = 3; return eval(\\"const extD = 4; () => ({extA, extB, extC, extD, outer, module, exports, this: this, arguments: arguments})\\")}")
								}),
								(a,b,extB)=>function(){
									return()=>{
										const extC=3;
										return eval("const extD = 4; () => ({extA, extB, extC, extD, outer, module, exports, this: this, arguments: arguments})")
									}
								}.apply(a,b)
							]
						)(1,a,{}),
						c=b[1](
							{x:5},
							function(){return arguments}(6,7,8),
							2
						);
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
				in: () => input,
				validate: fn => expect(fn()().extD).toBe(4)
			});

			itSerializes('can access vars from internal scope of outer `eval()`', {
				in: () => input,
				validate: fn => expect(fn()().extC).toBe(3)
			});

			itSerializes('can access vars from immediate upper scope', {
				in: () => input,
				validate: fn => expect(fn()().extB).toBe(2)
			});

			itSerializes('can access vars from further upper scope', {
				in: () => input,
				validate(fn) {
					const res = fn()();
					expect(res.extA).toBe(1);
					expect(res.outer).toBeFunction();
					expect(res.outer.isOuter).toBeTrue();
				}
			});

			itSerializes('can access `this` from external context', {
				in: () => input,
				validate: fn => expect(fn()().this).toEqual({x: 5})
			});

			itSerializes('can access `arguments` from external context', {
				in: () => input,
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
			out: '(ext=>()=>eval("ext"))(1)',
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
			out: '()=>eval("typeof ext")',
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
			out: '()=>eval("[typeof module, typeof exports]")',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toEqual(['undefined', 'undefined']);
			}
		});
	});
});
