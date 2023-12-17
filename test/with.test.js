/* --------------------
 * livepack module
 * Tests for `with`
 * ------------------*/

/* eslint-disable strict, no-with */

// Imports

const support = require('./support/index.js'),
	itSerializes = support.itSerializes.withOptions({strictEnv: false}),
	{itSerializesEqual} = support;

// Tests

const spy = jest.fn;

describe('with statements', () => {
	describe('outside serialized function', () => {
		itSerializes('provides scope to function when no outer binding', {
			in() {
				with ({x: 123}) {
					return () => x; // eslint-disable-line no-undef
				}
			},
			out: '(a=>{with(a)return()=>x})({x:123})',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(123);
			}
		});

		itSerializes('provides scope to function when outer binding', {
			in() {
				const x = 456;
				with ({x: 123}) {
					return () => x;
				}
			},
			out: '(x=>a=>{with(a)return()=>x})(456)({x:123})',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(123);
			}
		});

		itSerializes('allows access to outer binding', {
			in() {
				const x = 456;
				with ({}) {
					return () => x;
				}
			},
			out: '(x=>a=>{with(a)return()=>x})(456)({})',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(456);
			}
		});

		itSerializes('allows access to global', {
			in() {
				with ({}) {
					return () => console;
				}
			},
			out: '(a=>{with(a)return()=>console})({})',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(console);
			}
		});

		describe('allows access to `this`', () => {
			itSerializes('when `with ()` not included in output', {
				in() {
					function outer() {
						with ({this: 2, a: 3}) {
							return () => this;
						}
					}
					return outer.call({x: 1});
				},
				out: '(a=>function(){return()=>this}.call(a))({x:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual({x: 1});
				}
			});

			itSerializes('when `with ()` included in output', {
				in() {
					const y = 2;
					function outer() {
						with ({this: 3, a: 4}) {
							return () => [this, y];
						}
					}
					return outer.call({x: 1});
				},
				out: `
					(y=>b=>function(){
						return a=>{
							with(a)return()=>[this,y]
						}
					}.call(b))(2)({x:1})({this:3,a:4})
				`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual([{x: 1}, 2]);
				}
			});
		});

		describe('allows access to `arguments`', () => {
			itSerializes('in sloppy mode function', {
				in() {
					function outer() {
						with ({a: 4}) {
							return () => arguments; // eslint-disable-line prefer-rest-params
						}
					}
					return outer(1, 2, 3);
				},
				out: '(arguments=>a=>{with(a)return()=>arguments})(function(){return arguments}(1,2,3))({a:4})',
				validate(fn) {
					expect(fn).toBeFunction();
					const args = fn();
					expect(args).toBeArguments();
					expect([...args]).toEqual([1, 2, 3]);
				}
			});

			itSerializes('in strict mode function', {
				in() {
					function outer() {
						with ({a: 4}) {
							return () => {
								'use strict';

								return arguments; // eslint-disable-line prefer-rest-params
							};
						}
					}
					return outer(1, 2, 3);
				},
				out: `
					(arguments=>a=>{
						with(a)return()=>{"use strict";return arguments}
					})(function(){return arguments}(1,2,3))({a:4})
				`,
				validate(fn) {
					expect(fn).toBeFunction();
					const args = fn();
					expect(args).toBeArguments();
					expect([...args]).toEqual([1, 2, 3]);
				}
			});
		});

		describe('allows access to `this` and `arguments` together', () => {
			itSerializes('in sloppy mode function', {
				in() {
					function outer() {
						with ({a: 5}) {
							return () => [this, arguments]; // eslint-disable-line prefer-rest-params
						}
					}
					return outer.call({x: 1}, 2, 3, 4);
				},
				out: `
					(
						(b,c)=>function(){
							return a=>{
								with(a)return()=>[this,arguments]
							}
						}.apply(b,c)
					)({x:1},function(){return arguments}(2,3,4))({a:5})
				`,
				validate(fn) {
					expect(fn).toBeFunction();
					const [that, args] = fn();
					expect(that).toEqual({x: 1});
					expect(args).toBeArguments();
					expect([...args]).toEqual([2, 3, 4]);
				}
			});

			itSerializes('in strict mode function', {
				in() {
					function outer() {
						with ({a: 5}) {
							return () => {
								'use strict';

								return [this, arguments]; // eslint-disable-line prefer-rest-params
							};
						}
					}
					return outer.call({x: 1}, 2, 3, 4);
				},
				out: `
					(
						(b,c)=>function(){
							return a=>{
								with(a)return()=>{
									"use strict";
									return[this,arguments]
								}
							}
						}.apply(b,c)
					)({x:1},function(){return arguments}(2,3,4))({a:5})
				`,
				validate(fn) {
					expect(fn).toBeFunction();
					const [that, args] = fn();
					expect(that).toEqual({x: 1});
					expect(args).toBeArguments();
					expect([...args]).toEqual([2, 3, 4]);
				}
			});
		});

		itSerializes('allows access to `this` when `arguments` also in scope tree', {
			in() {
				function outer() {
					let f;
					with ({x: 1}) f = (0, () => [x, this]); // eslint-disable-line no-undef
					return [f, () => arguments]; // eslint-disable-line prefer-rest-params
				}
				return outer.call({y: 2}, 3, 4, 5);
			},
			out: `(()=>{
				const a=(
					(b,c)=>function(){
						return[
							()=>c,
							a=>{with(a)return()=>[x,this]}
						]
					}.call(b)
				)({y:2},function(){return arguments}(3,4,5));return[a[1]({x:1}),a[0]]
			})()`,
			validate([fn1, fn2]) {
				expect(fn1).toBeFunction();
				expect(fn1()).toEqual([1, {y: 2}]);
				const args = fn2();
				expect(args).toBeArguments();
				expect([...args]).toEqual([3, 4, 5]);
			}
		});

		itSerializes('alters scope when `with` object property changed', {
			in() {
				const obj = {x: 123},
					x = 456;
				with (obj) {
					return [() => x, obj];
				}
			},
			out: `(()=>{
				const a={x:123};
				return[
					(x=>a=>{with(a)return()=>x})(456)(a),
					a
				]
			})()`,
			validate([fn, obj]) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(123);
				obj.x = 789;
				expect(fn()).toBe(789);
			}
		});

		itSerializes('alters scope when `with` object property deleted', {
			in() {
				const obj = {x: 123},
					x = 456;
				with (obj) {
					return [() => x, obj];
				}
			},
			out: `(()=>{
				const a={x:123};
				return[
					(x=>a=>{with(a)return()=>x})(456)(a),
					a
				]
			})()`,
			validate([fn, obj]) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(123);
				delete obj.x;
				expect(fn()).toBe(456);
			}
		});

		describe('allows access to `eval`', () => {
			/* eslint-disable no-eval */
			// This test fails because instrumentation replaces `eval` with `livepack_tracker.evalIndirect`,
			// and therefore avoids getting `eval` from `obj.eval` in the `with ()`.
			// TODO: Fix this
			itSerializes.skip('global', {
				in() {
					const obj = {eval: 123};
					with (obj) {
						return [() => eval, obj];
					}
				},
				out: `(()=>{
					const a={eval:123};
					return[(a=>{with(a)return()=>eval})(a),a]
				})()`,
				validate([fn, obj]) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(123);
					delete obj.eval;
					expect(fn()).toBe(eval);
				}
			});

			itSerializes('local var', {
				in() {
					const eval = 123; // eslint-disable-line no-shadow-restricted-names
					const obj = {eval: 456};
					with (obj) {
						return [() => eval, obj];
					}
				},
				out: `(()=>{
					const a={eval:456};
					return[(eval=>a=>{with(a)return()=>eval})(123)(a),a]
				})()`,
				validate([fn, obj]) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(456);
					delete obj.eval;
					expect(fn()).toBe(123);
				}
			});
			/* eslint-enable no-eval */
		});

		describe('calls method with correct `this` value', () => {
			itSerializes('executed before serialization', {
				in() {
					const obj = {
						foo() {
							return this === obj;
						}
					};

					with (obj) {
						return foo(); // eslint-disable-line no-undef
					}
				},
				out: 'true',
				validate(bool) {
					expect(bool).toBe(true);
				}
			});

			itSerializes('executed before serialization when method is called `eval`', {
				in() {
					const obj = {
						eval() {
							return this === obj;
						}
					};

					with (obj) {
						return eval('1'); // eslint-disable-line no-eval
					}
				},
				out: 'true',
				validate(bool) {
					expect(bool).toBe(true);
				}
			});

			itSerializes('in function which is serialized', {
				in() {
					const obj = {
						foo() {
							return this === obj;
						}
					};

					with (obj) {
						return () => foo(); // eslint-disable-line no-undef
					}
				},
				out: `(()=>{
					const a=(a=>[
							b=>a=b,
							{
								foo(){return this===a}
							}.foo
						])(),
						b={foo:a[1]};
					a[0](b);
					return(a=>{with(a)return()=>foo()})(b)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(true);
				}
			});
		});

		describe('invalid `with` values', () => {
			// These tests ensure instrumentation does not alter normal behavior of `with ()`
			it('`null`', () => {
				const called = spy();
				expect(() => {
					const val = null;
					with (val) called();
				}).toThrowWithMessage(TypeError, 'Cannot convert undefined or null to object');
				expect(called).not.toHaveBeenCalled();
			});

			it('`undefined`', () => {
				const called = spy();
				expect(() => {
					const val = undefined;
					with (val) called();
				}).toThrowWithMessage(TypeError, 'Cannot convert undefined or null to object');
				expect(called).not.toHaveBeenCalled();
			});
		});

		describe('non-object `with` values', () => {
			itSerializes('function', {
				in() {
					with (function foo() {}) {
						return () => name; // eslint-disable-line no-undef, no-restricted-globals
					}
				},
				out: '(a=>{with(a)return()=>name})(function foo(){})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe('foo');
				}
			});

			itSerializes('string', {
				in() {
					with ('foo') {
						return () => length; // eslint-disable-line no-undef, no-restricted-globals
					}
				},
				out: '(a=>{with(a)return()=>length})("foo")',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(3);
				}
			});

			itSerializes('number', {
				in() {
					with (123) {
						return () => toString();
					}
				},
				out: '(a=>{with(a)return()=>toString()})(123)',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe('123');
				}
			});

			itSerializes('bigint', {
				in() {
					with (12345678901234567890n) {
						return () => toString();
					}
				},
				out: '(a=>{with(a)return()=>toString()})(12345678901234567890n)',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe('12345678901234567890');
				}
			});

			itSerializes('symbol', {
				in() {
					with (Symbol('foo')) {
						return () => description; // eslint-disable-line no-undef
					}
				},
				out: '(a=>{with(a)return()=>description})(Symbol("foo"))',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe('foo');
				}
			});
		});

		describe("does not disrupt instrumentation's internal vars", () => {
			itSerializes('`livepack_tracker` + `livepack_setScopeId`', {
				in: `
					const x = 123;
					with ({livepack_tracker: 1, livepack_getScopeId: 2}) {
						const y = 456;
						module.exports = () => [x, y];
					}
				`,
				out: `(x=>b=>{
					with(b)return a=>()=>[x,a]
				})(123)({livepack_tracker:1,livepack_getScopeId:2})(456)`,
				validate(fn, {transpiled}) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual([123, 456]);

					// Check internal functions match the ones being tested for
					expect(transpiled).toInclude('const [livepack_tracker, livepack_getScopeId] = require(');
				}
			});

			itSerializes('`livepack_scopeId`', {
				in: `
					const fns = [];
					for (const x of [1, 2]) {
						with ({livepack_scopeId_4: 3}) {
							fns.push(() => x);
						}
					}
					module.exports = fns;
				`,
				out: `(()=>{
					const a=x=>a=>{with(a)return()=>x};
					return[
						a(1)({livepack_scopeId_4:3}),
						a(2)({livepack_scopeId_4:3})
					]
				})()`,
				validate(fns, {transpiled}) {
					expect(fns).toBeArrayOfSize(2);
					const [fn1, fn2] = fns;
					expect(fn1).toBeFunction();
					expect(fn1()).toBe(1);
					expect(fn2()).toBe(2);

					// Check internal var matches the one being tested for
					expect(transpiled)
						.toInclude('for (const x of [1, 2]) {const livepack_scopeId_4 = livepack_getScopeId();');
				}
			});

			itSerializes('`livepack_temp` for `with` object', {
				in: `
					with ({livepack_temp_6: 1, x: 2}) {
						module.exports = () => x;
					}
				`,
				out: '(a=>{with(a)return()=>x})({livepack_temp_6:1,x:2})',
				validate(fn, {transpiled}) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(2);

					// Check internal var match the one being tested for
					expect(transpiled.split('\n')[0]).toInclude(';let livepack_temp_6;');
				}
			});

			itSerializes('`livepack_temp` for class `super`', {
				in: `
					class S {
						foo() {
							return 123;
						}
					}
					with (Object.freeze({livepack_temp_20: 1})) module.exports = class C extends S {
						foo() {
							return super.foo();
						}
					}
				`,
				out: `(()=>{
					"use strict";
					const a=Object,
						b=a.setPrototypeOf,
						c=class S{},
						d=c.prototype,
						e=a.defineProperties,
						f=b(class C extends null{},c),
						g=(a=>[
							b=>a=b,
							{
								foo(){return Reflect.get(Object.getPrototypeOf(a.prototype),"foo",this).call(this)}
							}.foo
						])();
					e(d,{foo:{value:{foo(){return 123}}.foo,writable:true,configurable:true}});
					g[0](f);
					b(e(f.prototype,{foo:{value:g[1],writable:true,configurable:true}}),d);
					return f
				})()`,
				validate(C, {transpiled}) {
					expect(C).toBeFunction();
					const obj = new C();
					expect(obj.foo()).toBe(123);

					// Check temp var matches the one being tested for
					expect(transpiled.split('\n')[0]).toInclude('let livepack_temp_20;');
				}
			});

			itSerializes('`livepack_getFnInfo`', {
				in: `
					with ({livepack_getFnInfo_5: 1, livepack_getFnInfo_0: 2}) {
						module.exports = () => 123;
					}
				`,
				out: '()=>123',
				validate(fn, {transpiled}) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(123);

					// Check internal functions match the ones being tested for
					expect(transpiled).toInclude('function livepack_getFnInfo_5() {');
					expect(transpiled).toInclude('function livepack_getFnInfo_0() {');
				}
			});
		});
	});

	/* eslint-disable no-restricted-properties */
	describe('shimming `Object.prototype.__defineSetter__`', () => {
		it('does not interfere with its normal functioning', () => {
			const callee = spy();
			const obj = {};
			obj.__defineSetter__('foo', callee);
			expect(callee).not.toHaveBeenCalled();
			obj.foo = 123;
			expect(callee).toHaveBeenCalledOnce();
			expect(callee).toHaveBeenCalledWith(123);
		});

		itSerializesEqual('does not prevent serializing it', {
			in: () => Object.prototype.__defineSetter__,
			out: 'Object.prototype.__defineSetter__',
			validate(defineSetter) {
				expect(defineSetter).toBe(Object.prototype.__defineSetter__);
			}
		});
	});
	/* eslint-enable no-restricted-properties */
});
