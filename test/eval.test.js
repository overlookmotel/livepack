/* --------------------
 * livepack module
 * Tests for `eval`
 * ------------------*/

/* eslint-disable strict, no-eval, lines-around-directive */

// Modules
const {serialize} = require('livepack');

// Imports
const {
	itSerializes, itSerializesEqual, stripSourceMapComment, stripLineBreaks
} = require('./support/index.js');

// Tests

describe('eval', () => {
	describe('serialized', () => {
		itSerializes('directly', {
			in: () => eval,
			out: 'eval',
			validate: e => expect(e).toBe(global.eval)
		});

		itSerializes('in object', {
			in: () => ({e: eval}),
			out: '{e:eval}',
			validate(obj) {
				expect(obj).toEqual({e: global.eval});
				expect(obj.e).toBe(global.eval);
			}
		});

		itSerializes('multiple references are de-duplicated', {
			in: () => ({e: eval, e2: eval}),
			out: '(()=>{const a=eval;return{e:a,e2:a}})()',
			validate(obj) {
				expect(obj).toEqual({e: global.eval, e2: global.eval});
				expect(obj.e).toBe(global.eval);
				expect(obj.e2).toBe(global.eval);
			}
		});

		itSerializes('in function scope', {
			in() {
				'use strict';
				const e = eval;
				return () => e;
			},
			out: '(a=>()=>a)(eval)',
			validate(fn) {
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
							'use strict';
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
							'use strict';
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
			});

			describe('functions', () => {
				'use strict';

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
				itSerializes('no argumuments returns undefined', {
					in: () => eval(),
					out: 'void 0',
					validate: res => expect(res).toBeUndefined()
				});

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
						'use strict';
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
						'use strict';
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
				expect(
					() => eval('return 123;')
				).toThrowWithMessage(SyntaxError, "'return' outside of function. (1:0)");
			});

			describe('cannot serialize function referring to `require`', () => {
				it('directly', () => {
					const fn = eval('() => require');
					expect(() => serialize(fn))
						.toThrowWithMessage(Error, `Cannot serialize \`require\` or \`import\` (in ${__filename})`);
				});

				it("via CommonJS wrapper function's `arguments`", () => {
					const fn = eval('() => arguments');
					expect(() => serialize(fn))
						.toThrowWithMessage(Error, `Cannot serialize \`require\` or \`import\` (in ${__filename})`);
				});
			});

			describe('can define vars named same as CommonJS vars', () => {
				'use strict';

				itSerializes('const', {
					in: () => eval('const module = 1, exports = 2, require = 3; () => [module, exports, require]'),
					out: '((a,b,c)=>()=>[a,b,c])(1,2,3)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([1, 2, 3]);
					}
				});

				itSerializes('let', {
					in: () => eval('let module = 1, exports = 2, require = 3; () => [module, exports, require]'),
					out: '((a,b,c)=>()=>[a,b,c])(1,2,3)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([1, 2, 3]);
					}
				});

				itSerializes('class declaration', {
					in: () => eval(`
						class module {}
						class exports {}
						class require {}
						() => [module, exports, require]
					`),
					out: '((a,b,c)=>()=>[a,b,c])(class module{},class exports{},class require{})',
					validate(fn) {
						expect(fn).toBeFunction();
						const classes = fn();
						expect(classes).toBeArrayOfSize(3);
						classes.forEach(klass => expect(klass).toBeFunction());
					}
				});
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

			describe('`var` statements in `eval()`', () => {
				describe('create var in parent function in sloppy mode', () => {
					itSerializes('no prefix change', {
						in() {
							expect(typeof x).toBe('undefined');
							const getX1 = eval('var x = 123; () => x');
							const [getX2, setX] = eval('var x; [() => x, v => { x = v; }]');
							return {getX1, getX2, setX, x}; // eslint-disable-line no-undef
						},
						out: `(()=>{
							const a=(0,eval)("b=>[()=>b,()=>b,a=>{b=a}]")(123);
							return{getX1:a[0],getX2:a[1],setX:a[2],x:123}
						})()`,
						validate({getX1, getX2, setX, x}) {
							expect(x).toBe(123);
							expect(getX1()).toBe(123);
							expect(getX2()).toBe(123);
							setX(456);
							expect(getX1()).toBe(456);
							expect(getX2()).toBe(456);
							expect(global.x).toBeUndefined();
						}
					});

					itSerializes('with prefix change', {
						in() {
							expect(typeof x).toBe('undefined');
							const getX1 = eval('let livepack_tracker; var x = 123; () => x');
							const [getX2, setX] = eval('let livepack_tracker; var x; [() => x, v => { x = v; }]');
							return {getX1, getX2, setX, x}; // eslint-disable-line no-undef
						},
						out: `(()=>{
							const a=(0,eval)("b=>[()=>b,()=>b,a=>{b=a}]")(123);
							return{getX1:a[0],getX2:a[1],setX:a[2],x:123}
						})()`,
						validate({getX1, getX2, setX, x}) {
							expect(x).toBe(123);
							expect(getX1()).toBe(123);
							expect(getX2()).toBe(123);
							setX(456);
							expect(getX1()).toBe(456);
							expect(getX2()).toBe(456);
							expect(global.x).toBeUndefined();
						}
					});
				});

				describe('create var in parent function in sloppy mode when `eval()` inside `eval()`', () => {
					itSerializes('no prefix change', {
						in() {
							expect(typeof x).toBe('undefined');
							const getX1 = eval('eval("var x = 123; () => x")');
							const [getX2, setX] = eval('eval("var x; [() => x, v => { x = v; }]")');
							return {getX1, getX2, setX, x}; // eslint-disable-line no-undef
						},
						out: `(()=>{
							const a=(0,eval)("b=>[()=>b,()=>b,a=>{b=a}]")(123);
							return{getX1:a[0],getX2:a[1],setX:a[2],x:123}
						})()`,
						validate({getX1, getX2, setX, x}) {
							expect(x).toBe(123);
							expect(getX1()).toBe(123);
							expect(getX2()).toBe(123);
							setX(456);
							expect(getX1()).toBe(456);
							expect(getX2()).toBe(456);
							expect(global.x).toBeUndefined();
						}
					});

					itSerializes('with prefix change in outer `eval()`', {
						in() {
							expect(typeof x).toBe('undefined');
							const getX1 = eval('let livepack_tracker; eval("var x = 123; () => x")');
							const [getX2, setX] = eval(
								'let livepack_tracker; eval("var x; [() => x, v => { x = v; }]")'
							);
							return {getX1, getX2, setX, x}; // eslint-disable-line no-undef
						},
						out: `(()=>{
							const a=(0,eval)("b=>[()=>b,()=>b,a=>{b=a}]")(123);
							return{getX1:a[0],getX2:a[1],setX:a[2],x:123}
						})()`,
						validate({getX1, getX2, setX, x}) {
							expect(x).toBe(123);
							expect(getX1()).toBe(123);
							expect(getX2()).toBe(123);
							setX(456);
							expect(getX1()).toBe(456);
							expect(getX2()).toBe(456);
							expect(global.x).toBeUndefined();
						}
					});

					itSerializes('with prefix change in inner `eval()`', {
						in() {
							expect(typeof x).toBe('undefined');
							const getX1 = eval('eval("let livepack_tracker; var x = 123; () => x")');
							const [getX2, setX] = eval(
								'eval("let livepack_tracker; var x; [() => x, v => { x = v; }]")'
							);
							return {getX1, getX2, setX, x}; // eslint-disable-line no-undef
						},
						out: `(()=>{
							const a=(0,eval)("b=>[()=>b,()=>b,a=>{b=a}]")(123);
							return{getX1:a[0],getX2:a[1],setX:a[2],x:123}
						})()`,
						validate({getX1, getX2, setX, x}) {
							expect(x).toBe(123);
							expect(getX1()).toBe(123);
							expect(getX2()).toBe(123);
							setX(456);
							expect(getX1()).toBe(456);
							expect(getX2()).toBe(456);
							expect(global.x).toBeUndefined();
						}
					});

					itSerializes('with prefix changes in both `eval()`s', {
						in() {
							expect(typeof x).toBe('undefined');
							const getX1 = eval(
								'let livepack_tracker; eval("let livepack1_tracker; var x = 123; () => x")'
							);
							const [getX2, setX] = eval(
								'let livepack_tracker; eval("let livepack1_tracker; var x; [() => x, v => { x = v; }]")'
							);
							return {getX1, getX2, setX, x}; // eslint-disable-line no-undef
						},
						out: `(()=>{
							const a=(0,eval)("b=>[()=>b,()=>b,a=>{b=a}]")(123);
							return{getX1:a[0],getX2:a[1],setX:a[2],x:123}
						})()`,
						validate({getX1, getX2, setX, x}) {
							expect(x).toBe(123);
							expect(getX1()).toBe(123);
							expect(getX2()).toBe(123);
							setX(456);
							expect(getX1()).toBe(456);
							expect(getX2()).toBe(456);
							expect(global.x).toBeUndefined();
						}
					});
				});

				describe('create local var in strict mode', () => {
					describe('strict mode inherited from outside `eval()`', () => {
						itSerializes('no prefix change', {
							in() {
								'use strict';
								const [getX1, setX1] = eval('var x = 1; [() => x, v => { x = v; }]');
								const [getX2, setX2] = eval('var x = 2; [() => x, v => { x = v; }]');
								return {getX1, setX1, getX2, setX2, typeofOuterX: typeof x};
							},
							out: `(()=>{
								const a=(b=>[()=>b,a=>{b=a}])(1),
									b=(b=>[()=>b,a=>{b=a}])(2);
								return{getX1:a[0],setX1:a[1],getX2:b[0],setX2:b[1],typeofOuterX:"undefined"}
							})()`,
							validate({getX1, setX1, getX2, setX2, typeofOuterX}) {
								expect(getX1()).toBe(1);
								expect(getX2()).toBe(2);
								setX1(3);
								setX2(4);
								expect(getX1()).toBe(3);
								expect(getX2()).toBe(4);
								expect(typeofOuterX).toBe('undefined');
								expect(global.x).toBeUndefined();
							}
						});

						itSerializes('with prefix change', {
							in() {
								'use strict';
								const [getX1, setX1] = eval(
									'let livepack_tracker; var x = 1; [() => x, v => { x = v; }]'
								);
								const [getX2, setX2] = eval(
									'let livepack_tracker; var x = 2; [() => x, v => { x = v; }]'
								);
								return {getX1, setX1, getX2, setX2, typeofOuterX: typeof x};
							},
							out: `(()=>{
								const a=(b=>[()=>b,a=>{b=a}])(1),
									b=(b=>[()=>b,a=>{b=a}])(2);
								return{getX1:a[0],setX1:a[1],getX2:b[0],setX2:b[1],typeofOuterX:"undefined"}
							})()`,
							validate({getX1, setX1, getX2, setX2, typeofOuterX}) {
								expect(getX1()).toBe(1);
								expect(getX2()).toBe(2);
								setX1(3);
								setX2(4);
								expect(getX1()).toBe(3);
								expect(getX2()).toBe(4);
								expect(typeofOuterX).toBe('undefined');
								expect(global.x).toBeUndefined();
							}
						});
					});

					describe('strict mode entered inside `eval()`', () => {
						itSerializes('no prefix change', {
							in() {
								const [getX1, setX1] = eval('"use strict"; var x = 1; [() => x, v => { x = v; }]');
								const [getX2, setX2] = eval('"use strict"; var x = 2; [() => x, v => { x = v; }]');
								return {getX1, setX1, getX2, setX2, typeofOuterX: typeof x};
							},
							out: `(()=>{
								const a=(b=>[()=>b,a=>{b=a}])(1),
									b=(b=>[()=>b,a=>{b=a}])(2);
								return{getX1:a[0],setX1:a[1],getX2:b[0],setX2:b[1],typeofOuterX:"undefined"}
							})()`,
							validate({getX1, setX1, getX2, setX2, typeofOuterX}) {
								expect(getX1()).toBe(1);
								expect(getX2()).toBe(2);
								setX1(3);
								setX2(4);
								expect(getX1()).toBe(3);
								expect(getX2()).toBe(4);
								expect(typeofOuterX).toBe('undefined');
								expect(global.x).toBeUndefined();
							}
						});

						itSerializes('with prefix change', {
							in() {
								const [getX1, setX1] = eval(
									'"use strict"; let livepack_tracker; var x = 1; [() => x, v => { x = v; }]'
								);
								const [getX2, setX2] = eval(
									'"use strict"; let livepack_tracker; var x = 2; [() => x, v => { x = v; }]'
								);
								return {getX1, setX1, getX2, setX2, typeofOuterX: typeof x};
							},
							out: `(()=>{
								const a=(b=>[()=>b,a=>{b=a}])(1),
									b=(b=>[()=>b,a=>{b=a}])(2);
								return{getX1:a[0],setX1:a[1],getX2:b[0],setX2:b[1],typeofOuterX:"undefined"}
							})()`,
							validate({getX1, setX1, getX2, setX2, typeofOuterX}) {
								expect(getX1()).toBe(1);
								expect(getX2()).toBe(2);
								setX1(3);
								setX2(4);
								expect(getX1()).toBe(3);
								expect(getX2()).toBe(4);
								expect(typeofOuterX).toBe('undefined');
								expect(global.x).toBeUndefined();
							}
						});
					});
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

			describe('`var` statements in indirect `eval`', () => {
				itSerializes('create global var in sloppy mode', {
					in() {
						const x = 123;
						return (() => {
							const getX = (0, eval)('var x = 456; () => x');
							const outerX = x,
								globalX = global.x;
							delete global.x;
							return {getX, outerX, globalX};
						})();
					},
					strictEnv: false,
					out: '{getX:(0,()=>x),outerX:123,globalX:456}',
					validate({getX, outerX, globalX}) {
						expect(outerX).toBe(123);
						expect(globalX).toBe(456);

						global.x = 789;
						try {
							expect(getX()).toBe(789);
						} finally {
							delete global.x;
						}
					}
				});

				itSerializes(
					'create global var in sloppy mode when `var` statement inside nested direct `eval()`',
					{
						in() {
							const x = 123;
							return (() => {
								const getX = (0, eval)('eval("var x = 456; () => x")');
								const outerX = x,
									globalX = global.x;
								delete global.x;
								return {getX, outerX, globalX};
							})();
						},
						strictEnv: false,
						out: '{getX:(0,()=>x),outerX:123,globalX:456}',
						validate({getX, outerX, globalX}) {
							expect(outerX).toBe(123);
							expect(globalX).toBe(456);

							global.x = 789;
							try {
								expect(getX()).toBe(789);
							} finally {
								delete global.x;
							}
						}
					}
				);

				itSerializes('create local var in strict mode', {
					in() {
						const x = 123;
						return (() => {
							const getX = (0, eval)('"use strict"; var x = 456; () => x;');
							const outerX = x,
								globalX = global.x;
							return {getX, outerX, globalX};
						})();
					},
					out: '{getX:(a=>()=>a)(456),outerX:123,globalX:void 0}',
					validate({getX, outerX, globalX}) {
						expect(outerX).toBe(123);
						expect(globalX).toBeUndefined();
						expect(getX()).toBe(456);
					}
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
			'use strict';

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
				'use strict';
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

	describe('`global.eval` can be written to and maintains correct behavior after restored', () => {
		it('with `eval = ...`', () => {
			const x = 123; // eslint-disable-line no-unused-vars

			const evalOriginal = eval;
			eval = () => 456; // eslint-disable-line no-global-assign

			try {
				expect(eval('x')).toBe(456);
				expect((0, eval)('typeof x')).toBe(456);
			} finally {
				eval = evalOriginal; // eslint-disable-line no-global-assign
			}

			expect(eval('x')).toBe(123);
			expect((0, eval)('typeof x')).toBe('undefined');
		});

		it('with `global.eval = ...`', () => {
			const x = 123; // eslint-disable-line no-unused-vars

			const evalOriginal = global.eval;
			global.eval = () => 456;

			try {
				expect(eval('x')).toBe(456);
				expect((0, eval)('typeof x')).toBe(456);
			} finally {
				global.eval = evalOriginal;
			}

			expect(eval('x')).toBe(123);
			expect((0, eval)('typeof x')).toBe('undefined');
		});
	});

	itSerializes('`global.eval` instruments code', {
		in: () => global.eval('const x = 123; () => x;'),
		strictEnv: false,
		out: '(a=>()=>a)(123)',
		validate(fn) {
			expect(fn).toBeFunction();
			expect(fn()).toBe(123);
		}
	});
});
