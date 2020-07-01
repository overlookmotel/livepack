/* --------------------
 * livepack module
 * Tests for functions
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

describeWithAllOptions('Functions', ({run, serialize, minify, mangle, inline}) => {
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

			it('with destructured vars', () => {
				const {a: extA} = {a: {extA: 1}},
					{...extB} = {extB: 2};
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
				let extD;
				const {e: extE} = {e: {extE: 5}};
				return [
					function(x, y) {
						return [x, y, this, extA, extB, extC, extD, extE]; // eslint-disable-line no-invalid-this
					},
					function inject(_extD) {
						extD = _extD;
					}
				];
			}
			const extB = {extB: 2},
				extC = {extC: 3},
				extD = {extD: 4};
			const [input, inject] = outer(extB, extC);
			inject(extD);
			const out = run(input);

			expect(out).toBeFunction();
			const param1 = {},
				param2 = {},
				ctx = {};
			const res = out.call(ctx, param1, param2);
			expect(res).toBeArrayOfSize(8);
			expect(res[0]).toBe(param1);
			expect(res[1]).toBe(param2);
			expect(res[2]).toBe(ctx);
			expect(res[3]).toEqual(extA);
			expect(res[4]).toEqual(extB);
			expect(res[5]).toEqual(extC);
			expect(res[6]).toEqual(extD);
			expect(res[7]).toEqual({extE: 5});
		});

		it('multiple instantiations of scope', () => {
			const extA = {extA: 1};
			function outer(extB, extC) {
				let extD;
				const {e: extE} = {e: {extE: 5}};
				return [
					function(x, y) {
						return [x, y, this, extA, extB, extC, extD, extE]; // eslint-disable-line no-invalid-this
					},
					function inject(_extD) {
						extD = _extD;
					}
				];
			}
			const exts = [
				{extB: {extB1: 11}, extC: {extC1: 12}, extD: {extD1: 13}},
				{extB: {extB2: 21}, extC: {extC2: 22}, extD: {extD2: 23}},
				{extB: {extB3: 31}, extC: {extC3: 32}, extD: {extD3: 33}}
			];
			const input = exts.map(({extB, extC, extD}) => {
				const [fn, inject] = outer(extB, extC);
				inject(extD);
				return fn;
			});
			const out = run(input);

			expect(out).toBeArrayOfSize(3);
			expect(out[0]).not.toBe(out[1]);
			expect(out[0]).not.toBe(out[2]);
			expect(out[1]).not.toBe(out[2]);

			const resAEs = out.map((item, index) => {
				expect(item).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = item.call(ctx, param1, param2);
				expect(res).toBeArrayOfSize(8);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
				expect(res[3]).toEqual(extA);
				expect(res[4]).toEqual(exts[index].extB);
				expect(res[5]).toEqual(exts[index].extC);
				expect(res[6]).toEqual(exts[index].extD);
				expect(res[7]).toEqual({extE: 5});
				return {extA: res[3], extE: res[7]};
			});

			const resAs = resAEs.map(resAE => resAE.extA);
			expect(resAs[0]).toBe(resAs[1]);
			expect(resAs[0]).toBe(resAs[2]);

			const resEs = resAEs.map(resAE => resAE.extE);
			expect(resEs[0]).not.toBe(resEs[1]);
			expect(resEs[0]).not.toBe(resEs[2]);
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
						return extA => () => [arguments, extA]; // eslint-disable-line prefer-rest-params
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
					expect(res).toBeArrayOfSize(3);
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

	describe('referencing other functions', () => {
		describe('in scope above (not injected)', () => {
			it('single instantiation', () => {
				function other() { return 123; }
				const input = () => other;
				const out = run(input, '(a=>()=>a)(function other(){return 123})');

				expect(out).toBeFunction();
				const otherFn = out();
				expect(otherFn).toBeFunction();
				expect(otherFn()).toBe(123);
			});

			it('multiple instantiations', () => {
				function other() { return 123; }
				const input = [1, 2, 3].map(() => () => other);
				const out = run(
					input, '(()=>{const a=(a=>()=>()=>a)(function other(){return 123});return[a(),a(),a()]})()'
				);

				expect(out).toBeArrayOfSize(3);
				const others = out.map((fn) => {
					expect(fn).toBeFunction();
					const otherFn = fn();
					expect(otherFn).toBeFunction();
					expect(otherFn()).toBe(123);
					return otherFn;
				});

				expect(others[0]).toBe(others[1]);
				expect(others[0]).toBe(others[2]);
			});
		});

		describe('in same scope (injected)', () => {
			it('single instantiation', () => {
				function outer(extA) {
					function other() { return extA; }
					return function inner() { return [extA, other]; };
				}
				const extA = {extA: 1};
				const input = outer(extA);
				const out = run(input);

				expect(out).toBeFunction();
				const res = out();
				expect(res).toBeArrayOfSize(2);
				const [resA, other] = res;
				expect(resA).toEqual(extA);
				expect(other).toBeFunction();
				expect(other()).toBe(resA);
			});

			it('multiple instantiations', () => {
				function outer(extA) {
					function other() { return extA; }
					return function inner() { return [extA, other]; };
				}
				const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
				const input = extAs.map(extA => outer(extA));
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				const others = out.map((inner, index) => {
					expect(inner).toBeFunction();
					const res = inner();
					expect(res).toBeArrayOfSize(2);
					const [extA, other] = res;
					expect(extA).toEqual(extAs[index]);
					expect(other).toBeFunction();
					expect(other()).toBe(extA);
					return other;
				});

				expect(others[0]).not.toBe(others[1]);
				expect(others[0]).not.toBe(others[2]);
			});
		});

		describe('in nested scope (injected)', () => {
			it('single instantiation', () => {
				function outer(extA) {
					let other;
					if (true) { // eslint-disable-line no-constant-condition
						const extB = extA;
						other = () => [extA, extB];
					}
					return function inner() { return [extA, other]; };
				}
				const extA = {extA: 1};
				const input = outer(extA);
				const out = run(input);

				expect(out).toBeFunction();
				const res = out();
				expect(res).toBeArrayOfSize(2);
				const [resA, other] = res;
				expect(resA).toEqual(extA);
				expect(other).toBeFunction();
				const otherRes = other();
				expect(otherRes).toBeArrayOfSize(2);
				const [resA2, resB] = otherRes;
				expect(resA2).toBe(resA);
				expect(resB).toBe(resA);
			});

			it('multiple instantiations', () => {
				function outer(extA) {
					let other;
					if (true) { // eslint-disable-line no-constant-condition
						const extB = extA;
						other = () => [extA, extB];
					}
					return function inner() { return [extA, other]; };
				}
				const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
				const input = extAs.map(extA => outer(extA));
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				const others = out.map((inner, index) => {
					expect(inner).toBeFunction();
					const res = inner();
					expect(res).toBeArrayOfSize(2);
					const [resA, other] = res;
					expect(resA).toEqual(extAs[index]);
					expect(other).toBeFunction();
					const otherRes = other();
					expect(otherRes).toBeArrayOfSize(2);
					const [resA2, resB] = otherRes;
					expect(resA2).toBe(resA);
					expect(resB).toBe(resA);
					return other;
				});

				expect(others[0]).not.toBe(others[1]);
				expect(others[0]).not.toBe(others[2]);
			});
		});

		describe('circular references between functions (both injected)', () => {
			it('single instantiation', () => {
				function outer(extA) {
					function inner1() { return [extA, inner2]; }
					function inner2() { return [extA, inner1]; }
					return inner1;
				}
				const extA = {extA: 1};
				const input = outer(extA);
				const out = run(input);

				expect(out).toBeFunction();
				const inner1Res = out();
				expect(inner1Res).toBeArrayOfSize(2);
				const [resA, inner2] = inner1Res;
				expect(resA).toEqual(extA);
				expect(inner2).toBeFunction();
				const inner2Res = inner2();
				expect(inner2Res).toBeArrayOfSize(2);
				const [resA2, inner1] = inner2Res;
				expect(resA2).toBe(resA);
				expect(inner1).toBe(out);
			});

			it('multiple instantiations', () => {
				function outer(extA) {
					function inner1() { return [extA, inner2]; }
					function inner2() { return [extA, inner1]; }
					return inner1;
				}
				const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
				const input = extAs.map(extA => outer(extA));
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				const inners = out.map((inner1, index) => {
					expect(inner1).toBeFunction();
					const inner1Res = inner1();
					expect(inner1Res).toBeArrayOfSize(2);
					const [resA, inner2] = inner1Res;
					expect(resA).toEqual(extAs[index]);
					expect(inner2).toBeFunction();
					const inner2Res = inner2();
					expect(inner2Res).toBeArrayOfSize(2);
					const [resA2, inner1FromInner2] = inner2Res;
					expect(resA2).toBe(resA);
					expect(inner1FromInner2).toBe(inner1);
					return {inner1, inner2};
				});

				const inner1s = inners.map(({inner1}) => inner1);
				expect(inner1s[0]).not.toBe(inner1s[1]);
				expect(inner1s[0]).not.toBe(inner1s[2]);

				const inner2s = inners.map(({inner2}) => inner2);
				expect(inner2s[0]).not.toBe(inner2s[1]);
				expect(inner2s[0]).not.toBe(inner2s[2]);
			});
		});
	});

	describe('with circular references', () => {
		it('nested in object 1 level deep', () => {
			const input = {
				fn: () => input
			};
			const out = run(input);

			expect(out).toBeObject();
			expect(out).toContainAllKeys(['fn']);
			const {fn} = out;
			expect(fn).toBeFunction();
			expect(fn()).toBe(out);
		});

		it('nested in object 2 levels deep', () => {
			const input = {
				inner: {
					fn: () => input
				}
			};
			const out = run(input);

			expect(out).toBeObject();
			expect(out).toContainAllKeys(['inner']);
			const {inner} = out;
			expect(inner).toBeObject();
			expect(inner).toContainAllKeys(['fn']);
			const {fn} = inner;
			expect(fn).toBeFunction();
			expect(fn()).toBe(out);
		});

		it('reference nested in nested function', () => {
			const input = {
				fn: x => () => [x, input]
			};
			const out = run(input);

			expect(out).toBeObject();
			expect(out).toContainAllKeys(['fn']);
			const {fn} = out;
			expect(fn).toBeFunction();
			const param = {};
			const fnInner = fn(param);
			expect(fnInner).toBeFunction();
			const res = fnInner();
			expect(res).toBeArrayOfSize(2);
			expect(res[0]).toBe(param);
			expect(res[1]).toBe(out);
		});
	});

	describe('with destructured params', () => {
		describe('in outer function', () => {
			describe('object destructuring', () => {
				it('destructured 1 level deep', () => {
					function outer({v, w}, {x, q: y, ...z}) {
						return () => [v, w, x, y, z];
					}
					const input = outer({v: 1, w: 2}, {x: 3, q: 4, m: 5, n: 6});
					const out = run(input, '((a,b,c,d,e)=>()=>[a,b,c,d,e])(1,2,3,4,{m:5,n:6})');

					expect(out).toBeFunction();
					const res = out();
					expect(res).toEqual([1, 2, 3, 4, {m: 5, n: 6}]);
				});

				it('destructured 2 levels deep', () => {
					function outer({vv: {v, w}}, {xx: {x}, yy: {q: y, ...z}}) {
						return () => [v, w, x, y, z];
					}
					const input = outer({vv: {v: 1, w: 2}}, {xx: {x: 3}, yy: {q: 4, m: 5, n: 6}});
					const out = run(input, '((a,b,c,d,e)=>()=>[a,b,c,d,e])(1,2,3,4,{m:5,n:6})');

					expect(out).toBeFunction();
					const res = out();
					expect(res).toEqual([1, 2, 3, 4, {m: 5, n: 6}]);
				});
			});

			describe('array destructuring', () => {
				it('destructured 1 level deep', () => {
					function outer([v, w], [, x, , , y, , ...z]) {
						return () => [v, w, x, y, z];
					}
					const input = outer([1, 2], [0, 3, 0, 0, 4, 0, 5, 6]);
					const out = run(input, '((a,b,c,d,e)=>()=>[a,b,c,d,e])(1,2,3,4,[5,6])');

					expect(out).toBeFunction();
					const res = out();
					expect(res).toEqual([1, 2, 3, 4, [5, 6]]);
				});

				it('destructured 2 levels deep', () => {
					function outer([[v], [w]], [[, x, , , y, , ...z]]) {
						return () => [v, w, x, y, z];
					}
					const input = outer([[1], [2]], [[0, 3, 0, 0, 4, 0, 5, 6]]);
					const out = run(input, '((a,b,c,d,e)=>()=>[a,b,c,d,e])(1,2,3,4,[5,6])');

					expect(out).toBeFunction();
					const res = out();
					expect(res).toEqual([1, 2, 3, 4, [5, 6]]);
				});
			});
		});

		describe('in exported function', () => {
			describe('object destructuring', () => {
				it('destructured 1 level deep', () => {
					function outer(x, y, q, z) { // eslint-disable-line no-unused-vars
						return ({v, w}, {x, q: y, ...z}) => [v, w, x, y, z]; // eslint-disable-line no-shadow
					}
					const input = outer();
					const out = run(input, '({v:a,w:b},{x:c,q:d,...e})=>[a,b,c,d,e]');

					expect(out).toBeFunction();
					const param1 = {},
						param2 = {},
						param3 = {},
						param4 = {},
						param5 = {},
						param6 = {};
					const res = out({v: param1, w: param2}, {x: param3, q: param4, m: param5, n: param6});
					expect(res).toBeArrayOfSize(5);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(param3);
					expect(res[3]).toBe(param4);
					expect(res[4]).toEqual({m: {}, n: {}});
					expect(res[4].m).toBe(param5);
					expect(res[4].n).toBe(param6);
				});

				it('destructured 2 levels deep', () => {
					function outer(x, y, ww, q, z) { // eslint-disable-line no-unused-vars
						// eslint-disable-next-line no-shadow
						return ({vv: {v, w}}, {xx: {x}, yy: {q: y}, ...z}) => [v, w, x, y, z];
					}
					const input = outer();
					const out = run(input, '({vv:{v:a,w:b}},{xx:{x:c},yy:{q:d},...e})=>[a,b,c,d,e]');

					expect(out).toBeFunction();
					const param1 = {},
						param2 = {},
						param3 = {},
						param4 = {},
						param5 = {},
						param6 = {};
					const res = out(
						{vv: {v: param1, w: param2}},
						{xx: {x: param3}, yy: {q: param4}, m: param5, n: param6}
					);
					expect(res).toBeArrayOfSize(5);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(param3);
					expect(res[3]).toBe(param4);
					expect(res[4]).toEqual({m: {}, n: {}});
					expect(res[4].m).toBe(param5);
					expect(res[4].n).toBe(param6);
				});
			});

			describe('array destructuring', () => {
				it('destructured 1 level deep', () => {
					function outer(w, y, z) { // eslint-disable-line no-unused-vars
						return ([v, w], [, x, , , y, , ...z]) => [v, w, x, y, z]; // eslint-disable-line no-shadow
					}
					const input = outer();
					const out = run(input, '([a,b],[,c,,,d,,...e])=>[a,b,c,d,e]');

					expect(out).toBeFunction();
					const param1 = {},
						param2 = {},
						param3 = {},
						param4 = {},
						param5 = {},
						param6 = {};
					const res = out([param1, param2], [0, param3, 0, 0, param4, 0, param5, param6]);
					expect(res).toBeArrayOfSize(5);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(param3);
					expect(res[3]).toBe(param4);
					expect(res[4]).toBeArrayOfSize(2);
					expect(res[4][0]).toBe(param5);
					expect(res[4][1]).toBe(param6);
				});

				it('destructured 2 levels deep', () => {
					function outer(w, y, z) { // eslint-disable-line no-unused-vars
						// eslint-disable-next-line no-shadow
						return ([[v], [w]], [[, x, , , y, , ...z]]) => [v, w, x, y, z];
					}
					const input = outer();
					const out = run(input, '([[a],[b]],[[,c,,,d,,...e]])=>[a,b,c,d,e]');

					expect(out).toBeFunction();
					const param1 = {},
						param2 = {},
						param3 = {},
						param4 = {},
						param5 = {},
						param6 = {};
					const res = out([[param1], [param2]], [[0, param3, 0, 0, param4, 0, param5, param6]]);
					expect(res).toBeArrayOfSize(5);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(param3);
					expect(res[3]).toBe(param4);
					expect(res[4]).toBeArrayOfSize(2);
					expect(res[4][0]).toBe(param5);
					expect(res[4][1]).toBe(param6);
				});
			});
		});
	});

	describe('with spread params', () => {
		it('in outer function', () => {
			function outer(x, y, ...z) {
				return () => [x, y, z];
			}
			const input = outer(1, 2, 3, 4, 5);
			const out = run(input, '((a,b,c)=>()=>[a,b,c])(1,2,[3,4,5])');

			expect(out).toBeFunction();
			const res = out();
			expect(res).toEqual([1, 2, [3, 4, 5]]);
		});

		it('in exported function', () => {
			function outer(y, z) { // eslint-disable-line no-unused-vars
				return (x, y, ...z) => [x, y, z]; // eslint-disable-line no-shadow
			}
			const input = outer();
			const out = run(input, '(a,b,...c)=>[a,b,c]');

			expect(out).toBeFunction();
			const param1 = {},
				param2 = {},
				param3 = {},
				param4 = {};
			const res = out(param1, param2, param3, param4);
			expect(res).toBeArrayOfSize(3);
			expect(res[0]).toBe(param1);
			expect(res[1]).toBe(param2);
			expect(res[2][0]).toBe(param3);
			expect(res[2][1]).toBe(param4);
		});
	});

	describe('referencing error argument of `catch ()`', () => {
		it('1 level up', () => {
			let input;
			try {
				throw 123; // eslint-disable-line no-throw-literal
			} catch (err) {
				const extA = 456;
				input = (x, y) => [x, y, extA, err];
			}
			const out = run(input, '((c,d)=>(a,b)=>[a,b,c,d])(456,123)');

			expect(out).toBeFunction();
			const param1 = {},
				param2 = {};
			const res = out(param1, param2);
			expect(res).toBeArrayOfSize(4);
			expect(res[0]).toBe(param1);
			expect(res[1]).toBe(param2);
			expect(res[2]).toEqual(456);
			expect(res[3]).toEqual(123);
		});

		it('2 levels up', () => {
			let input;
			try {
				throw 123; // eslint-disable-line no-throw-literal
			} catch (err) {
				const extA = 456;
				input = x => y => [x, y, extA, err];
			}
			const out = run(input, '((c,d)=>a=>b=>[a,b,c,d])(456,123)');

			expect(out).toBeFunction();
			const param1 = {},
				param2 = {};
			const res = out(param1)(param2);
			expect(res).toBeArrayOfSize(4);
			expect(res[0]).toBe(param1);
			expect(res[1]).toBe(param2);
			expect(res[2]).toEqual(456);
			expect(res[3]).toEqual(123);
		});
	});

	describe('referencing var created in `for ()`', () => {
		describe('`for ( ...; ...; ... )', () => {
			it('using `let`', () => {
				const input = [];
				for (let x = 1, y = 11; x <= 3; x++, y++) input.push(() => [x, y]); // NB No statement block
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				out.forEach((fn, index) => {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toEqual([index + 1, index + 11]);
				});
			});

			it('using `var`', () => {
				const input = [];
				// eslint-disable-next-line no-var, vars-on-top, no-loop-func
				for (var x = 1, y = 11; x <= 3; x++, y++) input.push(() => [x, y]); // NB No statement block
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				for (const fn of out) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toEqual([4, 14]);
				}
			});
		});

		describe('`for ( ... of ... )', () => {
			describe('using `const`', () => {
				it('without destructuring', () => {
					const input = [];
					for (const x of [0, 2, 4]) input.push(() => x); // NB No statement block
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					out.forEach((fn, index) => {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toBe(index * 2);
					});
				});

				it('with destructuring', () => {
					const input = [];
					for (
						const {x, yy: [y], ...z} of [
							{x: 1, yy: [2], m: 3, n: 4},
							{x: 11, yy: [12], m: 13, n: 14},
							{x: 21, yy: [22], m: 23, n: 24}
						]
					) input.push(() => [x, y, z]); // NB No statement block
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					out.forEach((fn, index) => {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toEqual(
							[index * 10 + 1, index * 10 + 2, {m: index * 10 + 3, n: index * 10 + 4}]
						);
					});
				});
			});

			describe('using `var`', () => {
				it('without destructuring', () => {
					const input = [];
					// eslint-disable-next-line no-var, vars-on-top, no-loop-func
					for (var x of [{obj1: 1}, {obj2: 2}, {obj3: 3}]) input.push(() => x); // NB No statement block
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					const ress = out.map((fn) => {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toEqual({obj3: 3});
						return res;
					});

					expect(ress[0]).toBe(ress[1]);
					expect(ress[0]).toBe(ress[2]);
				});

				it('with destructuring', () => {
					const input = [];
					for (
						var {x, yy: [y], ...z} of [ // eslint-disable-line no-var, vars-on-top
							{x: {objX1: 1}, yy: [{objY1: 2}], m: {objM1: 3}, n: {objN1: 4}},
							{x: {objX2: 11}, yy: [{objY2: 12}], m: {objM2: 13}, n: {objN2: 14}},
							{x: {objX3: 21}, yy: [{objY3: 22}], m: {objM3: 23}, n: {objN3: 24}}
						]
					) input.push(() => [x, y, z]); // eslint-disable-line no-loop-func
					// NB No statement block
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					const ress = out.map((fn) => {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toEqual([{objX3: 21}, {objY3: 22}, {m: {objM3: 23}, n: {objN3: 24}}]);
						return res;
					});

					expect(ress[0][0]).toBe(ress[1][0]);
					expect(ress[0][1]).toBe(ress[1][1]);
					expect(ress[0][2]).toBe(ress[1][2]);
					expect(ress[0][0]).toBe(ress[2][0]);
					expect(ress[0][1]).toBe(ress[2][1]);
					expect(ress[0][2]).toBe(ress[2][2]);
				});
			});
		});

		describe('`for ( ... in ... )', () => {
			it('using `const`', () => {
				const input = [];
				for (const x in {x: 1, y: 2, z: 3}) input.push(() => x); // NB No statement block
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				out.forEach((fn, index) => {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBe(['x', 'y', 'z'][index]);
				});
			});

			it('using `var`', () => {
				const input = [];
				// eslint-disable-next-line no-var, vars-on-top, no-loop-func
				for (var x in {x: 1, y: 2, z: 3}) input.push(() => x); // NB No statement block
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				for (const fn of out) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBe('z');
				}
			});
		});
	});

	describe('self-referencing functions', () => {
		it('own function', () => {
			const input = function x() {
				return x;
			};
			const out = run(input, '(function x(){return x})');

			expect(out()).toBe(out);
		});

		it('upper function', () => {
			const input = function x() {
				return () => x;
			};
			const out = run(input, '(function x(){return()=>x})');

			expect(out()()).toBe(out);
		});
	});

	describe('bound functions', () => {
		describe('no circulare references (no injection)', () => {
			it('single instantiation', () => {
				// eslint-disable-next-line no-invalid-this
				function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
				const ctx = {ctx: 1},
					extA = {extA: 2},
					extB = {extB: 3};
				const input = fn.bind(ctx, extA, extB, 123);
				const out = run(
					input, '(function fn(a,b,c,d,e){return[this,a,b,c,d,e]}).bind({ctx:1},{extA:2},{extB:3},123)'
				);

				expect(out).toBeFunction();
				const param1 = {},
					param2 = 100;
				const res = out(param1, param2);
				expect(res).toBeArrayOfSize(6);
				expect(res[0]).toEqual(ctx);
				expect(res[1]).toEqual(extA);
				expect(res[2]).toEqual(extB);
				expect(res[3]).toBe(123);
				expect(res[4]).toBe(param1);
				expect(res[5]).toBe(param2);
			});

			it('multiple instantiations', () => {
				// eslint-disable-next-line no-invalid-this
				function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
				const ctx = {ctx: 1},
					extA = {extA: 2};
				const extBs = [{extB1: 11}, {extB2: 12}, {extB3: 13}];
				const input = extBs.map(extB => fn.bind(ctx, extA, extB, 123));
				const out = run(input);

				expect(out).toBeArrayOfSize(3);
				expect(out[0]).not.toBe(out[1]);
				expect(out[0]).not.toBe(out[2]);
				expect(out[1]).not.toBe(out[2]);

				const ctxExtAs = out.map((boundFn, index) => {
					expect(boundFn).toBeFunction();
					const param1 = {},
						param2 = index * 100;
					const res = boundFn(param1, param2);
					expect(res).toBeArrayOfSize(6);
					expect(res[0]).toEqual(ctx);
					expect(res[1]).toEqual(extA);
					expect(res[2]).toEqual(extBs[index]);
					expect(res[3]).toBe(123);
					expect(res[4]).toBe(param1);
					expect(res[5]).toBe(param2);
					return {ctx: res[0], extA: res[1]};
				});

				const ctxs = ctxExtAs.map(({ctx}) => ctx); // eslint-disable-line no-shadow
				expect(ctxs[0]).toBe(ctxs[1]);
				expect(ctxs[0]).toBe(ctxs[2]);

				const extAs = ctxExtAs.map(({extA}) => extA); // eslint-disable-line no-shadow
				expect(extAs[0]).toBe(extAs[1]);
				expect(extAs[0]).toBe(extAs[2]);
			});
		});

		describe('bound to circular reference', () => {
			describe('object', () => {
				it('single instantiation', () => {
					// eslint-disable-next-line no-invalid-this
					function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
					const extA = {extA: 1},
						extB = {extB: 2};
					const input = {obj: {}};
					input.obj.fn = fn.bind(input, extA, extB, 123);
					const out = run(input);

					expect(out).toBeObject();
					expect(out).toContainAllKeys(['obj']);
					const {obj} = out;
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['fn']);
					const boundFn = obj.fn;
					expect(boundFn).toBeFunction();
					const param1 = {},
						param2 = 100;
					const res = boundFn(param1, param2);
					expect(res).toBeArrayOfSize(6);
					expect(res[0]).toBe(out);
					expect(res[1]).toEqual(extA);
					expect(res[2]).toEqual(extB);
					expect(res[3]).toBe(123);
					expect(res[4]).toBe(param1);
					expect(res[5]).toBe(param2);
				});

				it('multiple instantiations', () => {
					// eslint-disable-next-line no-invalid-this
					function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
					const extA = {extA: 2};
					const extBs = [{extB1: 11}, {extB2: 12}, {extB3: 13}];
					const input = [];
					for (const extB of extBs) {
						input.push({
							fn: fn.bind(input, extA, extB, 123)
						});
					}
					const out = run(input);

					expect(out).toBeArrayOfSize(3);
					expect(out[0]).not.toBe(out[1]);
					expect(out[0]).not.toBe(out[2]);
					expect(out[1]).not.toBe(out[2]);

					const extAs = out.map((obj, index) => {
						expect(obj).toBeObject();
						expect(obj).toContainAllKeys(['fn']);
						const boundFn = obj.fn;
						expect(boundFn).toBeFunction();
						const param1 = {},
							param2 = index * 100;
						const res = boundFn(param1, param2);
						expect(res).toBeArrayOfSize(6);
						expect(res[0]).toBe(out);
						expect(res[1]).toEqual(extA);
						expect(res[2]).toEqual(extBs[index]);
						expect(res[3]).toBe(123);
						expect(res[4]).toBe(param1);
						expect(res[5]).toBe(param2);
						return res[1];
					});

					expect(extAs[0]).toBe(extAs[1]);
					expect(extAs[0]).toBe(extAs[2]);
				});
			});

			it('function', () => {
				function fn() { return this; } // eslint-disable-line no-invalid-this
				const input = {
					fn,
					boundFn: fn.bind(fn)
				};
				const out = run(input);

				expect(out).toBeObject();
				expect(out).toContainAllKeys(['fn', 'boundFn']);
				const {boundFn} = out;
				expect(boundFn).toBeFunction();
				expect(boundFn()).toBe(out.fn);
			});
		});
	});

	describe('avoid var name clashes', () => {
		if (!minify || !inline) return;

		it('with globals', () => {
			if (mangle) {
				const input = (x, y) => [a, x, y]; // eslint-disable-line no-undef
				expect(serialize(input)).toBe('(b,c)=>[a,b,c]');
			} else {
				const fn = (0, (x, y) => [a, x, y]); // eslint-disable-line no-undef
				const input = {a: fn, b: fn};
				expect(serialize(input)).toBe('(()=>{const a$0=(x,y)=>[a,x,y];return{a:a$0,b:a$0}})()');
			}
		});

		if (mangle) {
			it('with function names', () => {
				const input = (x, y) => function a() { return [x, y]; };
				expect(serialize(input)).toBe('(b,c)=>function a(){return[b,c]}');
			});
		}
	});

	describe('do not treat labels as variables', () => {
		it('in labels', () => {
			// Test `console` is not misinterpretted as referring to external var
			let input;
			console: input = () => console; // eslint-disable-line no-labels, no-label-var, no-unused-labels
			const out = run(input, '()=>console');

			expect(out()).toBe(console);
		});

		it('in continue statements', () => {
			// Test `x` in `continue` statement is not misinterpretted as referring to external var `x`
			const x = {}; // eslint-disable-line no-unused-vars
			const input = () => {
				x: for (let i = 0; i < 3; i++) { // eslint-disable-line no-labels, no-label-var
					continue x; // eslint-disable-line no-labels, no-extra-label
				}
			};
			const out = run(input, '()=>{x:for(let a=0;a<3;a++){continue x}}');

			expect(out()).toBeUndefined();
		});

		it('in break statements', () => {
			// Test `x` in `break` statement is not misinterpretted as referring to external var `x`
			const x = {}; // eslint-disable-line no-unused-vars
			const input = () => {
				x: for (let i = 0; i < 3; i++) { // eslint-disable-line no-labels, no-label-var
					break x; // eslint-disable-line no-labels, no-extra-label
				}
			};
			const out = run(input, '()=>{x:for(let a=0;a<3;a++){break x}}');

			expect(out()).toBeUndefined();
		});
	});

	it('distinguish scopes and functions with same block IDs from different files', () => {
		const input = require('./fixtures/functionBlocks/index.js'); // eslint-disable-line global-require
		const out = run(input);

		expect(out).toBeObject();
		expect(out).toContainAllKeys(['inner1', 'inner2', 'inner3']);
		const {inner1, inner2, inner3} = out;
		expect(inner1).toBeFunction();
		expect(inner1()).toEqual([{extA1: 1}, {extB1: 2}]);
		expect(inner2).toBeFunction();
		expect(inner2()).toEqual([{extA2: 3}, {extB2: 4}]);
		expect(inner3).toBeFunction();
		expect(inner3()).toEqual([{extA3: 5}, {extB3: 6}]);
	});
});
