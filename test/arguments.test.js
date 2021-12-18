/* --------------------
 * livepack module
 * Tests for `arguments` within functions
 * ------------------*/

/* eslint-disable strict, prefer-rest-params */
// NB No strict mode to allow tests for when `arguments` is a user-defined var.

// Imports
const itSerializes = require('./support/index.js').itSerializes.withOptions({strictEnv: false});

// Tests

describe('Arguments object', () => {
	itSerializes('empty', {
		in() {
			function createArgs() { return arguments; }
			return createArgs();
		},
		out: 'function(){return arguments}()',
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(0);
		}
	});

	itSerializes('not empty', {
		in() {
			function createArgs() { return arguments; }
			return createArgs({argA: 1}, {argB: 2});
		},
		out: 'function(){return arguments}({argA:1},{argB:2})',
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(2);
			expect(args[0]).toEqual({argA: 1});
			expect(args[1]).toEqual({argB: 2});
		}
	});

	itSerializes('with elements deleted', {
		in() {
			function createArgs() { return arguments; }
			const args = createArgs(0, 0, {argA: 1}, 0, 0, {argB: 2}, 0, 0);
			delete args[0];
			delete args[1];
			delete args[3];
			delete args[4];
			delete args[6];
			delete args[7];
			return args;
		},
		out: `(()=>{
			const a=void 0,
				b=Object.assign(
					function(){return arguments}(a,a,{argA:1},a,a,{argB:2}),
					{length:8}
				);
			delete b[4];
			delete b[3];
			delete b[1];
			delete b[0];
			return b
		})()`,
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(8);
			expect(args).toHaveOwnPropertyNames(['2', '5', 'length', 'callee']);
			expect(args[2]).toEqual({argA: 1});
			expect(args[5]).toEqual({argB: 2});
		}
	});

	itSerializes('with length property changed to less', {
		in() {
			function createArgs() { return arguments; }
			const args = createArgs({argA: 1}, {argB: 2});
			args.length = 1;
			return args;
		},
		out: `
			Object.assign(
				function(){return arguments}({argA:1},{argB:2}),
				{length:1}
			)
		`,
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(1);
			expect(args).toHaveOwnPropertyNames(['0', '1', 'length', 'callee']);
			expect(args[0]).toEqual({argA: 1});
			expect(args[1]).toEqual({argB: 2});
		}
	});

	itSerializes('with length property changed to more', {
		in() {
			function createArgs() { return arguments; }
			const args = createArgs({argA: 1}, {argB: 2});
			args.length = 4;
			return args;
		},
		out: `
			Object.assign(
				function(){return arguments}({argA:1},{argB:2}),
				{length:4}
			)
		`,
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(4);
			expect(args).toHaveOwnPropertyNames(['0', '1', 'length', 'callee']);
			expect(args[0]).toEqual({argA: 1});
			expect(args[1]).toEqual({argB: 2});
		}
	});

	itSerializes('with length property deleted', {
		in() {
			function createArgs() { return arguments; }
			const args = createArgs({argA: 1}, {argB: 2});
			delete args.length;
			return args;
		},
		out: `(()=>{
			const a=function(){return arguments}({argA:1},{argB:2});
			delete a.length;
			return a
		})()`,
		validate(args) {
			expect(args).toBeArguments();
			expect(args.length).toBeUndefined();
			expect(args).toHaveOwnPropertyNames(['0', '1', 'callee']);
			expect(args[0]).toEqual({argA: 1});
			expect(args[1]).toEqual({argB: 2});
		}
	});

	itSerializes('with elements added', {
		in() {
			function createArgs() { return arguments; }
			const args = createArgs({argA: 1}, {argB: 2});
			args[2] = {argC: 3};
			args[5] = {argD: 4};
			return args;
		},
		out: `(()=>{
			const a=void 0,
				b=Object.assign(
					function(){return arguments}({argA:1},{argB:2},{argC:3},a,a,{argD:4}),
					{length:2}
				);
			delete b[4];
			delete b[3];
			return b
		})()`,
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(2);
			expect(args).toHaveOwnPropertyNames(['0', '1', '2', '5', 'length', 'callee']);
			expect(args[0]).toEqual({argA: 1});
			expect(args[1]).toEqual({argB: 2});
			expect(args[2]).toEqual({argC: 3});
			expect(args[5]).toEqual({argD: 4});
		}
	});

	itSerializes('extra properties', {
		in() {
			function outer() {
				return arguments;
			}
			const args = outer({argA: 1}, {argB: 2});
			args.x = 3;
			args[3] = 4;
			args[5] = 5;
			return args;
		},
		out: `(()=>{
			const a=void 0,
				b=Object.assign(
					function(){return arguments}({argA:1},{argB:2},a,4,a,5),
					{
						length:2,
						x:3
					}
				);
			delete b[4];
			delete b[2];
			return b
		})()`,
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(2);
			expect(args).toHaveOwnPropertyNames(['0', '1', '3', '5', 'length', 'callee', 'x']);
			expect(args[0]).toEqual({argA: 1});
			expect(args[1]).toEqual({argB: 2});
			expect(args.x).toBe(3);
			expect(args[3]).toBe(4);
			expect(args[5]).toBe(5);
		}
	});

	itSerializes('descriptors altered', {
		in() {
			function fn() {
				return arguments;
			}
			const args = fn({argA: 1}, {argB: 2});
			Object.defineProperty(args, 0, {enumerable: false});
			Object.defineProperty(args, 1, {writable: false, configurable: false});
			return args;
		},
		out: `
			Object.defineProperties(
				function(){return arguments}({argA:1},{argB:2}),
				{0:{enumerable:false},1:{writable:false,configurable:false}}
			)
		`,
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(2);
			expect(args).toHaveOwnPropertyNames(['0', '1', 'length', 'callee']);
			expect(args[0]).toEqual({argA: 1});
			expect(args[1]).toEqual({argB: 2});
			expect(args).toHaveDescriptorModifiersFor(0, true, false, true);
			expect(args).toHaveDescriptorModifiersFor(1, false, true, false);
		}
	});

	itSerializes('getter + setter', {
		in() {
			function fn() {
				return arguments;
			}
			const args = fn({argA: 1}, {argB: 2});
			Object.defineProperty(args, 0, {
				get() { return 3; },
				set(v) { this[1] = v; }
			});
			return args;
		},
		out: `
			Object.defineProperties(
				function(){return arguments}(void 0,{argB:2}),
				{0:{get(){return 3},set(a){this[1]=a}}}
			)
		`,
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(2);
			expect(args).toHaveOwnPropertyNames(['0', '1', 'length', 'callee']);
			expect(args[0]).toBe(3);
			expect(args[1]).toEqual({argB: 2});
			args[0] = 4;
			expect(args[1]).toBe(4);
		}
	});

	itSerializes('prototype altered', {
		in() {
			function fn() {
				return arguments;
			}
			const args = fn({argA: 1}, {argB: 2});
			Object.setPrototypeOf(args, Date.prototype);
			return args;
		},
		out: 'Object.setPrototypeOf(function(){return arguments}({argA:1},{argB:2}),Date.prototype)',
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(2);
			expect(args).toHaveOwnPropertyNames(['0', '1', 'length', 'callee']);
			expect(args[0]).toEqual({argA: 1});
			expect(args[1]).toEqual({argB: 2});
			expect(args).toHavePrototype(Date.prototype);
		}
	});

	itSerializes('circular elements', {
		in() {
			function createArgs() { return arguments; }
			const args = createArgs(0, {argA: 1}, 0);
			args[0] = args;
			args[2] = args;
			return args;
		},
		out: `(()=>{
			const a=void 0,
				b=function(){return arguments}(a,{argA:1},a);
			b[0]=b;
			b[2]=b;
			return b
		})()`,
		validate(args) {
			expect(args).toBeArguments();
			expect(args).toHaveLength(3);
			expect(args).toHaveOwnPropertyNames(['0', '1', '2', 'length', 'callee']);
			expect(args[0]).toBe(args);
			expect(args[1]).toEqual({argA: 1});
			expect(args[2]).toBe(args);
		}
	});
});

describe('Functions including `arguments`', () => {
	describe('referencing upper function scope', () => {
		describe('1 level up', () => {
			itSerializes('single instantiation', {
				in() {
					function outer() {
						return () => arguments;
					}
					return outer({argA: 1}, {argB: 2});
				},
				out: '(a=>()=>a)(function(){return arguments}({argA:1},{argB:2}))',
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArguments();
					expect(res).toHaveLength(2);
					expect(res[0]).toEqual({argA: 1});
					expect(res[1]).toEqual({argB: 2});
				}
			});

			itSerializes('multiple instantiations', {
				in({ctx}) {
					const args = [1, 2, 3].map(n => ([{[`argA${n}`]: n + 10}, {[`argB${n}`]: n + 20}]));
					ctx.args = args;

					function outer() {
						return () => arguments;
					}
					return args.map(([argA, argB]) => outer(argA, argB));
				},
				out: `(()=>{
					const a=a=>()=>a,
						b=(0,function(){return arguments});
					return[
						a(b({argA1:11},{argB1:21})),
						a(b({argA2:12},{argB2:22})),
						a(b({argA3:13},{argB3:23}))
					]
				})()`,
				validate(arr, {ctx: {args}}) {
					expect(arr).toBeArrayOfSize(3);
					arr.forEach((fn, index) => {
						expect(fn).toBeFunction();
						const [argA, argB] = args[index];
						const res = fn();
						expect(res).toBeArguments();
						expect(res).toHaveLength(2);
						expect(res[0]).toEqual(argA);
						expect(res[1]).toEqual(argB);
					});
				}
			});

			describe('with clashing var names', () => {
				itSerializes('outer params', {
					in() {
						function outer(arguments$0, arguments$1) {
							return () => [arguments, arguments$0, arguments$1];
						}
						return outer({extA: 1}, {extB: 2});
					},
					out: `(()=>{
						const a={extA:1},b={extB:2};
						return((a,b,c)=>()=>[a,b,c])(function(){return arguments}(a,b),a,b)
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toBeArrayOfSize(3);
						expect(res[0]).toBeArguments();
						expect(res[0]).toHaveLength(2);
						expect(res[0][0]).toEqual({extA: 1});
						expect(res[0][1]).toEqual({extB: 2});
						expect(res[1]).toBe(res[0][0]);
						expect(res[2]).toBe(res[0][1]);
					}
				});

				itSerializes('inner params', {
					in() {
						function outer() {
							return (arguments$0, arguments$1) => [arguments, arguments$0, arguments$1];
						}
						return outer({argA: 1}, {argB: 2});
					},
					out: '(c=>(a,b)=>[c,a,b])(function(){return arguments}({argA:1},{argB:2}))',
					validate(fn) {
						expect(fn).toBeFunction();
						const param1 = {},
							param2 = {};
						const res = fn(param1, param2);
						expect(res).toBeArrayOfSize(3);
						expect(res[0]).toBeArguments();
						expect(res[0]).toHaveLength(2);
						expect(res[0][0]).toEqual({argA: 1});
						expect(res[0][1]).toEqual({argB: 2});
						expect(res[1]).toBe(param1);
						expect(res[2]).toBe(param2);
					}
				});

				itSerializes('outer and inner params', {
					in() {
						function outer(arguments$0) {
							return arguments$1 => [arguments, arguments$0, arguments$1];
						}
						return outer({extA: 1}, {argB: 2});
					},
					out: `(()=>{
						const a={extA:1};
						return((b,c)=>a=>[b,c,a])(function(){return arguments}(a,{argB:2}),a)
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						const param = {};
						const res = fn(param);
						expect(res).toBeArrayOfSize(3);
						expect(res[0]).toBeArguments();
						expect(res[0]).toHaveLength(2);
						expect(res[0][0]).toEqual({extA: 1});
						expect(res[0][1]).toEqual({argB: 2});
						expect(res[1]).toBe(res[0][0]);
						expect(res[2]).toBe(param);
					}
				});
			});
		});

		describe('2 levels up', () => {
			itSerializes('single instantiation', {
				in() {
					function outer() {
						return extA => () => [arguments, extA];
					}
					return outer({argA: 1}, {argB: 2})({extA: 3});
				},
				out: '(b=>a=>()=>[b,a])(function(){return arguments}({argA:1},{argB:2}))({extA:3})',
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(2);
					expect(res[0]).toBeArguments();
					expect(res[0]).toHaveLength(2);
					expect(res[0][0]).toEqual({argA: 1});
					expect(res[0][1]).toEqual({argB: 2});
					expect(res[1]).toEqual({extA: 3});
				}
			});

			itSerializes('multiple instantiations', {
				in({ctx}) {
					const exts = [
						{argA: {argA1: 1}, argB: {argB1: 11}, extA: {extA1: 12}},
						{argA: {argA2: 2}, argB: {argB2: 21}, extA: {extA2: 22}},
						{argA: {argA3: 3}, argB: {argB3: 31}, extA: {extA3: 32}}
					];
					ctx.exts = exts;

					function outer() {
						return extA => () => [arguments, extA];
					}
					return exts.map(({argA, argB, extA}) => outer(argA, argB)(extA));
				},
				out: `(()=>{
					const a=b=>a=>()=>[b,a],
						b=(0,function(){return arguments});
					return[
						a(b({argA1:1},{argB1:11}))({extA1:12}),
						a(b({argA2:2},{argB2:21}))({extA2:22}),
						a(b({argA3:3},{argB3:31}))({extA3:32})
					]
				})()`,
				validate(arr, {ctx: {exts}}) {
					expect(arr).toBeArrayOfSize(3);
					arr.forEach((fn, index) => {
						expect(fn).toBeFunction();
						const res = fn();
						const {argA, argB, extA} = exts[index];
						expect(res).toBeArrayOfSize(2);
						expect(res[0]).toBeArguments();
						expect(res[0]).toHaveLength(2);
						expect(res[0][0]).toEqual(argA);
						expect(res[0][1]).toEqual(argB);
						expect(res[1]).toEqual(extA);
					});
				}
			});
		});

		describe('3 levels up', () => {
			itSerializes('single instantiation', {
				in() {
					function outer() {
						return extA => extB => () => [arguments, extA, extB];
					}
					return outer({argA: 1}, {argB: 2})({extA: 3})({extB: 4});
				},
				out: '(c=>b=>a=>()=>[c,b,a])(function(){return arguments}({argA:1},{argB:2}))({extA:3})({extB:4})',
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(3);
					expect(res[0]).toBeArguments();
					expect(res[0]).toHaveLength(2);
					expect(res[0][0]).toEqual({argA: 1});
					expect(res[0][1]).toEqual({argB: 2});
					expect(res[1]).toEqual({extA: 3});
					expect(res[2]).toEqual({extB: 4});
				}
			});

			itSerializes('multiple instantiations', {
				in({ctx}) {
					const exts = [
						{argA: {argA1: 1}, argB: {argB1: 11}, extA: {extA1: 12}, extB: {extB1: 13}},
						{argA: {argA2: 2}, argB: {argB2: 21}, extA: {extA2: 22}, extB: {extB2: 23}},
						{argA: {argA3: 3}, argB: {argB3: 31}, extA: {extA3: 32}, extB: {extB3: 33}}
					];
					ctx.exts = exts;

					function outer() {
						return extA => extB => () => [arguments, extA, extB];
					}
					return exts.map(({argA, argB, extA, extB}) => outer(argA, argB)(extA)(extB));
				},
				out: `(()=>{
					const a=c=>b=>a=>()=>[c,b,a],
						b=(0,function(){return arguments});
					return[
						a(b({argA1:1},{argB1:11}))({extA1:12})({extB1:13}),
						a(b({argA2:2},{argB2:21}))({extA2:22})({extB2:23}),
						a(b({argA3:3},{argB3:31}))({extA3:32})({extB3:33})
					]
				})()`,
				validate(arr, {ctx: {exts}}) {
					expect(arr).toBeArrayOfSize(3);
					arr.forEach((fn, index) => {
						expect(fn).toBeFunction();
						const res = fn();
						const {argA, argB, extA, extB} = exts[index];
						expect(res).toBeArrayOfSize(3);
						expect(res[0]).toBeArguments();
						expect(res[0]).toHaveLength(2);
						expect(res[0][0]).toEqual(argA);
						expect(res[0][1]).toEqual(argB);
						expect(res[1]).toEqual(extA);
						expect(res[2]).toEqual(extB);
					});
				}
			});
		});
	});

	describe('referencing local scope', () => {
		itSerializes('in exported function', {
			in: () => function() {
				return arguments;
			},
			out: 'function(){return arguments}',
			validate(fn) {
				expect(fn).toBeFunction();
				const argA = {argA: 1},
					argB = {argB: 1};
				const res = fn(argA, argB);
				expect(res).toBeArguments();
				expect(res).toHaveLength(2);
				expect(res[0]).toBe(argA);
				expect(res[1]).toBe(argB);
			}
		});

		describe('in function nested inside exported function', () => {
			describe('when outer function is', () => {
				itSerializes('function declaration', {
					in() {
						function outer() {
							return function() {
								return arguments;
							};
						}
						return outer;
					},
					out: 'function outer(){return function(){return arguments}}',
					validate(outer) {
						expect(outer).toBeFunction();
						const fn = outer();
						expect(fn).toBeFunction();
						const argA = {argA: 1},
							argB = {argB: 1};
						const res = fn(argA, argB);
						expect(res).toBeArguments();
						expect(res).toHaveLength(2);
						expect(res[0]).toBe(argA);
						expect(res[1]).toBe(argB);
					}
				});

				itSerializes('function expression', {
					in: () => function() {
						return function() { return arguments; };
					},
					out: 'function(){return function(){return arguments}}',
					validate(outer) {
						expect(outer).toBeFunction();
						const fn = outer();
						expect(fn).toBeFunction();
						const argA = {argA: 1},
							argB = {argB: 1};
						const res = fn(argA, argB);
						expect(res).toBeArguments();
						expect(res).toHaveLength(2);
						expect(res[0]).toBe(argA);
						expect(res[1]).toBe(argB);
					}
				});

				itSerializes('arrow function', {
					in() {
						return () => function() { return arguments; };
					},
					out: '()=>function(){return arguments}',
					validate(outer) {
						expect(outer).toBeFunction();
						const fn = outer();
						expect(fn).toBeFunction();
						const argA = {argA: 1},
							argB = {argB: 1};
						const res = fn(argA, argB);
						expect(res).toBeArguments();
						expect(res).toHaveLength(2);
						expect(res[0]).toBe(argA);
						expect(res[1]).toBe(argB);
					}
				});
			});

			describe('referencing exported function scope', () => {
				itSerializes('from 1 level up', {
					in: () => function outer() {
						return () => arguments;
					},
					out: 'function outer(){return()=>arguments}',
					validate(outer) {
						expect(outer).toBeFunction();
						const argA = {argA: 1},
							argB = {argB: 1};
						const fn = outer(argA, argB);
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toBeArguments();
						expect(res).toHaveLength(2);
						expect(res[0]).toBe(argA);
						expect(res[1]).toBe(argB);
					}
				});

				itSerializes('from 2 levels up', {
					in: () => function outer() {
						return () => () => arguments;
					},
					out: 'function outer(){return()=>()=>arguments}',
					validate(outer) {
						expect(outer).toBeFunction();
						const argA = {argA: 1},
							argB = {argB: 1};
						const fnIntermediate = outer(argA, argB);
						expect(fnIntermediate).toBeFunction();
						const fn = fnIntermediate();
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toBeArguments();
						expect(res).toHaveLength(2);
						expect(res[0]).toBe(argA);
						expect(res[1]).toBe(argB);
					}
				});
			});

			describe('referencing nested function scope', () => {
				describe('when outer function is', () => {
					describe('function declaration', () => {
						itSerializes('from 1 level up', {
							in() {
								function outer() {
									return function() {
										return () => arguments;
									};
								}
								return outer;
							},
							out: 'function outer(){return function(){return()=>arguments}}',
							validate(outer) {
								expect(outer).toBeFunction();
								const fnBase = outer();
								expect(fnBase).toBeFunction();
								const argA = {argA: 1},
									argB = {argB: 1};
								const fn = fnBase(argA, argB);
								expect(fn).toBeFunction();
								const res = fn();
								expect(res).toBeArguments();
								expect(res).toHaveLength(2);
								expect(res[0]).toBe(argA);
								expect(res[1]).toBe(argB);
							}
						});

						itSerializes('from 2 levels up', {
							in() {
								function outer() {
									return function() {
										return () => () => arguments;
									};
								}
								return outer;
							},
							out: 'function outer(){return function(){return()=>()=>arguments}}',
							validate(outer) {
								expect(outer).toBeFunction();
								const fnBase = outer();
								expect(fnBase).toBeFunction();
								const argA = {argA: 1},
									argB = {argB: 1};
								const fnIntermediate = fnBase(argA, argB);
								expect(fnIntermediate).toBeFunction();
								const fn = fnIntermediate();
								expect(fn).toBeFunction();
								const res = fn();
								expect(res).toBeArguments();
								expect(res).toHaveLength(2);
								expect(res[0]).toBe(argA);
								expect(res[1]).toBe(argB);
							}
						});
					});

					describe('function expression', () => {
						itSerializes('from 1 level up', {
							in() {
								return function() {
									return function() {
										return () => arguments;
									};
								};
							},
							out: 'function(){return function(){return()=>arguments}}',
							validate(outer) {
								expect(outer).toBeFunction();
								const fnBase = outer();
								expect(fnBase).toBeFunction();
								const argA = {argA: 1},
									argB = {argB: 1};
								const fn = fnBase(argA, argB);
								expect(fn).toBeFunction();
								const res = fn();
								expect(res).toBeArguments();
								expect(res).toHaveLength(2);
								expect(res[0]).toBe(argA);
								expect(res[1]).toBe(argB);
							}
						});

						itSerializes('from 2 levels up', {
							in() {
								return function() {
									return function() {
										return () => () => arguments;
									};
								};
							},
							out: 'function(){return function(){return()=>()=>arguments}}',
							validate(outer) {
								expect(outer).toBeFunction();
								const fnBase = outer();
								expect(fnBase).toBeFunction();
								const argA = {argA: 1},
									argB = {argB: 1};
								const fnIntermediate = fnBase(argA, argB);
								expect(fnIntermediate).toBeFunction();
								const fn = fnIntermediate();
								expect(fn).toBeFunction();
								const res = fn();
								expect(res).toBeArguments();
								expect(res).toHaveLength(2);
								expect(res[0]).toBe(argA);
								expect(res[1]).toBe(argB);
							}
						});
					});

					describe('arrow function', () => {
						itSerializes('from 1 level up', {
							in() {
								return () => (
									function() {
										return () => arguments;
									}
								);
							},
							out: '()=>function(){return()=>arguments}',
							validate(outer) {
								expect(outer).toBeFunction();
								const fnBase = outer();
								expect(fnBase).toBeFunction();
								const argA = {argA: 1},
									argB = {argB: 1};
								const fn = fnBase(argA, argB);
								expect(fn).toBeFunction();
								const res = fn();
								expect(res).toBeArguments();
								expect(res).toHaveLength(2);
								expect(res[0]).toBe(argA);
								expect(res[1]).toBe(argB);
							}
						});

						itSerializes('from 2 levels up', {
							in() {
								return () => (
									function() {
										return () => () => arguments;
									}
								);
							},
							out: '()=>function(){return()=>()=>arguments}',
							validate(outer) {
								expect(outer).toBeFunction();
								const fnBase = outer();
								expect(fnBase).toBeFunction();
								const argA = {argA: 1},
									argB = {argB: 1};
								const fnIntermediate = fnBase(argA, argB);
								expect(fnIntermediate).toBeFunction();
								const fn = fnIntermediate();
								expect(fn).toBeFunction();
								const res = fn();
								expect(res).toBeArguments();
								expect(res).toHaveLength(2);
								expect(res[0]).toBe(argA);
								expect(res[1]).toBe(argB);
							}
						});
					});
				});
			});
		});
	});

	describe('referencing var in upper scope', () => {
		itSerializes('from 1 level up', {
			in() {
				const arguments = {args: 1}; // eslint-disable-line no-shadow-restricted-names
				return () => arguments;
			},
			out: '(a=>()=>a)({args:1})',
			validate(fn) {
				expect(fn).toBeFunction();
				const res = fn();
				expect(res).not.toBeArguments();
				expect(res).toEqual({args: 1});
			}
		});

		itSerializes('from 2 levels up', {
			in() {
				const arguments = {args: 1}; // eslint-disable-line no-shadow-restricted-names
				return () => () => arguments;
			},
			out: '(a=>()=>()=>a)({args:1})',
			validate(fn) {
				expect(fn).toBeFunction();
				const fn2 = fn();
				expect(fn2).toBeFunction();
				const res = fn2();
				expect(res).not.toBeArguments();
				expect(res).toEqual({args: 1});
			}
		});
	});

	describe('ignores var called `arguments` in upper scope', () => {
		itSerializes('when `arguments` refers to within exported function', {
			in() {
				const arguments = {args: 1}; // eslint-disable-line no-shadow-restricted-names, no-unused-vars
				return function() {
					return arguments;
				};
			},
			out: 'function(){return arguments}',
			validate(fn) {
				expect(fn).toBeFunction();
				const argA = {argA: 1},
					argB = {argB: 2};
				const res = fn(argA, argB);
				expect(res).toBeArguments();
				expect(res).toHaveLength(2);
				expect(res[0]).toBe(argA);
				expect(res[1]).toBe(argB);
			}
		});

		itSerializes('when `arguments` refers to outside exported function', {
			in() {
				const arguments = {args: 1}; // eslint-disable-line no-shadow-restricted-names, no-unused-vars
				function outer() {
					return () => arguments;
				}
				return outer({argA: 1}, {argB: 2});
			},
			out: '(a=>()=>a)(function(){return arguments}({argA:1},{argB:2}))',
			validate(fn) {
				expect(fn).toBeFunction();
				const res = fn();
				expect(res).toBeArguments();
				expect(res).toHaveLength(2);
				expect(res[0]).toEqual({argA: 1});
				expect(res[1]).toEqual({argB: 2});
			}
		});
	});
});
