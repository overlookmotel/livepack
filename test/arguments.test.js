/* --------------------
 * livepack module
 * Tests for `arguments` within functions
 * ------------------*/

/* eslint-disable strict, prefer-rest-params */
// NB No strict mode to allow tests for when `arguments` is a user-defined var.

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Functions including `arguments`', ({run}) => {
	describe('referencing upper function scope', () => {
		describe('1 level up', () => {
			it('single instantiation', () => {
				function outer() {
					return () => arguments;
				}
				const argA = {argA: 1},
					argB = {argB: 2};
				const input = outer(argA, argB);
				const out = run(input);

				expect(out).toBeFunction();
				const res = out();
				expect(res).toBeArguments();
				expect(res).toHaveLength(2);
				expect(res[0]).toEqual(argA);
				expect(res[1]).toEqual(argB);
			});

			it('multiple instantiations', () => {
				function outer() {
					return () => arguments;
				}
				const args = [1, 2, 3].map(n => ([{[`argA${n}`]: n + 10}, {[`argB${n}`]: n + 20}]));
				const input = args.map(([argA, argB]) => outer(argA, argB));
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				out.forEach((fn, index) => {
					expect(fn).toBeFunction();
					const [argA, argB] = args[index];
					const res = fn();
					expect(res).toBeArguments();
					expect(res).toHaveLength(2);
					expect(res[0]).toEqual(argA);
					expect(res[1]).toEqual(argB);
				});
			});

			describe('with clashing var names', () => {
				it('outer params', () => {
					function outer(arguments$0, arguments$1) {
						return () => [arguments, arguments$0, arguments$1];
					}
					const extA = {extA: 2},
						extB = {extB: 3};
					const input = outer(extA, extB);
					const out = run(input);

					expect(out).toBeFunction();
					const res = out();
					expect(res).toBeArrayOfSize(3);
					expect(res[0]).toBeArguments();
					expect(res[0]).toHaveLength(2);
					expect(res[0][0]).toEqual(extA);
					expect(res[0][1]).toEqual(extB);
					expect(res[1]).toBe(res[0][0]);
					expect(res[2]).toBe(res[0][1]);
				});

				it('inner params', () => {
					function outer() {
						return (arguments$0, arguments$1) => [arguments, arguments$0, arguments$1];
					}
					const argA = {argA: 1},
						argB = {argB: 2};
					const input = outer(argA, argB);
					const out = run(input);

					expect(out).toBeFunction();
					const param1 = {},
						param2 = {};
					const res = out(param1, param2);
					expect(res).toBeArrayOfSize(3);
					expect(res[0]).toBeArguments();
					expect(res[0]).toHaveLength(2);
					expect(res[0][0]).toEqual(argA);
					expect(res[0][1]).toEqual(argB);
					expect(res[1]).toBe(param1);
					expect(res[2]).toBe(param2);
				});

				it('outer and inner params', () => {
					function outer(arguments$0) {
						return arguments$1 => [arguments, arguments$0, arguments$1];
					}
					const extA = {extA: 1},
						argB = {argB: 2};
					const input = outer(extA, argB);
					const out = run(input);

					expect(out).toBeFunction();
					const param = {};
					const res = out(param);
					expect(res).toBeArrayOfSize(3);
					expect(res[0]).toBeArguments();
					expect(res[0]).toHaveLength(2);
					expect(res[0][0]).toEqual(extA);
					expect(res[0][1]).toEqual(argB);
					expect(res[1]).toBe(res[0][0]);
					expect(res[2]).toBe(param);
				});
			});
		});

		describe('2 levels up', () => {
			it('single instantiation', () => {
				function outer() {
					return extA => () => [arguments, extA];
				}
				const argA = {argA: 1},
					argB = {argB: 2},
					extA = {extA: 3};
				const input = outer(argA, argB)(extA);
				const out = run(input);

				expect(out).toBeFunction();
				const res = out();
				expect(res).toBeArrayOfSize(2);
				expect(res[0]).toBeArguments();
				expect(res[0]).toHaveLength(2);
				expect(res[0][0]).toEqual(argA);
				expect(res[0][1]).toEqual(argB);
				expect(res[1]).toEqual(extA);
			});

			it('multiple instantiations', () => {
				function outer() {
					return extA => () => [arguments, extA];
				}
				const exts = [
					{argA: {argA1: 1}, argB: {argB1: 11}, extA: {extA1: 12}},
					{argA: {argA2: 2}, argB: {argB2: 21}, extA: {extA2: 22}},
					{argA: {argA3: 3}, argB: {argB3: 31}, extA: {extA3: 32}}
				];
				const input = exts.map(({argA, argB, extA}) => outer(argA, argB)(extA));
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				out.forEach((fn, index) => {
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
			});
		});

		describe('3 levels up', () => {
			it('single instantiation', () => {
				function outer() {
					return extA => extB => () => [arguments, extA, extB];
				}
				const argA = {argA: 1},
					argB = {argB: 2},
					extA = {extA: 2},
					extB = {extB: 3};
				const input = outer(argA, argB)(extA)(extB);
				const out = run(input);

				expect(out).toBeFunction();
				const res = out();
				expect(res).toBeArrayOfSize(3);
				expect(res[0]).toBeArguments();
				expect(res[0]).toHaveLength(2);
				expect(res[0][0]).toEqual(argA);
				expect(res[0][1]).toEqual(argB);
				expect(res[1]).toEqual(extA);
			});

			it('multiple instantiations', () => {
				function outer() {
					return extA => extB => () => [arguments, extA, extB];
				}
				const exts = [
					{argA: {argA1: 1}, argB: {argB1: 11}, extA: {extA1: 12}, extB: {extB1: 13}},
					{argA: {argA2: 2}, argB: {argB2: 21}, extA: {extA2: 22}, extB: {extB2: 23}},
					{argA: {argA3: 3}, argB: {argB3: 31}, extA: {extA3: 32}, extB: {extB3: 33}}
				];
				const input = exts.map(({argA, argB, extA, extB}) => outer(argA, argB)(extA)(extB));
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				out.forEach((fn, index) => {
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
			});
		});
	});

	describe('referencing local scope', () => {
		it('in exported function', () => {
			const input = function() { return arguments; };
			const out = run(input, 'function input(){return arguments}');

			expect(out).toBeFunction();
			const argA = {argA: 1},
				argB = {argB: 1};
			const res = out(argA, argB);
			expect(res).toBeArguments();
			expect(res).toHaveLength(2);
			expect(res[0]).toBe(argA);
			expect(res[1]).toBe(argB);
		});

		describe('in function nested inside exported function', () => {
			describe('when outer function is', () => {
				it('function declaration', () => {
					function input() {
						return function() { return arguments; };
					}
					const out = run(input, 'function input(){return function(){return arguments}}');

					expect(out).toBeFunction();
					const fn = out();
					expect(fn).toBeFunction();
					const argA = {argA: 1},
						argB = {argB: 1};
					const res = fn(argA, argB);
					expect(res).toBeArguments();
					expect(res).toHaveLength(2);
					expect(res[0]).toBe(argA);
					expect(res[1]).toBe(argB);
				});

				it('function expression', () => {
					const input = function() {
						return function() { return arguments; };
					};
					const out = run(input, 'function input(){return function(){return arguments}}');

					expect(out).toBeFunction();
					const fn = out();
					expect(fn).toBeFunction();
					const argA = {argA: 1},
						argB = {argB: 1};
					const res = fn(argA, argB);
					expect(res).toBeArguments();
					expect(res).toHaveLength(2);
					expect(res[0]).toBe(argA);
					expect(res[1]).toBe(argB);
				});

				it('arrow function', () => {
					run(
						() => function() { return arguments; },
						'()=>function(){return arguments}',
						(out) => {
							expect(out).toBeFunction();
							const fn = out();
							expect(fn).toBeFunction();
							const argA = {argA: 1},
								argB = {argB: 1};
							const res = fn(argA, argB);
							expect(res).toBeArguments();
							expect(res).toHaveLength(2);
							expect(res[0]).toBe(argA);
							expect(res[1]).toBe(argB);
						}
					);
				});
			});

			describe('referencing exported function scope', () => {
				it('from 1 level up', () => {
					function input() {
						return () => arguments;
					}
					const out = run(input, 'function input(){return()=>arguments}');

					expect(out).toBeFunction();
					const argA = {argA: 1},
						argB = {argB: 1};
					const fn = out(argA, argB);
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArguments();
					expect(res).toHaveLength(2);
					expect(res[0]).toBe(argA);
					expect(res[1]).toBe(argB);
				});

				it('from 2 levels up', () => {
					function input() {
						return () => () => arguments;
					}
					const out = run(input, 'function input(){return()=>()=>arguments}');

					expect(out).toBeFunction();
					const argA = {argA: 1},
						argB = {argB: 1};
					const fnIntermediate = out(argA, argB);
					expect(fnIntermediate).toBeFunction();
					const fn = fnIntermediate();
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArguments();
					expect(res).toHaveLength(2);
					expect(res[0]).toBe(argA);
					expect(res[1]).toBe(argB);
				});
			});

			describe('referencing nested function scope', () => {
				describe('when outer function is', () => {
					describe('function declaration', () => {
						it('from 1 level up', () => {
							function input() {
								return function() {
									return () => arguments;
								};
							}
							const out = run(input, 'function input(){return function(){return()=>arguments}}');

							expect(out).toBeFunction();
							const fnBase = out();
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
						});

						it('from 2 levels up', () => {
							function input() {
								return function() {
									return () => () => arguments;
								};
							}
							const out = run(
								input, 'function input(){return function(){return()=>()=>arguments}}'
							);

							expect(out).toBeFunction();
							const fnBase = out();
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
						});
					});

					describe('function expression', () => {
						it('from 1 level up', () => {
							const input = function() {
								return function() {
									return () => arguments;
								};
							};
							const out = run(input, 'function input(){return function(){return()=>arguments}}');

							expect(out).toBeFunction();
							const fnBase = out();
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
						});

						it('from 2 levels up', () => {
							const input = function() {
								return function() {
									return () => () => arguments;
								};
							};
							const out = run(
								input, 'function input(){return function(){return()=>()=>arguments}}'
							);

							expect(out).toBeFunction();
							const fnBase = out();
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
						});
					});

					describe('arrow function', () => {
						it('from 1 level up', () => {
							run(
								() => (
									function() {
										return () => arguments;
									}
								),
								'()=>function(){return()=>arguments}',
								(out) => {
									expect(out).toBeFunction();
									const fnBase = out();
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
							);
						});

						it('from 2 levels up', () => {
							run(
								() => (
									function() {
										return () => () => arguments;
									}
								),
								'()=>function(){return()=>()=>arguments}',
								(out) => {
									expect(out).toBeFunction();
									const fnBase = out();
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
							);
						});
					});
				});
			});
		});
	});

	describe('referencing var in upper scope', () => {
		it('from 1 level up', () => {
			const arguments = {args: 1}; // eslint-disable-line no-shadow-restricted-names
			const input = (0, () => arguments);
			run(
				input,
				'(a=>()=>a)({args:1})',
				(fn) => {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).not.toBeArguments();
					expect(res).toEqual({args: 1});
				}
			);
		});

		it('from 2 levels up', () => {
			const arguments = {args: 1}; // eslint-disable-line no-shadow-restricted-names
			const input = (0, () => () => arguments);
			run(
				input,
				'(a=>()=>()=>a)({args:1})',
				(fn) => {
					expect(fn).toBeFunction();
					const fn2 = fn();
					expect(fn2).toBeFunction();
					const res = fn2();
					expect(res).not.toBeArguments();
					expect(res).toEqual({args: 1});
				}
			);
		});
	});

	describe('ignores var called `arguments` in upper scope', () => {
		it('when `arguments` refers to within exported function', () => {
			const arguments = {args: 1}; // eslint-disable-line no-shadow-restricted-names, no-unused-vars
			function input() {
				return arguments;
			}
			run(
				input,
				'function input(){return arguments}',
				(fn) => {
					expect(fn).toBeFunction();
					const argA = {argA: 1},
						argB = {argB: 2};
					const res = fn(argA, argB);
					expect(res).toBeArguments();
					expect(res).toHaveLength(2);
					expect(res[0]).toBe(argA);
					expect(res[1]).toBe(argB);
				}
			);
		});

		it('when `arguments` refers to outside exported function', () => {
			const arguments = {args: 1}; // eslint-disable-line no-shadow-restricted-names, no-unused-vars
			function outer() {
				return () => arguments;
			}
			const argA = {argA: 1},
				argB = {argB: 2};
			const input = outer(argA, argB);

			run(
				input,
				'(a=>()=>a)(function(){return arguments}({argA:1},{argB:2}))',
				(fn) => {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArguments();
					expect(res).toHaveLength(2);
					expect(res[0]).toEqual(argA);
					expect(res[1]).toEqual(argB);
				}
			);
		});
	});
});
