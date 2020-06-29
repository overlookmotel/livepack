/* --------------------
 * livepack module
 * Tests for functions
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Functions', ({run}) => {
	describe('without scope', () => {
		describe('single instantiation of function', () => {
			it('arrow function', () => {
				const input = (x, y) => [x, y];
				const out = run(input, '(a,b)=>[a,b]');

				expect(out).toBeFunction();
				const param1 = {},
					param2 = {};
				const res = out(param1, param2);
				expect(res).toBeArrayOfSize(2);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
			});

			it('function expression', () => {
				const input = function(x, y) {
					return [x, y, this]; // eslint-disable-line no-invalid-this
				};
				const out = run(input, '(function input(a,b){return[a,b,this]})');

				expect(out).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = out.call(ctx, param1, param2);
				expect(res).toBeArrayOfSize(3);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
			});

			it('function declaration', () => {
				function input(x, y) {
					return [x, y, this]; // eslint-disable-line no-invalid-this
				}
				const out = run(input, '(function input(a,b){return[a,b,this]})');

				expect(out).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = out.call(ctx, param1, param2);
				expect(res).toBeArrayOfSize(3);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
			});

			it('with default params', () => {
				const input = (x = {defaultA: 1}, y = {defaultB: 2}) => [x, y];
				const out = run(input, '(a={defaultA:1},b={defaultB:2})=>[a,b]');

				expect(out).toBeFunction();
				expect(out()).toEqual([{defaultA: 1}, {defaultB: 2}]);
			});
		});

		describe('multiple instantiations of function', () => {
			it('without default params', () => {
				const input = [1, 2, 3].map(() => (
					function(x, y) {
						return [x, y, this]; // eslint-disable-line no-invalid-this
					}
				));
				const out = run(input);
				expect(out).toBeArrayOfSize(3);

				expect(out[0]).not.toBe(out[1]);
				expect(out[0]).not.toBe(out[2]);
				expect(out[1]).not.toBe(out[2]);

				for (const fn of out) {
					expect(fn).toBeFunction();
					const param1 = {},
						param2 = {},
						ctx = {};
					const res = fn.call(ctx, param1, param2);
					expect(res).toBeArrayOfSize(3);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(ctx);
				}
			});

			it('with default params', () => {
				const input = [1, 2, 3].map(() => (
					function(x = {defaultA: 1}, y = {defaultB: 2}) {
						return [x, y, this]; // eslint-disable-line no-invalid-this
					}
				));
				const out = run(input);
				expect(out).toBeArrayOfSize(3);

				expect(out[0]).not.toBe(out[1]);
				expect(out[0]).not.toBe(out[2]);
				expect(out[1]).not.toBe(out[2]);

				for (const fn of out) {
					expect(fn).toBeFunction();
					const ctx = {};
					const res = fn.call(ctx);
					expect(res).toBeArrayOfSize(3);
					expect(res[0]).toEqual({defaultA: 1});
					expect(res[1]).toEqual({defaultB: 2});
					expect(res[2]).toBe(ctx);
				}
			});
		});
	});

	describe('with external scope', () => {
		describe('single instantiation of function', () => {
			it('arrow function', () => {
				const extA = {extA: 1},
					extB = {extB: 2};
				const input = (x, y) => [x, y, extA, extB];
				const out = run(input);

				expect(out).toBeFunction();
				const param1 = {},
					param2 = {};
				const res = out(param1, param2);
				expect(res).toBeArrayOfSize(4);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toEqual(extA);
				expect(res[3]).toEqual(extB);
			});

			it('function expression', () => {
				const extA = {extA: 1},
					extB = {extB: 2};
				const input = function(x, y) {
					return [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
				};
				const out = run(input);

				expect(out).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = out.call(ctx, param1, param2);
				expect(res).toBeArrayOfSize(5);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
				expect(res[3]).toEqual(extA);
				expect(res[4]).toEqual(extB);
			});

			it('function declaration', () => {
				const extA = {extA: 1},
					extB = {extB: 2};
				function input(x, y) {
					return [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
				}
				const out = run(input);

				expect(out).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = out.call(ctx, param1, param2);
				expect(res).toBeArrayOfSize(5);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
				expect(res[3]).toEqual(extA);
				expect(res[4]).toEqual(extB);
			});

			describe('with default params', () => {
				it('referencing external vars', () => {
					const extA = {extA: 1},
						extB = {extB: 2};
					const input = (x = extA, y = extB) => [x, y];
					const out = run(input, '((c,d)=>(a=c,b=d)=>[a,b])({extA:1},{extB:2})');

					expect(out).toBeFunction();
					expect(out()).toEqual([extA, extB]);
				});

				it('referencing external vars embedded in objects', () => {
					const extA = {extA: 1},
						extB = {extB: 2};
					const input = (x = {nestedA: extA}, y = {nestedB: extB}) => [x, y];
					const out = run(input, '((c,d)=>(a={nestedA:c},b={nestedB:d})=>[a,b])({extA:1},{extB:2})');

					expect(out).toBeFunction();
					expect(out()).toEqual([{nestedA: extA}, {nestedB: extB}]);
				});
			});
		});

		describe('multiple instantiations of function', () => {
			it('without default params', () => {
				const extA = {extA: 1},
					extB = {extB: 2};
				const input = [1, 2, 3].map(() => (
					function(x, y) {
						return [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
					}
				));
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				expect(out[0]).not.toBe(out[1]);
				expect(out[0]).not.toBe(out[2]);
				expect(out[1]).not.toBe(out[2]);

				const resABs = out.map((fn) => {
					expect(fn).toBeFunction();
					const param1 = {},
						param2 = {},
						ctx = {};
					const res = fn.call(ctx, param1, param2);
					expect(res).toBeArrayOfSize(5);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(ctx);
					expect(res[3]).toEqual(extA);
					expect(res[4]).toEqual(extB);
					return [res[3], res[4]];
				});

				const resAs = resABs.map(resAB => resAB[0]);
				expect(resAs[0]).toBe(resAs[1]);
				expect(resAs[0]).toBe(resAs[2]);

				const resBs = resABs.map(resAB => resAB[1]);
				expect(resBs[0]).toBe(resBs[1]);
				expect(resBs[0]).toBe(resBs[2]);
			});

			describe('with default params', () => {
				it('referencing external vars', () => {
					const extA = {extA: 1},
						extB = {extB: 2};
					const input = [1, 2, 3].map(() => (
						(x = extA, y = extB) => [x, y]
					));
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					expect(out[0]).not.toBe(out[1]);
					expect(out[0]).not.toBe(out[2]);
					expect(out[1]).not.toBe(out[2]);

					const resABs = out.map((fn) => {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toBeArrayOfSize(2);
						expect(res[0]).toEqual(extA);
						expect(res[1]).toEqual(extB);
						return {extA: res[0], extB: res[1]};
					});

					const resAs = resABs.map(resAB => resAB.extA);
					expect(resAs[0]).toBe(resAs[1]);
					expect(resAs[0]).toBe(resAs[2]);

					const resBs = resABs.map(resAB => resAB.extB);
					expect(resBs[0]).toBe(resBs[1]);
					expect(resBs[0]).toBe(resBs[2]);
				});

				it('referencing external vars embedded in objects', () => {
					const extA = {extA: 1},
						extB = {extB: 2};
					const input = [1, 2, 3].map(() => (
						(x = {nestedA: extA}, y = {nestedB: extB}) => [x, y]
					));
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					expect(out[0]).not.toBe(out[1]);
					expect(out[0]).not.toBe(out[2]);
					expect(out[1]).not.toBe(out[2]);

					const resABs = out.map((fn) => {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toBeArrayOfSize(2);
						expect(res[0]).toEqual({nestedA: extA});
						expect(res[1]).toEqual({nestedB: extB});
						return {extA: res[0].nestedA, extB: res[1].nestedB};
					});

					const resAs = resABs.map(resAB => resAB.extA);
					expect(resAs[0]).toBe(resAs[1]);
					expect(resAs[0]).toBe(resAs[2]);

					const resBs = resABs.map(resAB => resAB.extB);
					expect(resBs[0]).toBe(resBs[1]);
					expect(resBs[0]).toBe(resBs[2]);
				});
			});
		});
	});

	describe('with vars from above scope', () => {
		it('single instantiation of scope', () => {
			const extA = {extA: 1};
			function outer(extB, extC) {
				return function(x, y) {
					return [x, y, this, extA, extB, extC]; // eslint-disable-line no-invalid-this
				};
			}
			const extB = {extB: 2},
				extC = {extC: 3};
			const input = outer(extB, extC);
			const out = run(input);

			expect(out).toBeFunction();
			const param1 = {},
				param2 = {},
				ctx = {};
			const res = out.call(ctx, param1, param2);
			expect(res).toBeArrayOfSize(6);
			expect(res[0]).toBe(param1);
			expect(res[1]).toBe(param2);
			expect(res[2]).toBe(ctx);
			expect(res[3]).toEqual(extA);
			expect(res[4]).toEqual(extB);
			expect(res[5]).toEqual(extC);
		});

		it('multiple instantiations of scope', () => {
			const extA = {extA: 1};
			function outer(extB, extC) {
				return function(x, y) {
					return [x, y, this, extA, extB, extC]; // eslint-disable-line no-invalid-this
				};
			}
			const exts = [
				{extB: {extB1: 11}, extC: {extC1: 12}},
				{extB: {extB2: 21}, extC: {extC2: 22}},
				{extB: {extB3: 31}, extC: {extC3: 32}}
			];
			const input = exts.map(({extB, extC}) => outer(extB, extC));
			const out = run(input);

			expect(out).toBeArrayOfSize(3);
			expect(out[0]).not.toBe(out[1]);
			expect(out[0]).not.toBe(out[2]);
			expect(out[1]).not.toBe(out[2]);

			const resAs = out.map((item, index) => {
				expect(item).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = item.call(ctx, param1, param2);
				expect(res).toBeArrayOfSize(6);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
				expect(res[3]).toEqual(extA);
				expect(res[4]).toEqual(exts[index].extB);
				expect(res[5]).toEqual(exts[index].extC);
				return res[3];
			});

			expect(resAs[0]).toBe(resAs[1]);
			expect(resAs[0]).toBe(resAs[2]);
		});
	});

	describe('with vars from above nested scopes', () => {
		it('single instantiation of scope', () => {
			const extA = {extA: 1};
			function outer(extB) {
				return function inner(extC) {
					return function(x, y) {
						return [x, y, this, extA, extB, extC]; // eslint-disable-line no-invalid-this
					};
				};
			}
			const extB = {extB: 2},
				extC = {extC: 3};
			const input = outer(extB)(extC);
			const out = run(input);

			expect(out).toBeFunction();
			const param1 = {},
				param2 = {},
				ctx = {};
			const res = out.call(ctx, param1, param2);
			expect(res).toBeArrayOfSize(6);
			expect(res[0]).toBe(param1);
			expect(res[1]).toBe(param2);
			expect(res[2]).toBe(ctx);
			expect(res[3]).toEqual(extA);
			expect(res[4]).toEqual(extB);
			expect(res[5]).toEqual(extC);
		});

		it('multiple independent instantiations of scope', () => {
			const extA = {extA: 1};
			function outer(extB) {
				return function inner(extC) {
					return function(x, y) {
						return [x, y, this, extA, extB, extC]; // eslint-disable-line no-invalid-this
					};
				};
			}
			const exts = [
				{extB: {extB1: 11}, extC: {extC1: 12}},
				{extB: {extB2: 21}, extC: {extC2: 22}},
				{extB: {extB3: 31}, extC: {extC3: 32}}
			];
			const input = exts.map(({extB, extC}) => outer(extB)(extC));
			const out = run(input);

			expect(out).toBeArrayOfSize(3);
			expect(out[0]).not.toBe(out[1]);
			expect(out[0]).not.toBe(out[2]);
			expect(out[1]).not.toBe(out[2]);

			const resAs = ((item, index) => {
				expect(item).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = item.call(ctx, param1, param2);
				expect(res).toBeArrayOfSize(5);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
				expect(res[3]).toEqual(extA);
				expect(res[3]).toEqual(exts[index].extB);
				expect(res[4]).toEqual(exts[index].extC);
			});

			expect(resAs[0]).toBe(resAs[1]);
			expect(resAs[0]).toBe(resAs[2]);
		});

		it('multiple instantiations of scope with shared upper scope', () => {
			const extA = {extA: 1};
			function outer(extB) {
				return function inner(extC) {
					return function(x, y) {
						return [x, y, this, extA, extB, extC]; // eslint-disable-line no-invalid-this
					};
				};
			}
			const extB = {extB: 2};
			const extCs = [{extC1: 12}, {extC1: 22}, {extC1: 32}];
			const inner = outer(extB);
			const input = extCs.map(extC => inner(extC));
			const out = run(input);

			expect(out).toBeArrayOfSize(3);
			expect(out[0]).not.toBe(out[1]);
			expect(out[0]).not.toBe(out[2]);
			expect(out[1]).not.toBe(out[2]);

			const resABs = out.map((item, index) => {
				expect(item).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = item.call(ctx, param1, param2);
				expect(res).toBeArrayOfSize(6);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
				expect(res[3]).toEqual(extA);
				expect(res[4]).toEqual(extB);
				expect(res[5]).toEqual(extCs[index]);
				return {extA: res[3], extB: res[4]};
			});

			const resAs = resABs.map(resAB => resAB.extA);
			expect(resAs[0]).toBe(resAs[1]);
			expect(resAs[0]).toBe(resAs[2]);

			const resBs = resABs.map(resAB => resAB.extB);
			expect(resBs[0]).toBe(resBs[1]);
			expect(resBs[0]).toBe(resBs[2]);
		});
	});

	describe('including `this`', () => {
		describe('referencing upper function scope', () => {
			describe('1 level up', () => {
				it('single instantiation', () => {
					function outer() {
						return () => this; // eslint-disable-line no-invalid-this
					}
					const ctx = {ctx: 1};
					const input = outer.call(ctx);
					const out = run(input, '(a=>()=>a)({ctx:1})');

					expect(out).toBeFunction();
					expect(out()).toEqual(ctx);
				});

				it('multiple instantiations', () => {
					function outer() {
						return () => this; // eslint-disable-line no-invalid-this
					}
					const ctxs = [1, 2, 3].map(n => ({[`ctx${n}`]: n}));
					const input = ctxs.map(ctx => outer.call(ctx));
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					out.forEach((fn, index) => {
						expect(fn).toBeFunction();
						expect(fn()).toEqual(ctxs[index]);
					});
				});

				describe('with clashing var names', () => {
					it('outer params', () => {
						function outer(this$0, this$1) {
							return () => [this, this$0, this$1]; // eslint-disable-line no-invalid-this
						}
						const ctx = {ctx: 1},
							extA = {extA: 2},
							extB = {extB: 3};
						const input = outer.call(ctx, extA, extB);
						const out = run(input, '((a,b,c)=>()=>[a,b,c])({ctx:1},{extA:2},{extB:3})');

						expect(out).toBeFunction();
						expect(out()).toEqual([ctx, extA, extB]);
					});

					it('inner params', () => {
						function outer() {
							return (this$0, this$1) => [this, this$0, this$1]; // eslint-disable-line no-invalid-this
						}
						const ctx = {ctx: 1};
						const input = outer.call(ctx);
						const out = run(input, '(c=>(a,b)=>[c,a,b])({ctx:1})');

						expect(out).toBeFunction();
						const param1 = {},
							param2 = {};
						const res = out(param1, param2);
						expect(res).toEqual([ctx, param1, param2]);
						expect(res[1]).toBe(param1);
						expect(res[2]).toBe(param2);
					});

					it('outer and inner params', () => {
						function outer(this$0) {
							return this$1 => [this, this$0, this$1]; // eslint-disable-line no-invalid-this
						}
						const ctx = {ctx: 1},
							extA = {extA: 2};
						const input = outer.call(ctx, extA);
						const out = run(input, '((b,c)=>a=>[b,c,a])({ctx:1},{extA:2})');

						expect(out).toBeFunction();
						const param = {};
						const res = out(param);
						expect(res).toEqual([ctx, extA, param]);
						expect(res[2]).toBe(param);
					});
				});
			});

			describe('2 levels up', () => {
				it('single instantiation', () => {
					function outer() {
						return extA => () => [this, extA]; // eslint-disable-line no-invalid-this
					}
					const ctx = {ctx: 1},
						extA = {extA: 2};
					const input = outer.call(ctx)(extA);
					const out = run(input, '(b=>a=>()=>[b,a])({ctx:1})({extA:2})');

					expect(out).toBeFunction();
					expect(out()).toEqual([ctx, extA]);
				});

				it('multiple instantiations', () => {
					function outer() {
						return extA => () => [this, extA]; // eslint-disable-line no-invalid-this
					}
					const exts = [
						{ctx: {ctx1: 1}, extA: {extA1: 11}},
						{ctx: {ctx2: 2}, extA: {extA2: 21}},
						{ctx: {ctx3: 3}, extA: {extA3: 31}}
					];
					const input = exts.map(({ctx, extA}) => outer.call(ctx)(extA));
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					out.forEach((fn, index) => {
						expect(fn).toBeFunction();
						const res = fn();
						const {ctx, extA} = exts[index];
						expect(res).toEqual([ctx, extA]);
					});
				});
			});

			describe('3 levels up', () => {
				it('single instantiation', () => {
					function outer() {
						return extA => extB => () => [this, extA, extB]; // eslint-disable-line no-invalid-this
					}
					const ctx = {ctx: 1},
						extA = {extA: 2},
						extB = {extB: 3};
					const input = outer.call(ctx)(extA)(extB);
					const out = run(input, '(c=>b=>a=>()=>[c,b,a])({ctx:1})({extA:2})({extB:3})');

					expect(out).toBeFunction();
					expect(out()).toEqual([ctx, extA, extB]);
				});

				it('multiple instantiations', () => {
					function outer() {
						return extA => extB => () => [this, extA, extB]; // eslint-disable-line no-invalid-this
					}
					const exts = [
						{ctx: {ctx1: 1}, extA: {extA1: 11}, extB: {extB1: 12}},
						{ctx: {ctx2: 2}, extA: {extA2: 21}, extB: {extB2: 22}},
						{ctx: {ctx3: 3}, extA: {extA3: 31}, extB: {extB3: 32}}
					];
					const input = exts.map(({ctx, extA, extB}) => outer.call(ctx)(extA)(extB));
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					out.forEach((fn, index) => {
						expect(fn).toBeFunction();
						const res = fn();
						const {ctx, extA, extB} = exts[index];
						expect(res).toEqual([ctx, extA, extB]);
					});
				});
			});
		});

		describe('referencing local scope', () => {
			it('in exported function', () => {
				const input = function() { return this; }; // eslint-disable-line no-invalid-this
				const out = run(input, '(function input(){return this})');

				expect(out).toBeFunction();
				const ctx = {};
				expect(out.call(ctx)).toBe(ctx);
			});

			describe('in function nested inside exported function', () => {
				describe('when outer function is', () => {
					it('function declaration', () => {
						function input() {
							return function() { return this; }; // eslint-disable-line no-invalid-this
						}
						const out = run(input, '(function input(){return function(){return this}})');

						expect(out).toBeFunction();
						const res = out();
						expect(res).toBeFunction();
						const ctx = {};
						expect(res.call(ctx)).toBe(ctx);
					});

					it('function expression', () => {
						const input = function() {
							return function() { return this; }; // eslint-disable-line no-invalid-this
						};
						const out = run(input, '(function input(){return function(){return this}})');

						expect(out).toBeFunction();
						const res = out();
						expect(res).toBeFunction();
						const ctx = {};
						expect(res.call(ctx)).toBe(ctx);
					});

					it('arrow function', () => {
						const input = () => function() { return this; }; // eslint-disable-line no-invalid-this
						const out = run(input, '()=>function(){return this}');

						expect(out).toBeFunction();
						const res = out();
						expect(res).toBeFunction();
						const ctx = {};
						expect(res.call(ctx)).toBe(ctx);
					});
				});

				describe('referencing exported function scope', () => {
					it('from 1 level up', () => {
						function input() {
							return () => this; // eslint-disable-line no-invalid-this
						}
						const out = run(input, '(function input(){return()=>this})');

						expect(out).toBeFunction();
						const ctx = {};
						const res = out.call(ctx);
						expect(res).toBeFunction();
						expect(res()).toBe(ctx);
					});

					it('from 2 levels up', () => {
						function input() {
							return () => () => this; // eslint-disable-line no-invalid-this
						}
						const out = run(input, '(function input(){return()=>()=>this})');

						expect(out).toBeFunction();
						const ctx = {};
						const res = out.call(ctx);
						expect(res).toBeFunction();
						const res2 = res();
						expect(res2).toBeFunction();
						expect(res2()).toBe(ctx);
					});
				});

				describe('referencing nested function scope', () => {
					describe('when outer function is', () => {
						describe('function declaration', () => {
							it('from 1 level up', () => {
								function input() {
									return function() {
										return () => this; // eslint-disable-line no-invalid-this
									};
								}
								const out = run(input, '(function input(){return function(){return()=>this}})');

								expect(out).toBeFunction();
								const res = out();
								expect(res).toBeFunction();
								const ctx = {};
								const res2 = res.call(ctx);
								expect(res2).toBeFunction();
								expect(res2()).toBe(ctx);
							});

							it('from 2 levels up', () => {
								function input() {
									return function() {
										return () => () => this; // eslint-disable-line no-invalid-this
									};
								}
								const out = run(input, '(function input(){return function(){return()=>()=>this}})');

								expect(out).toBeFunction();
								const res = out();
								expect(res).toBeFunction();
								const ctx = {};
								const res2 = res.call(ctx);
								expect(res2).toBeFunction();
								const res3 = res2();
								expect(res3).toBeFunction();
								expect(res3()).toBe(ctx);
							});
						});

						describe('function expression', () => {
							it('from 1 level up', () => {
								const input = function() {
									return function() {
										return () => this; // eslint-disable-line no-invalid-this
									};
								};
								const out = run(input, '(function input(){return function(){return()=>this}})');

								expect(out).toBeFunction();
								const res = out();
								expect(res).toBeFunction();
								const ctx = {};
								const res2 = res.call(ctx);
								expect(res2).toBeFunction();
								expect(res2()).toBe(ctx);
							});

							it('from 2 levels up', () => {
								const input = function() {
									return function() {
										return () => () => this; // eslint-disable-line no-invalid-this
									};
								};
								const out = run(input, '(function input(){return function(){return()=>()=>this}})');

								expect(out).toBeFunction();
								const res = out();
								expect(res).toBeFunction();
								const ctx = {};
								const res2 = res.call(ctx);
								expect(res2).toBeFunction();
								const res3 = res2();
								expect(res3).toBeFunction();
								expect(res3()).toBe(ctx);
							});
						});

						describe('arrow function', () => {
							it('from 1 level up', () => {
								const input = () => (
									function() {
										return () => this; // eslint-disable-line no-invalid-this
									}
								);
								const out = run(input, '()=>function(){return()=>this}');

								expect(out).toBeFunction();
								const res = out();
								expect(res).toBeFunction();
								const ctx = {};
								const res2 = res.call(ctx);
								expect(res2).toBeFunction();
								expect(res2()).toBe(ctx);
							});

							it('from 2 levels up', () => {
								const input = () => (
									function() {
										return () => () => this; // eslint-disable-line no-invalid-this
									}
								);
								const out = run(input, '()=>function(){return()=>()=>this}');

								expect(out).toBeFunction();
								const res = out();
								expect(res).toBeFunction();
								const ctx = {};
								const res2 = res.call(ctx);
								expect(res2).toBeFunction();
								const res3 = res2();
								expect(res3).toBeFunction();
								expect(res3()).toBe(ctx);
							});
						});
					});
				});
			});
		});
	});

	describe('including `arguments`', () => {
		describe('referencing upper function scope', () => {
			describe('1 level up', () => {
				it('single instantiation', () => {
					function outer() {
						return () => arguments; // eslint-disable-line prefer-rest-params
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
						return () => arguments; // eslint-disable-line prefer-rest-params
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
							// eslint-disable-next-line prefer-rest-params
							return () => [arguments, arguments$0, arguments$1];
						}
						const extA = {extA: 2},
							extB = {extB: 3};
						const input = outer(extA, extB);
						const out = run(input);

						expect(out).toBeFunction();
						const res = out();
						expect(res).toHaveLength(3);
						expect(res[0]).toBeArguments();
						expect(res[0]).toHaveLength(2);
						expect(res[0][0]).toEqual(extA);
						expect(res[0][1]).toEqual(extB);
						expect(res[1]).toBe(res[0][0]);
						expect(res[2]).toBe(res[0][1]);
					});

					it('inner params', () => {
						function outer() {
							// eslint-disable-next-line prefer-rest-params
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
						expect(res).toHaveLength(3);
						expect(res[0]).toBeArguments();
						expect(res[0]).toHaveLength(2);
						expect(res[0][0]).toEqual(argA);
						expect(res[0][1]).toEqual(argB);
						expect(res[1]).toBe(param1);
						expect(res[2]).toBe(param2);
					});

					it('outer and inner params', () => {
						function outer(arguments$0) {
							// eslint-disable-next-line prefer-rest-params
							return arguments$1 => [arguments, arguments$0, arguments$1];
						}
						const extA = {extA: 1},
							argB = {argB: 2};
						const input = outer(extA, argB);
						const out = run(input);

						expect(out).toBeFunction();
						const param = {};
						const res = out(param);
						expect(res).toHaveLength(3);
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
						return extA => () => [arguments, extA]; // eslint-disable-line prefer-rest-params
					}
					const argA = {argA: 1},
						argB = {argB: 2},
						extA = {extA: 3};
					const input = outer(argA, argB)(extA);
					const out = run(input);

					expect(out).toBeFunction();
					const res = out();
					expect(res).toHaveLength(2);
					expect(res[0]).toBeArguments();
					expect(res[0]).toHaveLength(2);
					expect(res[0][0]).toEqual(argA);
					expect(res[0][1]).toEqual(argB);
					expect(res[1]).toEqual(extA);
				});

				it('multiple instantiations', () => {
					function outer() {
						return extA => () => [arguments, extA]; // eslint-disable-line prefer-rest-params
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
						expect(res).toHaveLength(2);
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
						// eslint-disable-next-line prefer-rest-params
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
					expect(res).toHaveLength(3);
					expect(res[0]).toBeArguments();
					expect(res[0]).toHaveLength(2);
					expect(res[0][0]).toEqual(argA);
					expect(res[0][1]).toEqual(argB);
					expect(res[1]).toEqual(extA);
				});

				it('multiple instantiations', () => {
					function outer() {
						// eslint-disable-next-line prefer-rest-params
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
						expect(res).toHaveLength(3);
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
				const input = function() { return arguments; }; // eslint-disable-line prefer-rest-params
				const out = run(input, '(function input(){return arguments})');

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
							return function() { return arguments; }; // eslint-disable-line prefer-rest-params
						}
						const out = run(input, '(function input(){return function(){return arguments}})');

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
							return function() { return arguments; }; // eslint-disable-line prefer-rest-params
						};
						const out = run(input, '(function input(){return function(){return arguments}})');

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
						// eslint-disable-next-line prefer-rest-params
						const input = () => function() { return arguments; };
						const out = run(input, '()=>function(){return arguments}');

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
				});

				describe('referencing exported function scope', () => {
					it('from 1 level up', () => {
						function input() {
							return () => arguments; // eslint-disable-line prefer-rest-params
						}
						const out = run(input, '(function input(){return()=>arguments})');

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
							return () => () => arguments; // eslint-disable-line prefer-rest-params
						}
						const out = run(input, '(function input(){return()=>()=>arguments})');

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
										return () => arguments; // eslint-disable-line prefer-rest-params
									};
								}
								const out = run(input, '(function input(){return function(){return()=>arguments}})');

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
										return () => () => arguments; // eslint-disable-line prefer-rest-params
									};
								}
								const out = run(
									input, '(function input(){return function(){return()=>()=>arguments}})'
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
										return () => arguments; // eslint-disable-line prefer-rest-params
									};
								};
								const out = run(input, '(function input(){return function(){return()=>arguments}})');

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
										return () => () => arguments; // eslint-disable-line prefer-rest-params
									};
								};
								const out = run(
									input, '(function input(){return function(){return()=>()=>arguments}})'
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
								const input = () => (
									function() {
										return () => arguments; // eslint-disable-line prefer-rest-params
									}
								);
								const out = run(input, '()=>function(){return()=>arguments}');

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
								const input = () => (
									function() {
										return () => () => arguments; // eslint-disable-line prefer-rest-params
									}
								);
								const out = run(input, '()=>function(){return()=>()=>arguments}');

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
					});
				});
			});
		});
	});
});
