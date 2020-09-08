/* --------------------
 * livepack module
 * Tests for functions
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions, stripLineBreaks, stripSourceMapComment} = require('./support/index.js');

// Tests

describeWithAllOptions('Functions', ({run, serialize, minify, mangle, inline}) => {
	describe('without scope', () => {
		describe('single instantiation of function', () => {
			describe('arrow function', () => {
				it('anonymous', () => {
					run(
						(x, y) => [x, y],
						'(a,b)=>[a,b]',
						(fn) => {
							expect(fn).toBeFunction();
							const param1 = {},
								param2 = {};
							const res = fn(param1, param2);
							expect(res).toBeArrayOfSize(2);
							expect(res[0]).toBe(param1);
							expect(res[1]).toBe(param2);
							expect(fn.name).toBe('');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						}
					);
				});

				it('named', () => {
					const input = (x, y) => [x, y];
					run(
						input,
						'Object.defineProperties((a,b)=>[a,b],{name:{value:"input"}})',
						(fn) => {
							expect(fn).toBeFunction();
							const param1 = {},
								param2 = {};
							const res = fn(param1, param2);
							expect(res).toBeArrayOfSize(2);
							expect(res[0]).toBe(param1);
							expect(res[1]).toBe(param2);
							expect(fn.name).toBe('input');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						}
					);
				});
			});

			describe('function expression', () => {
				it('anonymous', () => {
					run(
						function(x, y) {
							return [x, y, this]; // eslint-disable-line no-invalid-this
						},
						'function(a,b){return[a,b,this]}',
						(fn) => {
							expect(fn).toBeFunction();
							const param1 = {},
								param2 = {},
								ctx = {};
							const res = fn.call(ctx, param1, param2);
							expect(res).toBeArrayOfSize(3);
							expect(res[0]).toBe(param1);
							expect(res[1]).toBe(param2);
							expect(res[2]).toBe(ctx);
							expect(fn.name).toBe('');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						}
					);
				});

				it('named', () => {
					run(
						function input(x, y) {
							return [x, y, this]; // eslint-disable-line no-invalid-this
						},
						'function input(a,b){return[a,b,this]}',
						(fn) => {
							expect(fn).toBeFunction();
							const param1 = {},
								param2 = {},
								ctx = {};
							const res = fn.call(ctx, param1, param2);
							expect(res).toBeArrayOfSize(3);
							expect(res[0]).toBe(param1);
							expect(res[1]).toBe(param2);
							expect(res[2]).toBe(ctx);
							expect(fn.name).toBe('input');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						}
					);
				});
			});

			it('function declaration', () => {
				function input(x, y) {
					return [x, y, this]; // eslint-disable-line no-invalid-this
				}
				run(
					input, 'function input(a,b){return[a,b,this]}',
					(fn) => {
						expect(fn).toBeFunction();
						const param1 = {},
							param2 = {},
							ctx = {};
						const res = fn.call(ctx, param1, param2);
						expect(res).toBeArrayOfSize(3);
						expect(res[0]).toBe(param1);
						expect(res[1]).toBe(param2);
						expect(res[2]).toBe(ctx);
						expect(fn.name).toBe('input');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
					}
				);
			});

			it('with default params', () => {
				run(
					(x = {defaultA: 1}, y = {defaultB: 2}) => [x, y],
					'(a={defaultA:1},b={defaultB:2})=>[a,b]',
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{defaultA: 1}, {defaultB: 2}]);
					}
				);
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
					run(
						(x = extA, y = extB) => [x, y],
						'((c,d)=>(a=c,b=d)=>[a,b])({extA:1},{extB:2})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([extA, extB]);
						}
					);
				});

				it('referencing external vars embedded in objects', () => {
					const extA = {extA: 1},
						extB = {extB: 2};
					run(
						(x = {nestedA: extA}, y = {nestedB: extB}) => [x, y],
						'((c,d)=>(a={nestedA:c},b={nestedB:d})=>[a,b])({extA:1},{extB:2})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([{nestedA: extA}, {nestedB: extB}]);
						}
					);
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

	describe('with external scope 2 levels up', () => {
		it('single instantiation of function', () => {
			const extA = {extA: 1},
				extB = {extB: 2};
			const input = function(x) {
				return y => [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
			};

			run(input, null, (fn1) => {
				expect(fn1).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const fn2 = fn1.call(ctx, param1);
				const res = fn2(param2);
				expect(res).toBeArrayOfSize(5);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
				expect(res[3]).toEqual(extA);
				expect(res[4]).toEqual(extB);
			});
		});

		it('multiple instantiations of function', () => {
			const extA = {extA: 1},
				extB = {extB: 2};
			const input = [1, 2, 3].map(() => (
				function(x) {
					return y => [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
				}
			));

			run(input, null, (out) => {
				expect(out).toBeArrayOfSize(3);
				expect(out[0]).not.toBe(out[1]);
				expect(out[0]).not.toBe(out[2]);
				expect(out[1]).not.toBe(out[2]);

				const resABs = out.map((fn1) => {
					expect(fn1).toBeFunction();
					const param1 = {},
						param2 = {},
						ctx = {};
					const fn2 = fn1.call(ctx, param1);
					const res = fn2(param2);
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

	describe('with external scope vars undefined', () => {
		describe('all external scope vars undefined', () => {
			it('1 external var undefined', () => {
				let ext;
				const input = (0, () => ext);
				run(
					input,
					'(a=>()=>a)()',
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn()).toBeUndefined();
					}
				);
			});

			it('multiple external vars undefined', () => {
				let extA, extB;
				const input = (0, () => [extA, extB]);
				run(
					input,
					'((a,b)=>()=>[a,b])()',
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([undefined, undefined]);
					}
				);
			});
		});

		describe('some external scope vars undefined', () => {
			it('1 external var undefined', () => {
				const extA = undefined,
					extB = 1;
				const input = (0, () => [extA, extB]);
				run(
					input,
					'((a,b)=>()=>[a,b])(void 0,1)',
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([undefined, 1]);
					}
				);
			});

			it('multiple external vars undefined', () => {
				const extA = undefined,
					extB = undefined,
					extC = 1;
				const input = (0, () => [extA, extB, extC]);
				run(
					input,
					'(()=>{const a=void 0;return((a,b,c)=>()=>[a,b,c])(a,a,1)})()',
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([undefined, undefined, 1]);
					}
				);
			});
		});
	});

	describe('nested scopes instantiated out of order', () => {
		describe('2 levels of nesting', () => {
			describe('no scope shared between functions', () => {
				it('shallower scope encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						input = {
							x: function x() {
								return {extA};
							},
							y: function y() {
								return {extB};
							}
						};
					}
					run(
						input,
						stripLineBreaks(`{
							x:(a=>function x(){return{extA:a}})({a:1}),
							y:(a=>function y(){return{extB:a}})({b:2})
						}`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							expect(x().extA).toEqual({a: 1});
							expect(y().extB).toEqual({b: 2});
						}
					);
				});

				it('deeper scope encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						input = {
							x: function x() {
								return {extB};
							},
							y: function y() {
								return {extA};
							}
						};
					}
					run(
						input,
						stripLineBreaks(`{
							x:(a=>function x(){return{extB:a}})({b:2}),
							y:(a=>function y(){return{extA:a}})({a:1})
						}`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							expect(x().extB).toEqual({b: 2});
							expect(y().extA).toEqual({a: 1});
						}
					);
				});
			});

			describe('scope shared between functions', () => {
				it('shallower scope encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						input = {
							x: function x() {
								return {extA};
							},
							y: function y() {
								return {extA, extB};
							}
						};
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								b=>[
									function x(){return{extA:b}},
									a=>function y(){return{extA:b,extB:a}}
								]
							)({a:1});
							return{x:a[0],y:a[1]({b:2})}
						})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extA).toEqual({a: 1});
							const resY = y();
							expect(resY.extB).toEqual({b: 2});
							expect(resY.extA).toBe(resX.extA);
						}
					);
				});

				it('deeper scope encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						input = {
							x: function x() {
								return {extB};
							},
							y: function y() {
								return {extA, extB};
							}
						};
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								b=>a=>[
									function x(){return{extB:a}},
									function y(){return{extA:b,extB:a}}
								]
							)({a:1})({b:2});
							return{x:a[0],y:a[1]}
						})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extB).toEqual({b: 2});
							const resY = y();
							expect(resY.extA).toEqual({a: 1});
							expect(resY.extB).toBe(resX.extB);
						}
					);
				});

				it('both scopes encountered singly first then together, shallower first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						input = {
							x: function x() {
								return {extA};
							},
							y: function y() {
								return {extB};
							},
							z: function z() {
								return {extA, extB};
							}
						};
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
									b=>[
										function x(){return{extA:b}},
										a=>[
											function y(){return{extB:a}},
											function z(){return{extA:b,extB:a}}
										]
									]
								)({a:1}),
								b=a[1]({b:2});
							return{x:a[0],y:b[0],z:b[1]}
						})()`),
						({x, y, z}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							expect(z).toBeFunction();
							expect(z.name).toBe('z');
							const resX = x();
							expect(resX.extA).toEqual({a: 1});
							const resY = y();
							expect(resY.extB).toEqual({b: 2});
							const resZ = z();
							expect(resZ.extA).toBe(resX.extA);
							expect(resZ.extB).toBe(resY.extB);
						}
					);
				});

				it('both scopes encountered singly first then together, deeper first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						input = {
							x: function x() {
								return {extB};
							},
							y: function y() {
								return {extA};
							},
							z: function z() {
								return {extA, extB};
							}
						};
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
									b=>[
										function y(){return{extA:b}},
										a=>[
											function x(){return{extB:a}},
											function z(){return{extA:b,extB:a}}
										]
									]
								)({a:1}),
								b=a[1]({b:2});
							return{x:b[0],y:a[0],z:b[1]}
						})()`),
						({x, y, z}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							expect(z).toBeFunction();
							expect(z.name).toBe('z');
							const resX = x();
							expect(resX.extB).toEqual({b: 2});
							const resY = y();
							expect(resY.extA).toEqual({a: 1});
							const resZ = z();
							expect(resZ.extA).toBe(resY.extA);
							expect(resZ.extB).toBe(resX.extB);
						}
					);
				});
			});
		});

		describe('3 levels of nesting', () => {
			describe('1 encountered first', () => {
				it('shallowest encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extA};
								},
								y: function y() {
									return {extA, extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
						const a=(
							c=>[
								function x(){return{extA:c}},
								b=>a=>function y(){return{extA:c,extB:b,extC:a}}
							]
						)({a:1});
						return{
							x:a[0],
							y:a[1]({b:2})({c:3})
						}
					})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extA).toEqual({a: 1});
							const resY = y();
							expect(resY.extA).toBe(resX.extA);
							expect(resY.extB).toEqual({b: 2});
							expect(resY.extC).toEqual({c: 3});
						}
					);
				});

				it('middle encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extB};
								},
								y: function y() {
									return {extA, extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
						const a=(
							c=>b=>[
								function x(){return{extB:b}},
								a=>function y(){return{extA:c,extB:b,extC:a}}
							]
						)({a:1})({b:2});
						return{
							x:a[0],
							y:a[1]({c:3})
						}
					})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extB).toEqual({b: 2});
							const resY = y();
							expect(resY.extA).toEqual({a: 1});
							expect(resY.extB).toBe(resX.extB);
							expect(resY.extC).toEqual({c: 3});
						}
					);
				});

				it('deepest encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extC};
								},
								y: function y() {
									return {extA, extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
						const a=(
							c=>b=>a=>[
								function x(){return{extC:a}},
								function y(){return{extA:c,extB:b,extC:a}}
							]
						)({a:1})({b:2})({c:3});
						return{
							x:a[0],
							y:a[1]
						}
					})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extC).toEqual({c: 3});
							const resY = y();
							expect(resY.extA).toEqual({a: 1});
							expect(resY.extB).toEqual({b: 2});
							expect(resY.extC).toBe(resX.extC);
						}
					);
				});
			});

			describe('2 encountered first together, then all', () => {
				it('shallowest two encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extA, extB};
								},
								y: function y() {
									return {extA, extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								c=>b=>[
									function x(){return{extA:c,extB:b}},
									a=>function y(){return{extA:c,extB:b,extC:a}}
								]
							)({a:1})({b:2});
							return{
								x:a[0],
								y:a[1]({c:3})
							}
						})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extA).toEqual({a: 1});
							expect(resX.extB).toEqual({b: 2});
							const resY = y();
							expect(resY.extA).toBe(resX.extA);
							expect(resY.extB).toBe(resX.extB);
							expect(resY.extC).toEqual({c: 3});
						}
					);
				});

				it('deepest two encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extB, extC};
								},
								y: function y() {
									return {extA, extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								c=>b=>a=>[
									function x(){return{extB:b,extC:a}},
									function y(){return{extA:c,extB:b,extC:a}}
								]
							)({a:1})({b:2})({c:3});
							return{
								x:a[0],
								y:a[1]
							}
						})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extB).toEqual({b: 2});
							expect(resX.extC).toEqual({c: 3});
							const resY = y();
							expect(resY.extA).toEqual({a: 1});
							expect(resY.extB).toBe(resX.extB);
							expect(resY.extC).toBe(resX.extC);
						}
					);
				});

				it('deepest and shallowest two encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extA, extC};
								},
								y: function y() {
									return {extA, extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								c=>b=>a=>[
									function x(){return{extA:c,extC:a}},
									function y(){return{extA:c,extB:b,extC:a}}
								]
							)({a:1})({b:2})({c:3});
							return{
								x:a[0],
								y:a[1]
							}
						})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extA).toEqual({a: 1});
							expect(resX.extC).toEqual({c: 3});
							const resY = y();
							expect(resY.extA).toBe(resX.extA);
							expect(resY.extB).toEqual({b: 2});
							expect(resY.extC).toBe(resX.extC);
						}
					);
				});
			});

			describe('2 encountered first together, then last joined', () => {
				it('shallowest two encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extA, extB};
								},
								y: function y() {
									return {extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								c=>b=>[
									function x(){return{extA:c,extB:b}},
									a=>function y(){return{extB:b,extC:a}}
								]
							)({a:1})({b:2});
							return{
								x:a[0],
								y:a[1]({c:3})
							}
						})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extA).toEqual({a: 1});
							expect(resX.extB).toEqual({b: 2});
							const resY = y();
							expect(resY.extB).toBe(resX.extB);
							expect(resY.extC).toEqual({c: 3});
						}
					);
				});

				it('deepest two encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extB, extC};
								},
								y: function y() {
									return {extA, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								c=>b=>a=>[
									function x(){return{extB:b,extC:a}},
									function y(){return{extA:c,extC:a}}
								]
							)({a:1})({b:2})({c:3});
							return{
								x:a[0],
								y:a[1]
							}
						})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extB).toEqual({b: 2});
							expect(resX.extC).toEqual({c: 3});
							const resY = y();
							expect(resY.extA).toEqual({a: 1});
							expect(resY.extC).toBe(resX.extC);
						}
					);
				});

				it('deepest and shallowest two encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extA, extC};
								},
								y: function y() {
									return {extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								c=>b=>a=>[
									function x(){return{extA:c,extC:a}},
									function y(){return{extB:b,extC:a}}
								]
							)({a:1})({b:2})({c:3});
							return{
								x:a[0],
								y:a[1]
							}
						})()`),
						({x, y}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							const resX = x();
							expect(resX.extA).toEqual({a: 1});
							expect(resX.extC).toEqual({c: 3});
							const resY = y();
							expect(resY.extB).toEqual({b: 2});
							expect(resY.extC).toBe(resX.extC);
						}
					);
				});
			});

			describe('2 encountered first singly', () => {
				it('shallowest two encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extA};
								},
								y: function y() {
									return {extB};
								},
								z: function z() {
									return {extA, extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								c=>[
									function x(){return{extA:c}},
									b=>[
										function y(){return{extB:b}},
										a=>function z(){return{extA:c,extB:b,extC:a}}
									]
								]
							)({a:1}),
							b=a[1]({b:2});
							return{
								x:a[0],
								y:b[0],
								z:b[1]({c:3})
							}
						})()`),
						({x, y, z}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							expect(z).toBeFunction();
							expect(z.name).toBe('z');
							const resX = x();
							expect(resX.extA).toEqual({a: 1});
							const resY = y();
							expect(resY.extB).toEqual({b: 2});
							const resZ = z();
							expect(resZ.extA).toBe(resX.extA);
							expect(resZ.extB).toBe(resY.extB);
							expect(resZ.extC).toEqual({c: 3});
						}
					);
				});

				it('deepest two encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extB};
								},
								y: function y() {
									return {extC};
								},
								z: function z() {
									return {extA, extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								c=>b=>[
									function x(){return{extB:b}},
									a=>[
										function y(){return{extC:a}},
										function z(){return{extA:c,extB:b,extC:a}}
									]
								]
							)({a:1})({b:2}),
							b=a[1]({c:3});
							return{
								x:a[0],
								y:b[0],
								z:b[1]
							}
						})()`),
						({x, y, z}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							expect(z).toBeFunction();
							expect(z.name).toBe('z');
							const resX = x();
							expect(resX.extB).toEqual({b: 2});
							const resY = y();
							expect(resY.extC).toEqual({c: 3});
							const resZ = z();
							expect(resZ.extA).toEqual({a: 1});
							expect(resZ.extB).toBe(resX.extB);
							expect(resZ.extC).toBe(resY.extC);
						}
					);
				});

				it('shallowest and deepest two encountered first', () => {
					let input;
					const extA = {a: 1};
					{
						const extB = {b: 2};
						{
							const extC = {c: 3};
							input = {
								x: function x() {
									return {extA};
								},
								y: function y() {
									return {extC};
								},
								z: function z() {
									return {extA, extB, extC};
								}
							};
						}
					}
					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								c=>[
									function x(){return{extA:c}},
									b=>a=>[
										function y(){return{extC:a}},
										function z(){return{extA:c,extB:b,extC:a}}
									]
								]
							)({a:1}),
							b=a[1]({b:2})({c:3});
							return{
								x:a[0],
								y:b[0],
								z:b[1]
							}
						})()`),
						({x, y, z}) => {
							expect(x).toBeFunction();
							expect(x.name).toBe('x');
							expect(y).toBeFunction();
							expect(y.name).toBe('y');
							expect(z).toBeFunction();
							expect(z.name).toBe('z');
							const resX = x();
							expect(resX.extA).toEqual({a: 1});
							const resY = y();
							expect(resY.extC).toEqual({c: 3});
							const resZ = z();
							expect(resZ.extA).toBe(resX.extA);
							expect(resZ.extB).toEqual({b: 2});
							expect(resZ.extC).toBe(resY.extC);
						}
					);
				});
			});
		});

		it('many levels of nesting', () => {
			let input;
			const extA = {a: 1};
			{
				const extB = {b: 2};
				{
					const extC = {c: 3};
					{
						const extD = {d: 4};
						{
							const extE = {e: 5};
							{
								const extF = {f: 6};
								{
									const extG = {g: 7};
									{
										const extH = {h: 8};
										input = {
											x: function x() {
												return {extA, extC, extD, extF, extH};
											},
											y: function y() {
												return {extB, extE};
											},
											z: function z() {
												return {extE, extG, extH};
											}
										};
									}
								}
							}
						}
					}
				}
			}
			run(
				input,
				stripLineBreaks(`(()=>{
					const a=(
							h=>g=>f=>e=>d=>[
								function y(){return{extB:g,extE:d}},
								c=>b=>a=>[
									function x(){return{extA:h,extC:f,extD:e,extF:c,extH:a}},
									function z(){return{extE:d,extG:b,extH:a}}
								]
							]
						)({a:1})({b:2})({c:3})({d:4})({e:5}),
						b=a[1]({f:6})({g:7})({h:8});
					return{
						x:b[0],
						y:a[0],
						z:b[1]
					}
				})()`),
				({x, y, z}) => {
					expect(x).toBeFunction();
					expect(x.name).toBe('x');
					expect(y).toBeFunction();
					expect(y.name).toBe('y');
					expect(z).toBeFunction();
					expect(z.name).toBe('z');
					const resX = x();
					expect(resX.extA).toEqual({a: 1});
					expect(resX.extC).toEqual({c: 3});
					expect(resX.extD).toEqual({d: 4});
					expect(resX.extF).toEqual({f: 6});
					expect(resX.extH).toEqual({h: 8});
					const resY = y();
					expect(resY.extB).toEqual({b: 2});
					expect(resY.extE).toEqual({e: 5});
					const resZ = z();
					expect(resZ.extE).toBe(resY.extE);
					expect(resZ.extG).toEqual({g: 7});
					expect(resZ.extH).toBe(resX.extH);
				}
			);
		});
	});

	describe('nested blocks where some missing scopes', () => {
		it('1 missing block in 2 deep nesting', () => {
			const extA = {a: 1};
			function outer(extB) {
				return {
					x: function x() {
						return {extA, extB};
					},
					y: function y() {
						return {extB};
					}
				};
			}
			const res1 = outer({b: 2});
			const res2 = outer({b: 12});
			const input = {x: res1.x, y1: res1.y, y2: res2.y};

			run(
				input,
				stripLineBreaks(`(()=>{
					const a=(
							b=>a=>[
								function x(){return{extA:b,extB:a}},
								function y(){return{extB:a}}
							]
						)({a:1}),
						b=a({b:2});
					return{
						x:b[0],
						y1:b[1],
						y2:a({b:12})[1]
					}
				})()`),
				({x, y1, y2}) => {
					expect(x).toBeFunction();
					expect(x.name).toBe('x');
					expect(y1).toBeFunction();
					expect(y1.name).toBe('y');
					expect(y2).toBeFunction();
					expect(y2.name).toBe('y');
					const resX = x();
					expect(resX.extA).toEqual({a: 1});
					expect(resX.extB).toEqual({b: 2});
					expect(y1().extB).toBe(resX.extB);
					expect(y2().extB).toEqual({b: 12});
				}
			);
		});

		it('2 missing blocks in 3-deep nesting', () => {
			const extA = {a: 1};
			function outer(extB) {
				return function inner(extC) {
					return {
						x: function x() {
							return {extA, extB, extC};
						},
						y: function y() {
							return {extC};
						}
					};
				};
			}
			const inner = outer({b: 2});
			const res1 = inner({c: 3});
			const res2 = inner({c: 13});
			const input = {x: res1.x, y1: res1.y, y2: res2.y};

			run(
				input,
				stripLineBreaks(`(()=>{
					const a=(
							c=>b=>a=>[
								function x(){return{extA:c,extB:b,extC:a}},
								function y(){return{extC:a}}
							]
						)({a:1})({b:2}),
						b=a({c:3});
					return{
						x:b[0],
						y1:b[1],
						y2:a({c:13})[1]
					}
				})()`),
				({x, y1, y2}) => {
					expect(x).toBeFunction();
					expect(x.name).toBe('x');
					expect(y1).toBeFunction();
					expect(y1.name).toBe('y');
					expect(y2).toBeFunction();
					expect(y2.name).toBe('y');
					const resX = x();
					expect(resX.extA).toEqual({a: 1});
					expect(resX.extB).toEqual({b: 2});
					expect(resX.extC).toEqual({c: 3});
					expect(y1().extC).toBe(resX.extC);
					expect(y2().extC).toEqual({c: 13});
				}
			);
		});

		it('1 missing block in 3-deep nesting', () => {
			const extA = {a: 1};
			function outer(extB) {
				return function inner(extC) {
					return {
						x: function x() {
							return {extA, extB, extC};
						},
						y: function y() {
							return {extA, extC};
						}
					};
				};
			}
			const inner = outer({b: 2});
			const res1 = inner({c: 3});
			const res2 = inner({c: 13});
			const input = {x: res1.x, y1: res1.y, y2: res2.y};

			run(
				input,
				stripLineBreaks(`(()=>{
					const a=(
							c=>b=>a=>[
								function x(){return{extA:c,extB:b,extC:a}},
								function y(){return{extA:c,extC:a}}
							]
						)({a:1})({b:2}),
						b=a({c:3});
					return{
						x:b[0],
						y1:b[1],
						y2:a({c:13})[1]
					}
				})()`),
				({x, y1, y2}) => {
					expect(x).toBeFunction();
					expect(x.name).toBe('x');
					expect(y1).toBeFunction();
					expect(y1.name).toBe('y');
					expect(y2).toBeFunction();
					expect(y2.name).toBe('y');
					const resX = x();
					expect(resX.extA).toEqual({a: 1});
					expect(resX.extB).toEqual({b: 2});
					expect(resX.extC).toEqual({c: 3});
					const resY1 = y1();
					expect(resY1.extA).toBe(resX.extA);
					expect(resY1.extC).toBe(resX.extC);
					const resY2 = y2();
					expect(resY2.extA).toBe(resX.extA);
					expect(resY2.extC).toEqual({c: 13});
				}
			);
		});

		it('2 missing blocks in 4-deep nesting', () => {
			const extA = {a: 1};
			function outer(extB) {
				return function inner(extC) {
					return function innerInner(extD) {
						return {
							x: function x() {
								return {extA, extB, extC, extD};
							},
							y: function y() {
								return {extB, extD};
							}
						};
					};
				};
			}
			const inner1 = outer({b: 2});
			const inner2 = outer({b: 12});
			const innerInner1 = inner1({c: 3});
			const innerInner2 = inner2({c: 13});
			const res1 = innerInner1({d: 4});
			const res2 = innerInner2({d: 14});
			const input = {x: res1.x, y1: res1.y, y2: res2.y};

			run(
				input,
				stripLineBreaks(`(()=>{
					const a=(
							d=>c=>b=>a=>[
								function x(){return{extA:d,extB:c,extC:b,extD:a}},
								function y(){return{extB:c,extD:a}}
							]
						)({a:1}),
						b=a({b:2})({c:3})({d:4});
					return{
						x:b[0],
						y1:b[1],
						y2:a({b:12})()({d:14})[1]
					}
				})()`),
				({x, y1, y2}) => {
					expect(x).toBeFunction();
					expect(x.name).toBe('x');
					expect(y1).toBeFunction();
					expect(y1.name).toBe('y');
					expect(y2).toBeFunction();
					expect(y2.name).toBe('y');
					const resX = x();
					expect(resX.extA).toEqual({a: 1});
					expect(resX.extB).toEqual({b: 2});
					expect(resX.extC).toEqual({c: 3});
					expect(resX.extD).toEqual({d: 4});
					const resY1 = y1();
					expect(resY1.extB).toBe(resX.extB);
					expect(resY1.extD).toBe(resX.extD);
					const resY2 = y2();
					expect(resY2.extB).toEqual({b: 12});
					expect(resY2.extD).toEqual({d: 14});
				}
			);
		});

		it('3 missing blocks in 5-deep nesting', () => {
			const extA = {a: 1};
			function outer(extB) {
				return function inner(extC) {
					return function innerInner(extD) {
						return function innerInnerInner(extE) {
							return {
								x: function x() {
									return {extA, extB, extC, extD, extE};
								},
								y: function y() {
									return {extB, extE};
								}
							};
						};
					};
				};
			}
			const inner1 = outer({b: 2});
			const inner2 = outer({b: 12});
			const innerInner1 = inner1({c: 3});
			const innerInner2 = inner2({c: 13});
			const innerInnerInner1 = innerInner1({d: 4});
			const innerInnerInner2 = innerInner2({d: 14});
			const res1 = innerInnerInner1({e: 5});
			const res2 = innerInnerInner2({e: 15});
			const input = {x: res1.x, y1: res1.y, y2: res2.y};

			run(
				input,
				stripLineBreaks(`(()=>{
					const a=(
							e=>d=>c=>b=>a=>[
								function x(){return{extA:e,extB:d,extC:c,extD:b,extE:a}},
								function y(){return{extB:d,extE:a}}
							]
						)({a:1}),
						b=a({b:2})({c:3})({d:4})({e:5});
					return{
						x:b[0],
						y1:b[1],
						y2:a({b:12})()()({e:15})[1]
					}
				})()`),
				({x, y1, y2}) => {
					expect(x).toBeFunction();
					expect(x.name).toBe('x');
					expect(y1).toBeFunction();
					expect(y1.name).toBe('y');
					expect(y2).toBeFunction();
					expect(y2.name).toBe('y');
					const resX = x();
					expect(resX.extA).toEqual({a: 1});
					expect(resX.extB).toEqual({b: 2});
					expect(resX.extC).toEqual({c: 3});
					expect(resX.extD).toEqual({d: 4});
					expect(resX.extE).toEqual({e: 5});
					const resY1 = y1();
					expect(resY1.extB).toBe(resX.extB);
					expect(resY1.extE).toBe(resX.extE);
					const resY2 = y2();
					expect(resY2.extB).toEqual({b: 12});
					expect(resY2.extE).toEqual({e: 15});
				}
			);
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
				const out = run(input, 'function input(){return this}');

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
						const out = run(input, 'function input(){return function(){return this}}');

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
						const out = run(input, 'function input(){return function(){return this}}');

						expect(out).toBeFunction();
						const res = out();
						expect(res).toBeFunction();
						const ctx = {};
						expect(res.call(ctx)).toBe(ctx);
					});

					it('arrow function', () => {
						run(
							() => function() { return this; }, // eslint-disable-line no-invalid-this
							'()=>function(){return this}',
							(fn) => {
								expect(fn).toBeFunction();
								const res = fn();
								expect(res).toBeFunction();
								const ctx = {};
								expect(res.call(ctx)).toBe(ctx);
							}
						);
					});
				});

				describe('referencing exported function scope', () => {
					it('from 1 level up', () => {
						function input() {
							return () => this; // eslint-disable-line no-invalid-this
						}
						const out = run(input, 'function input(){return()=>this}');

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
						const out = run(input, 'function input(){return()=>()=>this}');

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
								const out = run(input, 'function input(){return function(){return()=>this}}');

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
								const out = run(input, 'function input(){return function(){return()=>()=>this}}');

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
								const out = run(input, 'function input(){return function(){return()=>this}}');

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
								const out = run(input, 'function input(){return function(){return()=>()=>this}}');

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
								run(
									() => (
										function() {
											return () => this; // eslint-disable-line no-invalid-this
										}
									),
									'()=>function(){return()=>this}',
									(fn) => {
										expect(fn).toBeFunction();
										const res = fn();
										expect(res).toBeFunction();
										const ctx = {};
										const res2 = res.call(ctx);
										expect(res2).toBeFunction();
										expect(res2()).toBe(ctx);
									}
								);
							});

							it('from 2 levels up', () => {
								run(
									() => (
										function() {
											return () => () => this; // eslint-disable-line no-invalid-this
										}
									),
									'()=>function(){return()=>()=>this}',
									(fn) => {
										expect(fn).toBeFunction();
										const res = fn();
										expect(res).toBeFunction();
										const ctx = {};
										const res2 = res.call(ctx);
										expect(res2).toBeFunction();
										const res3 = res2();
										expect(res3).toBeFunction();
										expect(res3()).toBe(ctx);
									}
								);
							});
						});
					});
				});
			});
		});

		it('referencing own context', () => {
			function input() {
				return this; // eslint-disable-line no-invalid-this
			}
			run(
				input,
				'function input(){return this}',
				(fn) => {
					expect(fn).toBeFunction();
					const ctx = {ctx: 1};
					expect(fn.call(ctx)).toBe(ctx);
				}
			);
		});

		it('referencing global scope', () => {
			const input = (0, () => this); // eslint-disable-line no-invalid-this
			run(
				input,
				'()=>this',
				(fn) => {
					expect(fn).toBeFunction();
					fn(); // Can't test for return value due to how serialized code is evaluated
				}
			);
		});
	});

	describe('referencing other functions', () => {
		describe('in scope above (not injected)', () => {
			it('single instantiation', () => {
				function other() { return 123; }
				run(
					() => other,
					'(a=>()=>a)(function other(){return 123})',
					(fn) => {
						expect(fn).toBeFunction();
						const otherFn = fn();
						expect(otherFn).toBeFunction();
						expect(otherFn()).toBe(123);
					}
				);
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

		describe('circular references between functions defined in scope and external vars', () => {
			describe('function only', () => {
				it('single instantiation', () => {
					const ext = {};
					const input = (0, () => ext);
					ext.fn = input;

					run(
						input,
						'(()=>{const a={},b=(a=>()=>a)(a);a.fn=b;return b})()',
						(fn) => {
							expect(fn).toBeFunction();
							const obj = fn();
							expect(obj).toBeObject();
							expect(obj.fn).toBe(fn);
						}
					);
				});

				it('multiple instantiations', () => {
					function outer(num) {
						const ext = {num};
						const fn = (0, () => ext);
						ext.fn = fn;
						return fn;
					}

					const input = [0, 1, 2].map(num => outer(num));

					run(
						input,
						'(()=>{const a=a=>()=>a,b={num:0},c=a(b),d={num:1},e=a(d),f={num:2},g=a(f);b.fn=c;d.fn=e;f.fn=g;return[c,e,g]})()',
						(arr) => {
							expect(arr).toBeArrayOfSize(3);
							const objs = arr.map((fn, index) => {
								expect(fn).toBeFunction();
								const obj = fn();
								expect(obj).toBeObject();
								expect(obj.fn).toBe(fn);
								expect(obj.num).toBe(index);
								return obj;
							});

							const fns = objs.map(({fn}) => fn);
							expect(fns[0]).not.toBe(fns[1]);
							expect(fns[0]).not.toBe(fns[2]);
							expect(fns[1]).not.toBe(fns[2]);
						}
					);
				});
			});

			describe('circular function referenced by another function', () => {
				it('single instantiation', () => {
					const ext = {};
					const fn = (0, () => ext);
					ext.x = fn;
					const input = (0, () => fn);

					run(
						input,
						'(()=>{const a={},b=((a,b)=>[a=>b=a,()=>a,()=>b])(a),c=b[1];a.x=c;b[0](c);return b[2]})()',
						(fn1) => {
							expect(fn1).toBeFunction();
							const fn2 = fn1();
							expect(fn2).toBeFunction();
							const obj = fn2();
							expect(obj).toBeObject();
							expect(obj.x).toBe(fn2);
						}
					);
				});

				it('multiple instantiations', () => {
					function outer(num) {
						const ext = {num};
						const fn = (0, () => ext);
						ext.fn = fn;
						return (0, () => fn);
					}

					const input = [0, 1, 2].map(num => outer(num));

					run(
						input,
						'(()=>{const a=(a,b)=>[a=>b=a,()=>a,()=>b],b={num:0},c=a(b),d={num:1},e=a(d),f={num:2},g=a(f),h=c[1],i=e[1],j=g[1];b.fn=h;c[0](h);d.fn=i;e[0](i);f.fn=j;g[0](j);return[c[2],e[2],g[2]]})()',
						(arr) => {
							expect(arr).toBeArrayOfSize(3);
							const objs = arr.map((fn1, index) => {
								expect(fn1).toBeFunction();
								const fn2 = fn1();
								expect(fn2).toBeFunction();
								const obj = fn2();
								expect(obj).toBeObject();
								expect(obj.fn).toBe(fn2);
								expect(obj.num).toBe(index);
								return obj;
							});

							const fns = objs.map(({fn}) => fn);
							expect(fns[0]).not.toBe(fns[1]);
							expect(fns[0]).not.toBe(fns[2]);
							expect(fns[1]).not.toBe(fns[2]);
						}
					);
				});
			});

			describe('2 functions in same scope referencing object containing one of functions', () => {
				it('single instantiation', () => {
					const ext = {x};
					function x() { return ext; }
					const input = function y() { return ext; };

					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
								a=>[
									b=>a=b,
									function x(){return a},
									function y(){return a}
								]
							)();
							a[0]({x:a[1]});
							return a[2]
						})()`),
						(fn1) => {
							expect(fn1).toBeFunction();
							expect(fn1.name).toBe('y');
							const obj = fn1();
							expect(obj).toBeObject();
							const fn2 = obj.x;
							expect(fn2).toBeFunction();
							expect(fn2.name).toBe('x');
							expect(fn2()).toBe(obj);
						}
					);
				});

				it('multiple instantiations', () => {
					function outer(num) {
						const ext = {num, x};
						function x() { return ext; }
						return function y() { return ext; };
					}

					const input = [0, 1, 2].map(num => outer(num));

					run(
						input,
						stripLineBreaks(`(()=>{
							const a=a=>[
									b=>a=b,
									function x(){return a},
									function y(){return a}
								],
								b=a(),
								c=a(),
								d=a();
							b[0]({num:0,x:b[1]});
							c[0]({num:1,x:c[1]});
							d[0]({num:2,x:d[1]});
							return[b[2],c[2],d[2]]
						})()`),
						(arr) => {
							expect(arr).toBeArrayOfSize(3);
							arr.forEach((fn1, index) => {
								expect(fn1).toBeFunction();
								expect(fn1.name).toBe('y');
								const obj = fn1();
								expect(obj).toBeObject();
								const fn2 = obj.x;
								expect(fn2).toBeFunction();
								expect(fn2.name).toBe('x');
								expect(fn2()).toBe(obj);
								expect(obj.num).toBe(index);
								return {fn1, fn2};
							});
						}
					);
				});
			});

			describe('function referencing object containing another function in same scope', () => {
				it('single instantiation', () => {
					const ext = {x};
					function x() { return y; }
					function y() { return ext; }
					const input = y;

					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(
									(a,b)=>[
										b=>a=b,
										a=>b=a,
										function x(){return a},
										function y(){return b}
									]
								)(),
								b=a[3];
							a[0](b);
							a[1]({x:a[2]});
							return b
						})()`),
						(fn1) => {
							expect(fn1).toBeFunction();
							expect(fn1.name).toBe('y');
							const obj = fn1();
							expect(obj).toBeObject();
							const fn2 = obj.x;
							expect(fn2).toBeFunction();
							expect(fn2.name).toBe('x');
							expect(fn2()).toBe(fn1);
						}
					);
				});

				it('multiple instantiations', () => {
					function outer(num) {
						const ext = {num, x};
						function x() { return y; }
						function y() { return ext; }
						return y;
					}

					const input = [0, 1, 2].map(num => outer(num));

					run(
						input,
						stripLineBreaks(`(()=>{
							const a=(a,b)=>[
									b=>a=b,
									a=>b=a,
									function x(){return a},
									function y(){return b}
								],
								b=a(),
								c=b[3],
								d=a(),
								e=d[3],
								f=a(),
								g=f[3];
							b[0](c);
							b[1]({num:0,x:b[2]});
							d[0](e);
							d[1]({num:1,x:d[2]});
							f[0](g);
							f[1]({num:2,x:f[2]});
							return[c,e,g]
						})()`),
						(arr) => {
							expect(arr).toBeArrayOfSize(3);
							arr.forEach((fn1, index) => {
								expect(fn1).toBeFunction();
								expect(fn1.name).toBe('y');
								const obj = fn1();
								expect(obj).toBeObject();
								const fn2 = obj.x;
								expect(fn2).toBeFunction();
								expect(fn2.name).toBe('x');
								expect(fn2()).toBe(fn1);
								expect(obj.num).toBe(index);
								return {fn1, fn2};
							});
						}
					);
				});
			});
		});
	});

	describe('with circular references', () => {
		it('nested in object 1 level deep', () => {
			const input = {};
			input.fn = () => input;
			run(
				input,
				'(()=>{const a=(a=>[b=>a=b,()=>a])(),b={fn:a[1]};a[0](b);return b})()',
				(obj) => {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['fn']);
					const {fn} = obj;
					expect(fn).toBeFunction();
					expect(fn()).toBe(obj);
				}
			);
		});

		it('nested in object 2 levels deep', () => {
			const input = {inner: {}};
			input.inner.fn = () => input;
			run(
				input,
				'(()=>{const a=(a=>[b=>a=b,()=>a])(),b={inner:{fn:a[1]}};a[0](b);return b})()',
				(obj) => {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['inner']);
					const {inner} = obj;
					expect(inner).toBeObject();
					expect(inner).toContainAllKeys(['fn']);
					const {fn} = inner;
					expect(fn).toBeFunction();
					expect(fn()).toBe(obj);
				}
			);
		});

		it('reference nested in nested function', () => {
			const input = {};
			input.fn = x => () => [x, input];
			run(
				input,
				'(()=>{const a=(b=>[a=>b=a,a=>()=>[a,b]])(),b={fn:a[1]};a[0](b);return b})()',
				(out) => {
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
				}
			);
		});

		describe('leaving gaps in params', () => {
			it('1 gap', () => {
				const input = {};
				const ext = {x: 1};
				input.fn = () => [input, ext];
				run(
					input,
					'(()=>{const a=((a,b)=>[b=>a=b,()=>[a,b]])(void 0,{x:1}),b={fn:a[1]};a[0](b);return b})()',
					(obj) => {
						expect(obj).toBeObject();
						expect(obj).toContainAllKeys(['fn']);
						const {fn} = obj;
						expect(fn).toBeFunction();
						const arr = fn();
						expect(arr).toBeArrayOfSize(2);
						expect(arr[0]).toBe(obj);
						expect(arr[1]).toEqual({x: 1});
					}
				);
			});

			it('2 gaps', () => {
				const inner = {};
				const input = {inner};
				const ext = {x: 1};
				inner.fn = () => [input, inner, ext];
				run(
					input,
					'(()=>{const a=void 0,b=((a,b,c)=>[b=>a=b,a=>b=a,()=>[a,b,c]])(a,a,{x:1}),c={fn:b[2]},d={inner:c};b[0](d);b[1](c);return d})()',
					(obj) => {
						expect(obj).toBeObject();
						expect(obj).toContainAllKeys(['inner']);
						const innerObj = obj.inner;
						expect(innerObj).toBeObject();
						expect(innerObj).toContainAllKeys(['fn']);
						const {fn} = innerObj;
						expect(fn).toBeFunction();
						const arr = fn();
						expect(arr).toBeArrayOfSize(3);
						expect(arr[0]).toBe(obj);
						expect(arr[1]).toBe(innerObj);
						expect(arr[2]).toEqual({x: 1});
					}
				);
			});
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

			it('also referencing external scope', () => {
				const ext = {extA: 1};
				run(
					({vv: {vvv: {v}, ww: [w, [x], ...y]}, ...z}) => [ext, v, w, x, y, z],
					'(f=>({vv:{vvv:{v:a},ww:[b,[c],...d]},...e})=>[f,a,b,c,d,e])({extA:1})',
					(fn) => {
						expect(fn).toBeFunction();
						const res = fn({vv: {vvv: {v: 1}, ww: [2, [3], 4, 5, 6]}, e: 7, f: 8});
						expect(res).toEqual([{extA: 1}, 1, 2, 3, [4, 5, 6], {e: 7, f: 8}]);
					}
				);
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

		it('also referencing external scope', () => {
			const ext = {extA: 1};
			run(
				(x, y, ...z) => [ext, x, y, z],
				'(d=>(a,b,...c)=>[d,a,b,c])({extA:1})',
				(fn) => {
					expect(fn).toBeFunction();
					const res = fn(1, 2, 3, 4, 5);
					expect(res).toEqual([{extA: 1}, 1, 2, [3, 4, 5]]);
				}
			);
		});
	});

	describe('referencing error argument of `catch ()`', () => {
		it('1 level up', () => {
			let input;
			try {
				throw 123; // eslint-disable-line no-throw-literal
			} catch (err) {
				const extA = 456;
				input = (0, (x, y) => [x, y, extA, err]);
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
				input = (0, x => y => [x, y, extA, err]);
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
			const out = run(input, 'function x(){return x}');

			expect(out()).toBe(out);
		});

		it('upper function', () => {
			const input = function x() {
				return () => x;
			};
			const out = run(input, 'function x(){return()=>x}');

			expect(out()()).toBe(out);
		});

		describe('with name', () => {
			describe('changed', () => {
				it('simple case', () => {
					function input() { return input; }
					Object.defineProperty(input, 'name', {value: 'newName'});
					run(
						input,
						'function newName(){return newName}',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('newName');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
							expect(fn()).toBe(fn);
						}
					);
				});

				it('with clashing external var', () => {
					const ext = 1;
					function input() { return [input, ext]; }
					Object.defineProperty(input, 'name', {value: 'ext'});
					run(
						input,
						'(a=>function ext(){return[ext,a]})(1)',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('ext');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							expect(res[0]).toBe(fn);
							expect(res[1]).toBe(1);
						}
					);
				});

				it('with clashing internal var', () => {
					function input() {
						const int = 1;
						return [input, int];
					}
					Object.defineProperty(input, 'name', {value: 'int'});
					run(
						input,
						'function int(){const a=1;return[int,a]}',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('int');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							expect(res[0]).toBe(fn);
							expect(res[1]).toBe(1);
						}
					);
				});

				it('with clashing global var', () => {
					function input() {
						return [input, console];
					}
					Object.defineProperty(input, 'name', {value: 'console'});
					run(
						input,
						'Object.defineProperties(function a(){return[a,console]},{name:{value:"console"}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('console');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							expect(res[0]).toBe(fn);
							expect(res[1]).toBe(console);
						}
					);
				});

				it('with clashing function name', () => {
					function input() {
						function int() { return 2; }
						return [input, int];
					}
					Object.defineProperty(input, 'name', {value: 'int'});
					run(
						input,
						'Object.defineProperties(function a(){function int(){return 2}return[a,int]},{name:{value:"int"}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('int');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							expect(res[0]).toBe(fn);
							const fn2 = res[1];
							expect(fn2).toBeFunction();
							expect(fn2.name).toBe('int');
							expect(fn2()).toBe(2);
						}
					);
				});

				it('to an invalid identifier', () => {
					function input() { return input; }
					Object.defineProperty(input, 'name', {value: 'new-name'});
					run(
						input,
						'Object.defineProperties(function a(){return a},{name:{value:"new-name"}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('new-name');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
							expect(fn()).toBe(fn);
						}
					);
				});

				it('to a non-string', () => {
					function input() { return input; }
					Object.defineProperty(input, 'name', {value: {x: 1}});
					run(
						input,
						'Object.defineProperties(function a(){return a},{name:{value:{x:1}}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn.name).toEqual({x: 1});
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
							expect(fn()).toBe(fn);
						}
					);
				});
			});

			it('deleted', () => {
				function input() { return input; }
				delete input.name;
				run(
					input,
					'(()=>{const a=function a(){return a};delete a.name;return a})()',
					(fn) => {
						expect(fn).toBeFunction();
						expect(fn).not.toHaveOwnProperty('name');
						expect(fn.name).toBe('');
						expect(fn()).toBe(fn);
					}
				);
			});
		});
	});

	describe('bound functions', () => {
		describe('no circular references (no injection)', () => {
			it('single instantiation', () => {
				// eslint-disable-next-line no-invalid-this
				function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
				const ctx = {ctx: 1},
					extA = {extA: 2},
					extB = {extB: 3};
				run(
					fn.bind(ctx, extA, extB, 123),
					'function fn(a,b,c,d,e){return[this,a,b,c,d,e]}.bind({ctx:1},{extA:2},{extB:3},123)',
					(boundFn) => {
						expect(boundFn).toBeFunction();
						expect(boundFn.name).toBe('bound fn');
						expect(boundFn).toHaveLength(2);
						const param1 = {},
							param2 = 100;
						const res = boundFn(param1, param2);
						expect(res).toBeArrayOfSize(6);
						expect(res[0]).toEqual(ctx);
						expect(res[1]).toEqual(extA);
						expect(res[2]).toEqual(extB);
						expect(res[3]).toBe(123);
						expect(res[4]).toBe(param1);
						expect(res[5]).toBe(param2);
					}
				);
			});

			it('multiple instantiations', () => {
				// eslint-disable-next-line no-invalid-this
				function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
				const ctx = {ctx: 1},
					extA = {extA: 2};
				const extBs = [{extB1: 11}, {extB2: 12}, {extB3: 13}];
				run(
					extBs.map(extB => fn.bind(ctx, extA, extB, 123)),
					null,
					(out) => {
						expect(out).toBeArrayOfSize(3);
						expect(out[0]).not.toBe(out[1]);
						expect(out[0]).not.toBe(out[2]);
						expect(out[1]).not.toBe(out[2]);

						const ctxExtAs = out.map((boundFn, index) => {
							expect(boundFn).toBeFunction();
							expect(boundFn.name).toBe('bound fn');
							expect(boundFn).toHaveLength(2);
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
					}
				);
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
					run(input, null, (out) => {
						expect(out).toBeObject();
						expect(out).toContainAllKeys(['obj']);
						const {obj} = out;
						expect(obj).toBeObject();
						expect(obj).toContainAllKeys(['fn']);
						const boundFn = obj.fn;
						expect(boundFn).toBeFunction();
						expect(boundFn.name).toBe('bound fn');
						expect(boundFn).toHaveLength(2);
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
					run(input, null, (out) => {
						expect(out).toBeArrayOfSize(3);
						expect(out[0]).not.toBe(out[1]);
						expect(out[0]).not.toBe(out[2]);
						expect(out[1]).not.toBe(out[2]);

						const extAs = out.map((obj, index) => {
							expect(obj).toBeObject();
							expect(obj).toContainAllKeys(['fn']);
							const boundFn = obj.fn;
							expect(boundFn).toBeFunction();
							expect(boundFn.name).toBe('bound fn');
							expect(boundFn).toHaveLength(2);
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
			});

			it('function', () => {
				function fn() { return this; } // eslint-disable-line no-invalid-this
				run(
					{
						fn,
						boundFn: fn.bind(fn)
					},
					null,
					(out) => {
						expect(out).toBeObject();
						expect(out).toContainAllKeys(['fn', 'boundFn']);
						const {boundFn} = out;
						expect(boundFn).toBeFunction();
						expect(boundFn.name).toBe('bound fn');
						expect(boundFn).toHaveLength(0);
						expect(boundFn()).toBe(out.fn);
					}
				);
			});
		});
	});

	describe('generators + async functions', () => {
		it('generator function', () => {
			const extA = {extA: 1},
				extB = {extB: 2};
			function* input(x, y) {
				yield [extA, extB];
				return [this, x, y]; // eslint-disable-line no-invalid-this
			}
			const out = run(
				input, '((c,d)=>function*input(a,b){yield[c,d];return[this,a,b]})({extA:1},{extB:2})'
			);

			expect(out).toBeFunction();
			const ctx = {},
				param1 = {},
				param2 = {};
			const iterator = out.call(ctx, param1, param2);
			const res1 = iterator.next();
			expect(res1).toEqual({value: [{extA: 1}, {extB: 2}], done: false});
			const res2 = iterator.next();
			expect(res2).toEqual({value: [{}, {}, {}], done: true});
			expect(res2.value[0]).toBe(ctx);
			expect(res2.value[1]).toBe(param1);
			expect(res2.value[2]).toBe(param2);
		});

		it('async function', async () => {
			const extA = {extA: 1},
				extB = {extB: 2};
			async function input(x, y) {
				await Promise.resolve();
				return [extA, extB, this, x, y]; // eslint-disable-line no-invalid-this
			}
			const out = run(
				input,
				'((c,d)=>async function input(a,b){await Promise.resolve();return[c,d,this,a,b]})({extA:1},{extB:2})'
			);

			expect(out).toBeFunction();
			const ctx = {},
				param1 = {},
				param2 = {};
			const res = await out.call(ctx, param1, param2);
			expect(res).toEqual([{extA: 1}, {extB: 2}, {}, {}, {}]);
			expect(res[2]).toBe(ctx);
			expect(res[3]).toBe(param1);
			expect(res[4]).toBe(param2);
		});

		it('async generator function', async () => {
			const extA = {extA: 1},
				extB = {extB: 2};
			async function* input(x, y) {
				await Promise.resolve();
				yield [extA, extB];
				return [this, x, y]; // eslint-disable-line no-invalid-this
			}
			const out = run(
				input,
				'((c,d)=>async function*input(a,b){await Promise.resolve();yield[c,d];return[this,a,b]})({extA:1},{extB:2})'
			);

			expect(out).toBeFunction();
			const ctx = {},
				param1 = {},
				param2 = {};
			const iterator = out.call(ctx, param1, param2);
			const res1 = await iterator.next();
			expect(res1).toEqual({value: [{extA: 1}, {extB: 2}], done: false});
			const res2 = await iterator.next();
			expect(res2).toEqual({value: [{}, {}, {}], done: true});
			expect(res2.value[0]).toBe(ctx);
			expect(res2.value[1]).toBe(param1);
			expect(res2.value[2]).toBe(param2);
		});
	});

	if (minify && inline) {
		describe('avoid var name clashes', () => {
			it('with globals', () => {
				if (mangle) {
					const input = (0, (x, y) => [a, x, y]); // eslint-disable-line no-undef
					expect(stripSourceMapComment(serialize(input))).toBe('(b,c)=>[a,b,c]');
				} else {
					const fn = (0, (x, y) => [a, x, y]); // eslint-disable-line no-undef
					const input = {a: fn, b: fn};
					expect(stripSourceMapComment(serialize(input)))
						.toBe('(()=>{const a$0=(0,(x,y)=>[a,x,y]);return{a:a$0,b:a$0}})()');
				}
			});

			if (mangle) {
				it('with function names', () => {
					const input = (0, (x, y) => function a() { return [x, y]; });
					expect(stripSourceMapComment(serialize(input))).toBe('(b,c)=>function a(){return[b,c]}');
				});
			}

			it('with function names added by livepack', () => {
				let a = function() { return a; };
				const input = a;
				a = 123;
				expect(stripSourceMapComment(serialize(input))).toBe(
					mangle
						? '(b=>function a(){return b})(123)'
						: '(a$0=>function a(){return a$0})(123)'
				);
			});

			it('with globals with function names added by livepack', () => {
				// eslint-disable-next-line object-shorthand
				const input = {console: function() { return console; }}.console;
				expect(stripSourceMapComment(serialize(input)))
					.toBe('Object.defineProperties(function(){return console},{name:{value:"console"}})');
			});
		});
	}

	describe('do not treat labels as variables', () => {
		it('in labels', () => {
			// Test `console` is not misinterpretted as referring to external var
			let input;
			// eslint-disable-next-line no-labels, no-label-var, no-unused-labels
			console: input = (0, () => console);
			const out = run(input, '()=>console');

			expect(out()).toBe(console);
		});

		it('in continue statements', () => {
			// Test `x` in `continue` statement is not misinterpretted as referring to external var `x`
			const x = {}; // eslint-disable-line no-unused-vars
			run(
				() => {
					x: for (let i = 0; i < 3; i++) { // eslint-disable-line no-labels, no-label-var
						continue x; // eslint-disable-line no-labels, no-extra-label
					}
				},
				'()=>{x:for(let a=0;a<3;a++){continue x}}',
				fn => expect(fn()).toBeUndefined()
			);
		});

		it('in break statements', () => {
			// Test `x` in `break` statement is not misinterpretted as referring to external var `x`
			const x = {}; // eslint-disable-line no-unused-vars
			run(
				() => {
					x: for (let i = 0; i < 3; i++) { // eslint-disable-line no-labels, no-label-var
						break x; // eslint-disable-line no-labels, no-extra-label
					}
				},
				'()=>{x:for(let a=0;a<3;a++){break x}}',
				fn => expect(fn()).toBeUndefined()
			);
		});
	});

	it('distinguish scopes and functions with same block IDs from different files', () => {
		const input = require('./fixtures/function blocks/index.js'); // eslint-disable-line global-require
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

	describe('maintain name where', () => {
		it('unnamed function as object property', () => {
			run(
				{a: (0, function() {})},
				'{a:(0,function(){})}',
				(obj) => {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['a']);
					const fn = obj.a;
					expect(fn).toBeFunction();
					expect(fn.name).toBe('');
				}
			);
		});

		it('not valid JS identifier', () => {
			run(
				{'0a': function() {}}['0a'],
				'Object.defineProperties(function(){},{name:{value:"0a"}})',
				(fn) => {
					expect(
						Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
					).toEqual(['length', 'name', 'prototype']);
					expect(fn.name).toBe('0a');
					expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
				}
			);
		});

		describe('descriptor altered', () => {
			it('value altered', () => {
				function input() {}
				Object.defineProperty(input, 'name', {value: 'foo'});
				run(
					input,
					'function foo(){}',
					(fn) => {
						expect(fn.name).toBe('foo');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
					}
				);
			});

			it('getter', () => {
				function input() {}
				// eslint-disable-next-line object-shorthand
				Object.defineProperty(input, 'name', {get: function() { return 'foo'; }});
				run(
					input,
					'Object.defineProperties(function(){},{name:{get:function get(){return"foo"}}})',
					(fn) => {
						expect(fn.name).toBe('foo');
						expect(Object.getOwnPropertyDescriptor(fn, 'name')).toEqual({
							get: expect.any(Function), set: undefined, enumerable: false, configurable: true
						});
					}
				);
			});

			describe('properties altered', () => {
				it.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
				)(
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => {
						function input() {}
						Object.defineProperty(input, 'name', {value: 'input', writable, enumerable, configurable});

						run(input, null, (fn) => {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('input');
							expect(fn).toHaveDescriptorModifiersFor('name', writable, enumerable, configurable);
						});
					}
				);
			});
		});

		it('deleted', () => {
			function input() {}
			delete input.name;
			run(
				input,
				'(()=>{const a=(0,function(){});delete a.name;return a})()',
				(fn) => {
					expect(fn.name).toBe('');
					expect(fn).not.toHaveOwnProperty('name');
				}
			);
		});

		it('deleted and redefined (i.e. property order changed)', () => {
			function input() {}
			delete input.name;
			Object.defineProperty(input, 'name', {value: 'input', configurable: true});
			run(
				input,
				'(()=>{const a=function input(){};delete a.name;Object.defineProperties(a,{name:{value:"input",configurable:true}});return a})()',
				(fn) => {
					expect(
						Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
					).toEqual(['length', 'prototype', 'name']);
					expect(fn.name).toBe('input');
					expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
				}
			);
		});
	});

	describe('maintain length where', () => {
		it('altered', () => {
			function input() {}
			Object.defineProperty(input, 'length', {value: 2});
			run(
				input,
				'Object.defineProperties(function input(){},{length:{value:2}})',
				(fn) => {
					expect(
						Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
					).toEqual(['length', 'name', 'prototype']);
					expect(fn.length).toBe(2); // eslint-disable-line jest/prefer-to-have-length
					expect(fn).toHaveDescriptorModifiersFor('length', false, false, true);
				}
			);
		});

		describe('descriptor altered', () => {
			it('getter', () => {
				function input() {}
				// eslint-disable-next-line object-shorthand
				Object.defineProperty(input, 'length', {get: function() { return 2; }});
				run(
					input,
					'Object.defineProperties(function input(){},{length:{get:function get(){return 2}}})',
					(fn) => {
						expect(fn.length).toBe(2); // eslint-disable-line jest/prefer-to-have-length
						expect(Object.getOwnPropertyDescriptor(fn, 'length')).toEqual({
							get: expect.any(Function), set: undefined, enumerable: false, configurable: true
						});
					}
				);
			});

			describe('properties altered', () => {
				it.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
				)(
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => {
						function input() {}
						Object.defineProperty(input, 'length', {value: 0, writable, enumerable, configurable});

						run(input, null, (fn) => {
							expect(fn).toBeFunction();
							expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
							expect(fn).toHaveDescriptorModifiersFor('length', writable, enumerable, configurable);
						});
					}
				);
			});
		});

		it('deleted', () => {
			function input() {}
			delete input.length;
			run(
				input,
				'(()=>{const a=function input(){};delete a.length;return a})()',
				(fn) => {
					expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
					expect(fn).not.toHaveOwnProperty('length');
				}
			);
		});

		it('deleted and redefined (i.e. property order changed)', () => {
			function input() {}
			delete input.length;
			Object.defineProperty(input, 'length', {value: 0, configurable: true});
			run(
				input,
				'(()=>{const a=function input(){};delete a.length;Object.defineProperties(a,{length:{value:0,configurable:true}});return a})()',
				(fn) => {
					expect(
						Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
					).toEqual(['name', 'prototype', 'length']);
					expect(fn.name).toBe('input');
					expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
				}
			);
		});
	});

	describe('with extra properties', () => {
		describe('non-circular', () => {
			describe('string keys', () => {
				it('without descriptors', () => {
					const input = function() {};
					input.x = 1;
					input.y = 2;
					run(input, 'Object.assign(function input(){},{x:1,y:2})', (fn) => {
						expect(fn).toBeFunction();
						expect(fn.x).toBe(1);
						expect(fn.y).toBe(2);
					});
				});

				it('with descriptors', () => {
					const input = function() {};
					Object.defineProperty(input, 'x', {value: 1, enumerable: true});
					Object.defineProperty(input, 'y', {value: 2, writable: true, configurable: true});
					run(
						input,
						'Object.defineProperties(function input(){},{x:{value:1,enumerable:true},y:{value:2,writable:true,configurable:true}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(
								Object.getOwnPropertyNames(fn)
									.filter(n => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(n))
							).toEqual(['x', 'y']);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('y', true, false, true);
						}
					);
				});

				it('with getter', () => {
					const input = function() {};
					Object.defineProperty(input, 'x', {value: 1, enumerable: true});
					Object.defineProperty(input, 'y', {get: (0, () => 2)});
					run(
						input,
						'Object.defineProperties(function input(){},{x:{value:1,enumerable:true},y:{get:(0,()=>2)}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(
								Object.getOwnPropertyNames(fn)
									.filter(n => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(n))
							).toEqual(['x', 'y']);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(Object.getOwnPropertyDescriptor(fn, 'y').get).toBeFunction();
							expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('y', undefined, false, false);
						}
					);
				});
			});

			describe('integer keys', () => {
				it('without descriptors', () => {
					// 4294967294 is max integer key - integers above max are not moved to first position
					const input = function x() {};
					input.a = 1;
					input[0] = 2;
					input[5] = 3;
					input[4294967294] = 4;
					input[4294967295] = 5;
					run(
						input,
						'Object.assign(function x(){},{0:2,5:3,4294967294:4,a:1,4294967295:5})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(Object.getOwnPropertyNames(fn).filter(k => !['arguments', 'caller'].includes(k)))
								.toEqual(['0', '5', '4294967294', 'length', 'name', 'prototype', 'a', '4294967295']);
							expect(fn.a).toBe(1);
							expect(fn[0]).toBe(2);
							expect(fn[5]).toBe(3);
							expect(fn[4294967294]).toBe(4);
							expect(fn[4294967295]).toBe(5);
						}
					);
				});

				it('with descriptors', () => {
					const input = function() {};
					input.a = 1;
					Object.defineProperty(input, 0, {value: 2, enumerable: true});
					Object.defineProperty(input, 5, {value: 3, writable: true, configurable: true});
					Object.defineProperty(input, 4294967294, {value: 4, enumerable: true});
					Object.defineProperty(input, 4294967295, {value: 5, writable: true, configurable: true});
					run(
						input,
						stripLineBreaks(`
							Object.defineProperties(
								function input(){},
								{
									0:{value:2,enumerable:true},
									5:{value:3,writable:true,configurable:true},
									4294967294:{value:4,enumerable:true},
									a:{value:1,writable:true,enumerable:true,configurable:true},
									4294967295:{value:5,writable:true,configurable:true}
								}
							)
						`),
						(fn) => {
							expect(fn).toBeFunction();
							expect(Object.getOwnPropertyNames(fn).filter(k => !['arguments', 'caller'].includes(k)))
								.toEqual(['0', '5', '4294967294', 'length', 'name', 'prototype', 'a', '4294967295']);
							expect(fn.a).toBe(1);
							expect(fn[0]).toBe(2);
							expect(fn[5]).toBe(3);
							expect(fn[4294967294]).toBe(4);
							expect(fn[4294967295]).toBe(5);
							expect(fn).toHaveDescriptorModifiersFor('a', true, true, true);
							expect(fn).toHaveDescriptorModifiersFor(0, false, true, false);
							expect(fn).toHaveDescriptorModifiersFor(5, true, false, true);
							expect(fn).toHaveDescriptorModifiersFor(4294967294, false, true, false);
							expect(fn).toHaveDescriptorModifiersFor(4294967295, true, false, true);
						}
					);
				});

				it('with getter', () => {
					const input = function() {};
					Object.defineProperty(input, 0, {value: 1, enumerable: true});
					Object.defineProperty(input, 5, {get: (0, () => 2)});
					run(
						input,
						'Object.defineProperties(function input(){},{0:{value:1,enumerable:true},5:{get:(0,()=>2)}})',
						(fn) => {
							expect(fn).toBeFunction();
							expect(
								Object.getOwnPropertyNames(fn)
									.filter(n => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(n))
							).toEqual(['0', '5']);
							expect(fn[0]).toBe(1);
							expect(fn[5]).toBe(2);
							expect(Object.getOwnPropertyDescriptor(fn, 5).get).toBeFunction();
							expect(fn).toHaveDescriptorModifiersFor(0, false, true, false);
							expect(fn).toHaveDescriptorModifiersFor(5, undefined, false, false);
						}
					);
				});
			});
		});

		describe('circular references', () => {
			describe('string keys', () => {
				it('without descriptors', () => {
					const input = function() {};
					input.x = input;
					input.y = input;
					run(input, '(()=>{const a=function input(){};a.x=a;a.y=a;return a})()', (fn) => {
						expect(fn).toBeFunction();
						expect(fn.x).toBe(fn);
						expect(fn.y).toBe(fn);
					});
				});

				it('with descriptors', () => {
					const input = function() {};
					Object.defineProperty(input, 'x', {value: input, enumerable: true});
					Object.defineProperty(input, 'y', {value: input, writable: true, configurable: true});
					run(input, null, (fn) => {
						expect(fn).toBeFunction();
						expect(
							Object.getOwnPropertyNames(fn)
								.filter(n => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(n))
						).toEqual(['x', 'y']);
						expect(fn.x).toBe(fn);
						expect(fn.y).toBe(fn);
						expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(fn).toHaveDescriptorModifiersFor('y', true, false, true);
					});
				});

				it('with getter', () => {
					const input = function() { return 2; };
					Object.defineProperty(input, 'x', {value: 1, enumerable: true});
					Object.defineProperty(input, 'y', {get: input});
					run(
						input,
						'(()=>{const a=Object.defineProperties,b=a(function input(){return 2},{x:{value:1,enumerable:true}});a(b,{y:{get:b}});return b})()',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual(2);
							expect(
								Object.getOwnPropertyNames(fn)
									.filter(n => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(n))
							).toEqual(['x', 'y']);
							expect(fn.x).toBe(1);
							expect(fn.y).toBe(2);
							expect(Object.getOwnPropertyDescriptor(fn, 'y').get).toBeFunction();
							expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
							expect(fn).toHaveDescriptorModifiersFor('y', undefined, false, false);
						}
					);
				});
			});

			describe('integer keys', () => {
				it('without descriptors', () => {
					const input = function() {};
					input[0] = input;
					input[5] = input;
					run(input, '(()=>{const a=function input(){};a[0]=a;a[5]=a;return a})()', (fn) => {
						expect(fn).toBeFunction();
						expect(fn[0]).toBe(fn);
						expect(fn[5]).toBe(fn);
					});
				});

				it('with descriptors', () => {
					const input = function() {};
					Object.defineProperty(input, 0, {value: input, enumerable: true});
					Object.defineProperty(input, 5, {value: input, writable: true, configurable: true});
					run(input, null, (fn) => {
						expect(fn).toBeFunction();
						expect(
							Object.getOwnPropertyNames(fn)
								.filter(n => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(n))
						).toEqual(['0', '5']);
						expect(fn[0]).toBe(fn);
						expect(fn[5]).toBe(fn);
						expect(fn).toHaveDescriptorModifiersFor(0, false, true, false);
						expect(fn).toHaveDescriptorModifiersFor(5, true, false, true);
					});
				});

				it('with getter', () => {
					const input = function() { return 2; };
					Object.defineProperty(input, 0, {value: 1, enumerable: true});
					Object.defineProperty(input, 5, {get: input});
					run(
						input,
						'(()=>{const a=Object.defineProperties,b=a(function input(){return 2},{0:{value:1,enumerable:true}});a(b,{5:{get:b}});return b})()',
						(fn) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual(2);
							expect(
								Object.getOwnPropertyNames(fn)
									.filter(n => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(n))
							).toEqual(['0', '5']);
							expect(fn[0]).toBe(1);
							expect(fn[5]).toBe(2);
							expect(Object.getOwnPropertyDescriptor(fn, 5).get).toBeFunction();
							expect(fn).toHaveDescriptorModifiersFor(0, false, true, false);
							expect(fn).toHaveDescriptorModifiersFor(5, undefined, false, false);
						}
					);
				});
			});
		});
	});

	describe('inheritance', () => {
		it('no extra props', () => {
			const input = function F() {};
			Object.setPrototypeOf(input, function E() {}); // eslint-disable-line prefer-arrow-callback

			run(
				input,
				'Object.setPrototypeOf(function F(){},function E(){})',
				(fn) => {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
					const proto = Object.getPrototypeOf(fn);
					expect(proto).toBeFunction();
					expect(proto.name).toBe('E');
				}
			);
		});

		it('with extra props', () => {
			const input = function F() {};
			input.x = 1;
			input.y = 2;
			Object.setPrototypeOf(input, function E() {}); // eslint-disable-line prefer-arrow-callback

			run(
				input,
				'(()=>{const a=Object;return a.setPrototypeOf(a.assign(function F(){},{x:1,y:2}),function E(){})})()',
				(fn) => {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
					const proto = Object.getPrototypeOf(fn);
					expect(proto).toBeFunction();
					expect(proto.name).toBe('E');
					expect(fn.x).toBe(1);
					expect(fn.y).toBe(2);
				}
			);
		});

		it('with extra descriptor props', () => {
			const input = function F() {};
			Object.defineProperty(input, 'x', {value: 1, enumerable: true});
			Object.defineProperty(input, 'y', {value: 2, writable: true, enumerable: true});
			Object.setPrototypeOf(input, function E() {}); // eslint-disable-line prefer-arrow-callback

			run(
				input,
				'(()=>{const a=Object;return a.setPrototypeOf(a.defineProperties(function F(){},{x:{value:1,enumerable:true},y:{value:2,writable:true,enumerable:true}}),function E(){})})()',
				(fn) => {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
					const proto = Object.getPrototypeOf(fn);
					expect(proto).toBeFunction();
					expect(proto.name).toBe('E');
					expect(fn.x).toBe(1);
					expect(fn.y).toBe(2);
					expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
					expect(fn).toHaveDescriptorModifiersFor('y', true, true, false);
				}
			);
		});

		it('with prototype which itself inherits from another prototype', () => {
			const input = function F() {};
			function E() {}
			Object.setPrototypeOf(input, E);
			Object.setPrototypeOf(E, function D() {}); // eslint-disable-line prefer-arrow-callback

			run(
				input,
				'(()=>{const a=Object.setPrototypeOf;return a(function F(){},a(function E(){},function D(){}))})()',
				(fn) => {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('F');
					const proto = Object.getPrototypeOf(fn);
					expect(proto).toBeFunction();
					expect(proto.name).toBe('E');
					const proto2 = Object.getPrototypeOf(proto);
					expect(proto2).toBeFunction();
					expect(proto2.name).toBe('D');
				}
			);
		});
	});
});
