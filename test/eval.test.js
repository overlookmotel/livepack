/* --------------------
 * livepack module
 * Tests for `eval`
 * ------------------*/

/* eslint-disable no-eval, global-require */

'use strict';

// Modules
const pathJoin = require('path').join,
	escapeRegex = require('escape-string-regexp');

// Imports
const {describeWithAllOptions, tryCatch, stripLineBreaks} = require('./support/index.js'),
	{transpiledFiles} = require('../lib/internal.js');

// Tests

// `globalThis` is not defined on Node v10
// eslint-disable-next-line node/no-unsupported-features/es-builtins
if (typeof globalThis === 'undefined') global.globalThis = global;

describeWithAllOptions('eval', ({expectSerializedEqual, run}) => {
	describe('evaluated before serialization', () => {
		describe('`eval()`', () => {
			describe('values', () => {
				it('literal', () => {
					expectSerializedEqual(eval('123'), '123', n => expect(n).toBe(123));
				});

				it('unscoped', () => {
					expectSerializedEqual(eval('({x: 1})'), '{x:1}', obj => expect(obj).toEqual({x: 1}));
				});

				it('external vars', () => {
					let input;
					const extA = {x: 1}; // eslint-disable-line no-unused-vars
					{
						const extB = {y: 2}; // eslint-disable-line no-unused-vars
						input = eval('[extA, extB]');
					}
					expectSerializedEqual(input, '[{x:1},{y:2}]', arr => expect(arr).toEqual([{x: 1}, {y: 2}]));
				});

				describe('`this`', () => {
					it('from enclosing function', () => {
						function outer() {
							return eval('this');
						}
						const input = outer.call({x: 1});
						expectSerializedEqual(input, '{x:1}', obj => expect(obj).toEqual({x: 1}));
					});

					it('from within arrow functions', () => {
						function outer() {
							return () => () => eval('this');
						}
						const input = outer.call({x: 1})()();
						expectSerializedEqual(input, '{x:1}', obj => expect(obj).toEqual({x: 1}));
					});
				});

				describe('`arguments`', () => {
					it('from enclosing function', () => {
						function outer() {
							return eval('arguments');
						}
						const input = outer({x: 1}, {y: 2});
						expectSerializedEqual(
							input,
							'function(){return arguments}({x:1},{y:2})',
							(args) => {
								expect(args.toString()).toBe('[object Arguments]');
								expect(args[0]).toEqual({x: 1});
								expect(args[1]).toEqual({y: 2});
							}
						);
					});

					it('from within arrow functions', () => {
						function outer() {
							return () => () => eval('arguments');
						}
						const input = outer({x: 1}, {y: 2})()();
						expectSerializedEqual(
							input,
							'function(){return arguments}({x:1},{y:2})',
							(args) => {
								expect(args.toString()).toBe('[object Arguments]');
								expect(args[0]).toEqual({x: 1});
								expect(args[1]).toEqual({y: 2});
							}
						);
					});
				});
			});

			describe('functions', () => {
				it('returning literal', () => {
					run(
						eval('() => 123'),
						'()=>123',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					);
				});

				it('returning unscoped', () => {
					run(
						eval('() => ({x: 1})'),
						'()=>({x:1})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					);
				});

				it('returning var local to eval', () => {
					run(
						eval('const x = {x: 1}; () => x'),
						'(a=>()=>a)({x:1})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					);
				});

				it('returning external vars', () => {
					let input;
					const extA = {x: 1}; // eslint-disable-line no-unused-vars
					{
						const extB = {y: 2}; // eslint-disable-line no-unused-vars
						input = eval('() => [extA, extB]');
					}
					run(
						input,
						'(b=>a=>()=>[b,a])({x:1})({y:2})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([{x: 1}, {y: 2}]);
						}
					);
				});

				describe('returning `this`', () => {
					it('from enclosing function', () => {
						function outer() {
							return eval('() => this');
						}
						const input = outer.call({x: 1});
						run(
							input,
							'(a=>()=>a)({x:1})',
							(fn) => {
								expect(fn).toBeFunction();
								expect(fn()).toEqual({x: 1});
							}
						);
					});

					it('from within arrow functions', () => {
						function outer() {
							return () => () => eval('() => this');
						}
						const input = outer.call({x: 1})()();
						run(
							input,
							'(a=>()=>a)({x:1})',
							(fn) => {
								expect(fn).toBeFunction();
								expect(fn()).toEqual({x: 1});
							}
						);
					});

					it('from within function inside eval', () => {
						function outer() {
							return eval('(function() { return this; })');
						}
						const input = outer.call({x: 1});
						run(
							input,
							'function(){return this}',
							(fn) => {
								expect(fn).toBeFunction();
								const ctx = {y: 2};
								expect(fn.call(ctx)).toBe(ctx);
							}
						);
					});
				});

				describe('returning `arguments`', () => {
					it('from enclosing function', () => {
						function outer() {
							return eval('() => arguments');
						}
						const input = outer({x: 1}, {y: 2});
						run(
							input,
							'(a=>()=>a)(function(){return arguments}({x:1},{y:2}))',
							(fn) => {
								expect(fn).toBeFunction();
								const res = fn();
								expect(res).toHaveOwnPropertyNames(['0', '1', 'length', 'callee']);
								expect(res.toString()).toBe('[object Arguments]');
								expect(res[0]).toEqual({x: 1});
								expect(res[1]).toEqual({y: 2});
							}
						);
					});

					it('from within arrow functions', () => {
						function outer() {
							return () => () => eval('() => arguments');
						}
						const input = outer({x: 1}, {y: 2})()();
						run(
							input,
							'(a=>()=>a)(function(){return arguments}({x:1},{y:2}))',
							(fn) => {
								expect(fn).toBeFunction();
								const res = fn();
								expect(res).toHaveOwnPropertyNames(['0', '1', 'length', 'callee']);
								expect(res.toString()).toBe('[object Arguments]');
								expect(res[0]).toEqual({x: 1});
								expect(res[1]).toEqual({y: 2});
							}
						);
					});

					it('from within function inside eval', () => {
						function outer() {
							return eval('(function() { return arguments; })');
						}
						const input = outer({a: 1}, {b: 2});
						run(
							input,
							'function(){return arguments}',
							(fn) => {
								expect(fn).toBeFunction();
								const arg1 = {x: 1},
									arg2 = {y: 2};
								const res = fn(arg1, arg2);
								expect(res).toHaveOwnPropertyNames(['0', '1', 'length', 'callee']);
								expect(res.toString()).toBe('[object Arguments]');
								expect(res[0]).toBe(arg1);
								expect(res[1]).toBe(arg2);
							}
						);
					});
				});

				describe('multiple `eval()`s do not confuse scopes', () => {
					it('in 1 function, called multiple times', () => {
						function create(ext) { // eslint-disable-line no-unused-vars
							return eval('() => ext');
						}
						const input = [
							create({x: 1}),
							create({y: 2}),
							create({z: 3})
						];

						run(
							input,
							stripLineBreaks(`
								(()=>{
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
								})()
							`),
							(arr) => {
								expect(arr).toBeArrayOfSize(3);
								const [fn1, fn2, fn3] = arr;
								expect(fn1).toBeFunction();
								expect(fn1()).toEqual({x: 1});
								expect(fn2).toBeFunction();
								expect(fn2()).toEqual({y: 2});
								expect(fn3).toBeFunction();
								expect(fn3()).toEqual({z: 3});
							}
						);
					});

					it('in different functions', () => {
						function createA(ext) { // eslint-disable-line no-unused-vars
							return eval('() => ext');
						}
						function createB(ext) { // eslint-disable-line no-unused-vars
							return eval('() => ext');
						}
						function createC(ext) { // eslint-disable-line no-unused-vars
							return eval('() => ext');
						}
						const input = [
							createA({x: 1}),
							createB({y: 2}),
							createC({z: 3})
						];

						run(
							input,
							'[(a=>()=>a)({x:1}),(a=>()=>a)({y:2}),(a=>()=>a)({z:3})]',
							(arr) => {
								expect(arr).toBeArrayOfSize(3);
								const [fn1, fn2, fn3] = arr;
								expect(fn1).toBeFunction();
								expect(fn1()).toEqual({x: 1});
								expect(fn2).toBeFunction();
								expect(fn2()).toEqual({y: 2});
								expect(fn3).toBeFunction();
								expect(fn3()).toEqual({z: 3});
							}
						);
					});
				});
			});

			it('multi-statement eval', () => {
				expectSerializedEqual(eval('const a = 123; a;'), '123', n => expect(n).toBe(123));
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
				it('altered external to eval', () => {
					const input = require('./fixtures/eval/prefix/external.js');

					// Sanity check: Ensure var used has changed prefix outside eval
					expect(getTranspiledCode('fixtures/eval/prefix/external.js'))
						.toInclude('const livepack1_tracker = require("');

					run(input, '(a=>()=>a)(1)', fn => expect(fn()).toBe(1));
				});

				it('altered internal to eval', () => {
					const input = require('./fixtures/eval/prefix/internal.js');

					// Sanity check: Ensure var used has not changed prefix outside eval
					expect(getTranspiledCode('fixtures/eval/prefix/internal.js'))
						.toInclude('const livepack_tracker = require("');

					run(input, '(a=>()=>a)(1)', fn => expect(fn()).toBe(1));
				});

				it('altered internal and external to eval, matched prefixes', () => {
					const input = require('./fixtures/eval/prefix/internalAndExternalMatched.js');

					// Sanity check: Ensure var used has changed prefix outside eval
					expect(getTranspiledCode('fixtures/eval/prefix/internalAndExternalMatched.js'))
						.toInclude('const livepack1_tracker = require("');

					run(input, '(a=>()=>a)(2)', fn => expect(fn()).toBe(2));
				});

				it('altered internal and external to eval, unmatched prefixes', () => {
					const input = require('./fixtures/eval/prefix/internalAndExternalUnmatched.js');

					// Sanity check: Ensure var used has changed prefix outside eval
					expect(getTranspiledCode('fixtures/eval/prefix/internalAndExternalUnmatched.js'))
						.toInclude('const livepack1_tracker = require("');

					run(input, '(b=>a=>()=>[b,a])(1)(2)', fn => expect(fn()).toEqual([1, 2]));
				});
			});
		});

		describe('indirect `eval`', () => {
			describe('values', () => {
				it('can evaluate literal', () => {
					expectSerializedEqual((0, eval)('123'), '123', n => expect(n).toBe(123));
				});

				it('can evaluate unscoped object value', () => {
					expectSerializedEqual((0, eval)('({x: 1})'), '{x:1}', obj => expect(obj).toEqual({x: 1}));
				});

				it('can evaluate var local to eval', () => {
					expectSerializedEqual((0, eval)('const x = 123; x'), '123', n => expect(n).toBe(123));
				});

				it('cannot access external vars', () => {
					const extA = {x: 1}; // eslint-disable-line no-unused-vars
					const input = (0, eval)('typeof extA');
					expectSerializedEqual(input, '"undefined"', ext => expect(ext).toBe('undefined'));
				});

				it('cannot access external `this`', () => {
					function outer() {
						return (0, eval)('this');
					}
					const input = outer.call({x: 1});
					expectSerializedEqual(input, 'globalThis', ctx => expect(ctx).toBe(global));
				});

				it('cannot access external `arguments`', () => {
					function outer() {
						return (0, eval)('typeof arguments');
					}
					const input = outer(1, 2, 3);
					expectSerializedEqual(input, '"undefined"', args => expect(args).toBe('undefined'));
				});
			});

			describe('functions', () => {
				it('returning literal', () => {
					run(
						(0, eval)('() => 123'),
						'()=>123',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					);
				});

				it('returning unscoped', () => {
					run(
						(0, eval)('() => ({x: 1})'),
						'()=>({x:1})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					);
				});

				it('returning var local to eval', () => {
					run(
						(0, eval)('const x = {x: 1}; () => x'),
						'(a=>()=>a)({x:1})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					);
				});

				it('cannot access external vars', () => {
					const extA = {x: 1}; // eslint-disable-line no-unused-vars
					const input = (0, eval)('() => typeof extA');
					run(
						input,
						'()=>typeof extA',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBe('undefined');
						}
					);
				});

				it('cannot access external `this`', () => {
					function outer() {
						return (0, eval)('() => this');
					}
					const input = outer.call({x: 1});
					run(
						input,
						'()=>this',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBe(global);
						}
					);
				});

				it('cannot access external `arguments`', () => {
					// This test is incompete. Only tests that the value returned from function
					// is *not* the arguments object of the outer function.
					// It doesn't test what it is, because it's not performing exactly right.
					// It's picking up the `arguments` object of the CJS loader function wrapping this module.
					// TODO Fix this.
					function outer() {
						return (0, eval)("() => typeof arguments === 'undefined' ? undefined : arguments");
					}
					const input = outer(1, 2, 3);
					run(
						input,
						'()=>typeof arguments==="undefined"?undefined:arguments',
						(fn, isSerialized) => {
							expect(fn).toBeFunction();
							if (isSerialized) expect(fn()[0]).not.toBe(1);
						}
					);
				});
			});
		});
	});

	describe('in functions which are serialized', () => {
		describe('`eval()`', () => {
			describe('values', () => {
				const input = require('./fixtures/eval/runtime/values.js');

				it('serializes correctly', () => {
					run(
						input,
						stripLineBreaks(`
							(()=>{
								const a={},
									b=(
										(extA,outer,extD,extE,module,exports)=>[
											a=>outer=a,
											function(){
												const extB=2;
												return()=>{
													const extC=3;
													return eval("({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
												}
											},
											(extB,a,b)=>function(){
												return()=>{
													const extC=3;
													return eval("({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
												}
											}.apply(a,b)
										]
									)(1,void 0,4,5,a,{}),
									c=b[2](
										2,
										{x:7},
										function(){
											return arguments
										}(8,9,10)
									);
								a.exports=c;
								b[0](
									Object.assign(
										b[1],
										{isOuter:true}
									)
								);
								return c
							})()
						`),
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBeObject();
						}
					);
				});

				it('can access vars from internal scope', () => {
					run(input, null, (fn) => {
						expect(fn().extC).toBe(3);
					});
				});

				it('can access vars from immediate upper scope', () => {
					run(input, null, (fn) => {
						expect(fn().extB).toBe(2);
					});
				});

				it('can access vars from further upper scope', () => {
					run(input, null, (fn) => {
						const res = fn();
						expect(res.extA).toBe(1);
						expect(res.outer).toBeFunction();
						expect(res.outer.isOuter).toBeTrue();
					});
				});

				it('can access vars declared later in file', () => {
					run(input, null, (fn) => {
						expect(fn().extD).toBe(4);
					});
				});

				it('can access vars declared with `var` in block nested in root', () => {
					run(input, null, (fn) => {
						expect(fn().extE).toBe(5);
					});
				});

				it('cannot access vars declared with `const` in block nested in root', () => {
					run(input, null, (fn) => {
						expect(fn().typeofExtF).toBe('undefined');
					});
				});

				it('can access `this` from external context', () => {
					run(input, null, (fn) => {
						expect(fn().this).toEqual({x: 7});
					});
				});

				it('can access `arguments` from external context', () => {
					run(input, null, (fn) => {
						const args = fn().arguments;
						expect(args).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'callee']);
						expect(args.toString()).toBe('[object Arguments]');
						expect(args[0]).toBe(8);
						expect(args[1]).toBe(9);
						expect(args[2]).toBe(10);
					});
				});
			});

			describe('values without context', () => {
				const input = require('./fixtures/eval/runtime/valuesWithoutCtx.js');

				it('serializes correctly', () => {
					run(
						input,
						stripLineBreaks(`
							(()=>{
								const a={},
									b=(
										(extA,outer,extD,extE,module,exports)=>[
											a=>outer=a,
											function(){
												const extB=2;
												return function(){
													const extC=3;
													return eval("({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
												}
											},
											extB=>function(){
												const extC=3;
												return eval("({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
											}
										]
									)(1,void 0,4,5,a,{}),
									c=b[2](2);
								a.exports=c;
								b[0](
									Object.assign(
										b[1],
										{isOuter:true}
									)
								);
								return c
							})()
						`),
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBeObject();
						}
					);
				});

				it('can access vars from internal scope', () => {
					run(input, null, (fn) => {
						expect(fn().extC).toBe(3);
					});
				});

				it('can access vars from immediate upper scope', () => {
					run(input, null, (fn) => {
						expect(fn().extB).toBe(2);
					});
				});

				it('can access vars from further upper scope', () => {
					run(input, null, (fn) => {
						const res = fn();
						expect(res.extA).toBe(1);
						expect(res.outer).toBeFunction();
						expect(res.outer.isOuter).toBeTrue();
					});
				});

				it('can access vars declared later in file', () => {
					run(input, null, (fn) => {
						expect(fn().extD).toBe(4);
					});
				});

				it('can access vars declared with `var` in block nested in root', () => {
					run(input, null, (fn) => {
						expect(fn().extE).toBe(5);
					});
				});

				it('cannot access vars declared with `const` in block nested in root', () => {
					run(input, null, (fn) => {
						expect(fn().typeofExtF).toBe('undefined');
					});
				});

				it('cannot access `this` from external context', () => {
					run(input, null, (fn) => {
						expect(fn.call({y: 77}).this).toEqual({y: 77});
					});
				});

				it('cannot access `arguments` from external context', () => {
					run(input, null, (fn) => {
						const args = fn(88, 99, 1010).arguments;
						expect(args).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'callee']);
						expect(args.toString()).toBe('[object Arguments]');
						expect(args[0]).toBe(88);
						expect(args[1]).toBe(99);
						expect(args[2]).toBe(1010);
					});
				});
			});

			describe('functions', () => {
				const input = require('./fixtures/eval/runtime/functions.js');

				it('serializes correctly', () => {
					run(
						input,
						stripLineBreaks(`
							(()=>{
								const a={},
									b=(
										(extA,outer,extD,extE,module,exports)=>[
											a=>outer=a,
											function(){
												const extB=2;
												return()=>{
													const extC=3;
													return eval("() => ({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
												}
											},
											(extB,a,b)=>function(){
												return()=>{
													const extC=3;
													return eval("() => ({extA, extB, extC, extD, extE, typeofExtF: typeof extF, outer, module, exports, this: this, arguments: arguments})")
												}
											}.apply(a,b)
										]
									)(1,void 0,4,5,a,{}),
									c=b[2](
										2,
										{x:7},
										function(){
											return arguments
										}(8,9,10)
									);
								a.exports=c;
								b[0](
									Object.assign(
										b[1],
										{isOuter:true}
									)
								);
								return c
							})()
						`),
						(fn) => {
							expect(fn).toBeFunction();
							const fnInner = fn();
							expect(fnInner).toBeFunction();
							expect(fnInner()).toBeObject();
						}
					);
				});

				it('can access vars from internal scope', () => {
					run(input, null, (fn) => {
						expect(fn()().extC).toBe(3);
					});
				});

				it('can access vars from immediate upper scope', () => {
					run(input, null, (fn) => {
						expect(fn()().extB).toBe(2);
					});
				});

				it('can access vars from further upper scope', () => {
					run(input, null, (fn) => {
						const res = fn()();
						expect(res.extA).toBe(1);
						expect(res.outer).toBeFunction();
						expect(res.outer.isOuter).toBeTrue();
					});
				});

				it('can access vars declared later in file', () => {
					run(input, null, (fn) => {
						expect(fn()().extD).toBe(4);
					});
				});

				it('can access vars declared with `var` in block nested in root', () => {
					run(input, null, (fn) => {
						expect(fn()().extE).toBe(5);
					});
				});

				it('cannot access vars declared with `const` in block nested in root', () => {
					run(input, null, (fn) => {
						expect(fn()().typeofExtF).toBe('undefined');
					});
				});

				it('can access `this` from external context', () => {
					run(input, null, (fn) => {
						expect(fn()().this).toEqual({x: 7});
					});
				});

				it('can access `arguments` from external context', () => {
					run(input, null, (fn) => {
						const args = fn()().arguments;
						expect(args).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'callee']);
						expect(args.toString()).toBe('[object Arguments]');
						expect(args[0]).toBe(8);
						expect(args[1]).toBe(9);
						expect(args[2]).toBe(10);
					});
				});
			});
		});

		describe('indirect `eval`', () => {
			describe('values', () => {
				it('can evaluate literal', () => {
					run(
						() => (0, eval)('123'),
						'()=>(0,eval)("123")',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					);
				});

				it('can evaluate unscoped object value', () => {
					run(
						() => (0, eval)('({x: 1})'),
						'()=>(0,eval)("({x: 1})")',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual({x: 1});
						}
					);
				});

				it('can evaluate var local to eval', () => {
					run(
						() => (0, eval)('const x = 123; x'),
						'()=>(0,eval)("const x = 123; x")',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBe(123);
						}
					);
				});

				it('cannot access external vars', () => {
					const extA = {x: 1}; // eslint-disable-line no-unused-vars
					run(
						() => (0, eval)('typeof extA'),
						'()=>(0,eval)("typeof extA")',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBe('undefined');
						}
					);
				});

				it('cannot access external `this`', () => {
					function outer() {
						return () => (0, eval)('this');
					}
					const input = outer.call({x: 1});
					run(
						input,
						'()=>(0,eval)("this")',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBe(global);
						}
					);
				});

				it('cannot access external `arguments`', () => {
					function outer() {
						return () => (0, eval)('typeof arguments');
					}
					const input = outer(1, 2, 3);
					run(
						input,
						'()=>(0,eval)("typeof arguments")',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toBe('undefined');
						}
					);
				});
			});

			describe('functions', () => {
				it('returning literal', () => {
					run(
						() => (0, eval)('() => 123'),
						'()=>(0,eval)("() => 123")',
						(fn) => {
							expect(fn).toBeFunction();
							const fnInner = fn();
							expect(fnInner).toBeFunction();
							expect(fnInner()).toBe(123);
						}
					);
				});

				it('returning unscoped', () => {
					run(
						() => (0, eval)('() => ({x: 1})'),
						'()=>(0,eval)("() => ({x: 1})")',
						(fn) => {
							expect(fn).toBeFunction();
							const fnInner = fn();
							expect(fnInner).toBeFunction();
							expect(fnInner()).toEqual({x: 1});
						}
					);
				});

				it('returning var local to eval', () => {
					run(
						() => (0, eval)('const x = {x: 1}; () => x'),
						'()=>(0,eval)("const x = {x: 1}; () => x")',
						(fn) => {
							expect(fn).toBeFunction();
							const fnInner = fn();
							expect(fnInner).toBeFunction();
							expect(fnInner()).toEqual({x: 1});
						}
					);
				});

				it('cannot access external vars', () => {
					const extA = {x: 1}; // eslint-disable-line no-unused-vars
					run(
						() => (0, eval)('() => typeof extA'),
						'()=>(0,eval)("() => typeof extA")',
						(fn) => {
							expect(fn).toBeFunction();
							const fnInner = fn();
							expect(fnInner).toBeFunction();
							expect(fnInner()).toBe('undefined');
						}
					);
				});

				it('cannot access external `this`', () => {
					run(
						function() { // eslint-disable-line prefer-arrow-callback
							return (0, eval)('() => this');
						},
						'function(){return(0,eval)("() => this")}',
						(fn) => {
							expect(fn).toBeFunction();
							const fnInner = fn.call({x: 1});
							expect(fnInner).toBeFunction();
							expect(fnInner()).toBe(global);
						}
					);
				});

				it('cannot access external `arguments`', () => {
					run(
						function() { // eslint-disable-line prefer-arrow-callback
							return (0, eval)('() => typeof arguments');
						},
						'function(){return(0,eval)("() => typeof arguments")}',
						(fn) => {
							expect(fn).toBeFunction();
							const fnInner = fn(1, 2, 3);
							expect(fnInner).toBeFunction();
							expect(fnInner()).toBe('undefined');
						}
					);
				});
			});
		});
	});

	describe('`eval()` within `eval()`', () => {
		it('with no prefix changes', () => {
			const ext = 1; // eslint-disable-line no-unused-vars
			run(
				eval('eval("() => ext")'),
				'(a=>()=>a)(1)',
				fn => expect(fn()).toBe(1)
			);
		});

		describe('with prefix changes', () => {
			it('altered external to eval', () => {
				const input = require('./fixtures/eval/evalInEval/prefix/external.js');

				// Sanity check: Ensure var used has changed prefix outside eval
				expect(getTranspiledCode('fixtures/eval/evalInEval/prefix/external.js'))
					.toInclude('const livepack1_tracker = require("');

				run(input, '(a=>()=>a)(1)', fn => expect(fn()).toBe(1));
			});

			it('altered internal to outer eval', () => {
				const input = require('./fixtures/eval/evalInEval/prefix/internal.js');

				// Sanity check: Ensure var used has not changed prefix outside eval
				expect(getTranspiledCode('fixtures/eval/evalInEval/prefix/internal.js'))
					.toInclude('const livepack_tracker = require("');

				run(input, '(a=>()=>a)(1)', fn => expect(fn()).toBe(1));
			});

			it('altered internal to inner eval', () => {
				const input = require('./fixtures/eval/evalInEval/prefix/internalInner.js');

				// Sanity check: Ensure var used has not changed prefix outside eval
				expect(getTranspiledCode('fixtures/eval/evalInEval/prefix/internalInner.js'))
					.toInclude('const livepack_tracker = require("');

				run(input, '(a=>()=>a)(1)', fn => expect(fn()).toBe(1));
			});

			it('altered internal and external to eval, matched prefixes', () => {
				const input = require('./fixtures/eval/evalInEval/prefix/internalAndExternalMatched.js');

				// Sanity check: Ensure var used has changed prefix outside eval
				expect(getTranspiledCode('fixtures/eval/evalInEval/prefix/internalAndExternalMatched.js'))
					.toInclude('const livepack1_tracker = require("');

				run(input, '(a=>()=>a)(3)', fn => expect(fn()).toBe(3));
			});

			it('altered internal and external to eval, unmatched prefixes', () => {
				const input = require('./fixtures/eval/evalInEval/prefix/internalAndExternalUnmatched.js');

				// Sanity check: Ensure var used has changed prefix outside eval
				expect(getTranspiledCode('fixtures/eval/evalInEval/prefix/internalAndExternalUnmatched.js'))
					.toInclude('const livepack1_tracker = require("');

				run(input, '(c=>b=>a=>()=>[c,b,a])(1)(2)(3)', fn => expect(fn()).toEqual([1, 2, 3]));
			});
		});

		describe('inner eval in function', () => {
			const input = require('./fixtures/eval/evalInEval/runtime.js');

			it('serializes correctly', () => {
				run(
					input,
					stripLineBreaks(`
						(()=>{
							const a={},
								b=(
									(extA,outer,module,exports)=>[
										a=>outer=a,
										function(){
											const extB=2;
											return eval("() => {const extC = 3; return eval(\\"const extD = 4; () => ({extA, extB, extC, extD, outer, module, exports, this: this, arguments: arguments})\\")}")
										},
										(a,b,extB)=>function(){
											return()=>{
												const extC=3;
												return eval("const extD = 4; () => ({extA, extB, extC, extD, outer, module, exports, this: this, arguments: arguments})")
											}
										}.apply(a,b)
									]
								)(1,void 0,a,{}),
								c=b[2](
									{x:5},
									function(){return arguments}(6,7,8),
									2
								);
							a.exports=c;
							b[0](Object.assign(b[1],{isOuter:true}));
							return c
						})()
					`),
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn()).toBeFunction();
					}
				);
			});

			it('can access vars from internal scope', () => {
				run(input, null, (fn) => {
					expect(fn()().extD).toBe(4);
				});
			});

			it('can access vars from internal scope of outer `eval()`', () => {
				run(input, null, (fn) => {
					expect(fn()().extC).toBe(3);
				});
			});

			it('can access vars from immediate upper scope', () => {
				run(input, null, (fn) => {
					expect(fn()().extB).toBe(2);
				});
			});

			it('can access vars from further upper scope', () => {
				run(input, null, (fn) => {
					const res = fn()();
					expect(res.extA).toBe(1);
					expect(res.outer).toBeFunction();
					expect(res.outer.isOuter).toBeTrue();
				});
			});

			it('can access `this` from external context', () => {
				run(input, null, (fn) => {
					expect(fn()().this).toEqual({x: 5});
				});
			});

			it('can access `arguments` from external context', () => {
				run(input, null, (fn) => {
					const args = fn()().arguments;
					expect(args).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'callee']);
					expect(args.toString()).toBe('[object Arguments]');
					expect(args[0]).toBe(6);
					expect(args[1]).toBe(7);
					expect(args[2]).toBe(8);
				});
			});
		});
	});
});

function getTranspiledCode(relativePath) {
	const path = pathJoin(__dirname, relativePath);
	return transpiledFiles[path].code;
}
