/* --------------------
 * livepack module
 * Tests for functions
 * ------------------*/

'use strict';

// Imports
const {itSerializes, stripSourceMapComment} = require('./support/index.js');

// Tests

describe('Functions', () => {
	describe('without scope', () => {
		describe('single instantiation of function', () => {
			describe('arrow function', () => {
				itSerializes('anonymous', {
					in() {
						return (x, y) => [x, y];
					},
					out: '(a,b)=>[a,b]',
					validate(fn) {
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
				});

				itSerializes('named', {
					in() {
						const f = (x, y) => [x, y];
						return f;
					},
					out: 'Object.defineProperties((a,b)=>[a,b],{name:{value:"f"}})',
					validate(fn) {
						expect(fn).toBeFunction();
						const param1 = {},
							param2 = {};
						const res = fn(param1, param2);
						expect(res).toBeArrayOfSize(2);
						expect(res[0]).toBe(param1);
						expect(res[1]).toBe(param2);
						expect(fn.name).toBe('f');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
					}
				});

				itSerializes('returning object expression', {
					// Test for workaround for https://github.com/babel/babel/issues/12055
					in() {
						return () => ({});
					},
					out: '()=>({})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBeObject();
					}
				});
			});

			describe('function expression', () => {
				itSerializes('anonymous', {
					in() {
						return function(x, y) {
							return [x, y, this]; // eslint-disable-line no-invalid-this
						};
					},
					out: 'function(a,b){return[a,b,this]}',
					validate(fn) {
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
				});

				itSerializes('named', {
					in() {
						return function f(x, y) {
							return [x, y, this]; // eslint-disable-line no-invalid-this
						};
					},
					out: 'function f(a,b){return[a,b,this]}',
					validate(fn) {
						expect(fn).toBeFunction();
						const param1 = {},
							param2 = {},
							ctx = {};
						const res = fn.call(ctx, param1, param2);
						expect(res).toBeArrayOfSize(3);
						expect(res[0]).toBe(param1);
						expect(res[1]).toBe(param2);
						expect(res[2]).toBe(ctx);
						expect(fn.name).toBe('f');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
					}
				});
			});

			itSerializes('function declaration', {
				in() {
					function f(x, y) {
						return [x, y, this]; // eslint-disable-line no-invalid-this
					}
					return f;
				},
				out: 'function f(a,b){return[a,b,this]}',
				validate(fn) {
					expect(fn).toBeFunction();
					const param1 = {},
						param2 = {},
						ctx = {};
					const res = fn.call(ctx, param1, param2);
					expect(res).toBeArrayOfSize(3);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(ctx);
					expect(fn.name).toBe('f');
					expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
				}
			});

			itSerializes('with default params', {
				in() {
					return (x = {defaultA: 1}, y = {defaultB: 2}) => [x, y];
				},
				out: '(a={defaultA:1},b={defaultB:2})=>[a,b]',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual([{defaultA: 1}, {defaultB: 2}]);
				}
			});
		});

		describe('multiple instantiations of function', () => {
			itSerializes('without default params', {
				in() {
					return [1, 2, 3].map(() => (
						function(x, y) {
							return [x, y, this]; // eslint-disable-line no-invalid-this
						}
					));
				},
				out: '(()=>{const a=()=>function(a,b){return[a,b,this]};return[a(),a(),a()]})()',
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					expect(arr[0]).not.toBe(arr[1]);
					expect(arr[0]).not.toBe(arr[2]);
					expect(arr[1]).not.toBe(arr[2]);

					for (const fn of arr) {
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
				}
			});

			itSerializes('with default params', {
				in() {
					return [1, 2, 3].map(() => (
						function(x = {defaultA: 1}, y = {defaultB: 2}) {
							return [x, y, this]; // eslint-disable-line no-invalid-this
						}
					));
				},
				out: '(()=>{const a=()=>function(a={defaultA:1},b={defaultB:2}){return[a,b,this]};return[a(),a(),a()]})()',
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					expect(arr[0]).not.toBe(arr[1]);
					expect(arr[0]).not.toBe(arr[2]);
					expect(arr[1]).not.toBe(arr[2]);

					for (const fn of arr) {
						expect(fn).toBeFunction();
						const ctx = {};
						const res = fn.call(ctx);
						expect(res).toBeArrayOfSize(3);
						expect(res[0]).toEqual({defaultA: 1});
						expect(res[1]).toEqual({defaultB: 2});
						expect(res[2]).toBe(ctx);
					}
				}
			});
		});
	});

	describe('with external scope', () => {
		describe('single instantiation of function', () => {
			itSerializes('arrow function', {
				in() {
					const extA = {extA: 1},
						extB = {extB: 2};
					return (x, y) => [x, y, extA, extB];
				},
				out: '((c,d)=>(a,b)=>[a,b,c,d])({extA:1},{extB:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					const param1 = {},
						param2 = {};
					const res = fn(param1, param2);
					expect(res).toBeArrayOfSize(4);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toEqual({extA: 1});
					expect(res[3]).toEqual({extB: 2});
				}
			});

			itSerializes('function expression', {
				in() {
					const extA = {extA: 1},
						extB = {extB: 2};
					return function(x, y) {
						return [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
					};
				},
				out: '((c,d)=>function(a,b){return[a,b,this,c,d]})({extA:1},{extB:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					const param1 = {},
						param2 = {},
						ctx = {};
					const res = fn.call(ctx, param1, param2);
					expect(res).toBeArrayOfSize(5);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(ctx);
					expect(res[3]).toEqual({extA: 1});
					expect(res[4]).toEqual({extB: 2});
				}
			});

			itSerializes('function declaration', {
				in() {
					const extA = {extA: 1},
						extB = {extB: 2};
					function f(x, y) {
						return [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
					}
					return f;
				},
				out: '((c,d)=>function f(a,b){return[a,b,this,c,d]})({extA:1},{extB:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					const param1 = {},
						param2 = {},
						ctx = {};
					const res = fn.call(ctx, param1, param2);
					expect(res).toBeArrayOfSize(5);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(ctx);
					expect(res[3]).toEqual({extA: 1});
					expect(res[4]).toEqual({extB: 2});
				}
			});

			itSerializes('with destructured vars', {
				in() {
					const {a: extA} = {a: {extA: 1}},
						{...extB} = {extB: 2};
					return (x, y) => [x, y, extA, extB];
				},
				out: '((c,d)=>(a,b)=>[a,b,c,d])({extA:1},{extB:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					const param1 = {},
						param2 = {};
					const res = fn(param1, param2);
					expect(res).toBeArrayOfSize(4);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toEqual({extA: 1});
					expect(res[3]).toEqual({extB: 2});
				}
			});

			describe('with default params', () => {
				itSerializes('referencing external vars', {
					in() {
						const extA = {extA: 1},
							extB = {extB: 2};
						return (x = extA, y = extB) => [x, y];
					},
					out: '((c,d)=>(a=c,b=d)=>[a,b])({extA:1},{extB:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{extA: 1}, {extB: 2}]);
					}
				});

				itSerializes('referencing external vars embedded in objects', {
					in() {
						const extA = {extA: 1},
							extB = {extB: 2};
						return (x = {nestedA: extA}, y = {nestedB: extB}) => [x, y];
					},
					out: '((c,d)=>(a={nestedA:c},b={nestedB:d})=>[a,b])({extA:1},{extB:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{nestedA: {extA: 1}}, {nestedB: {extB: 2}}]);
					}
				});
			});
		});

		describe('multiple instantiations of function', () => {
			itSerializes('without default params', {
				in() {
					const extA = {extA: 1},
						extB = {extB: 2};
					return [1, 2, 3].map(() => (
						function(x, y) {
							return [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
						}
					));
				},
				out: `(()=>{
					const a=((c,d)=>()=>function(a,b){return[a,b,this,c,d]})({extA:1},{extB:2});
					return[a(),a(),a()]
				})()`,
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					expect(arr[0]).not.toBe(arr[1]);
					expect(arr[0]).not.toBe(arr[2]);
					expect(arr[1]).not.toBe(arr[2]);

					const resABs = arr.map((fn) => {
						expect(fn).toBeFunction();
						const param1 = {},
							param2 = {},
							ctx = {};
						const res = fn.call(ctx, param1, param2);
						expect(res).toBeArrayOfSize(5);
						expect(res[0]).toBe(param1);
						expect(res[1]).toBe(param2);
						expect(res[2]).toBe(ctx);
						expect(res[3]).toEqual({extA: 1});
						expect(res[4]).toEqual({extB: 2});
						return [res[3], res[4]];
					});

					const resAs = resABs.map(resAB => resAB[0]);
					expect(resAs[0]).toBe(resAs[1]);
					expect(resAs[0]).toBe(resAs[2]);

					const resBs = resABs.map(resAB => resAB[1]);
					expect(resBs[0]).toBe(resBs[1]);
					expect(resBs[0]).toBe(resBs[2]);
				}
			});

			describe('with default params', () => {
				itSerializes('referencing external vars', {
					in() {
						const extA = {extA: 1},
							extB = {extB: 2};
						return [1, 2, 3].map(() => (
							(x = extA, y = extB) => [x, y]
						));
					},
					out: `(()=>{
						const a=((c,d)=>()=>(a=c,b=d)=>[a,b])({extA:1},{extB:2});
						return[a(),a(),a()]
					})()`,
					validate(arr) {
						expect(arr).toBeArrayOfSize(3);
						expect(arr[0]).not.toBe(arr[1]);
						expect(arr[0]).not.toBe(arr[2]);
						expect(arr[1]).not.toBe(arr[2]);

						const resABs = arr.map((fn) => {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							expect(res[0]).toEqual({extA: 1});
							expect(res[1]).toEqual({extB: 2});
							return {extA: res[0], extB: res[1]};
						});

						const resAs = resABs.map(resAB => resAB.extA);
						expect(resAs[0]).toBe(resAs[1]);
						expect(resAs[0]).toBe(resAs[2]);

						const resBs = resABs.map(resAB => resAB.extB);
						expect(resBs[0]).toBe(resBs[1]);
						expect(resBs[0]).toBe(resBs[2]);
					}
				});

				itSerializes('referencing external vars embedded in objects', {
					in() {
						const extA = {extA: 1},
							extB = {extB: 2};
						return [1, 2, 3].map(() => (
							(x = {nestedA: extA}, y = {nestedB: extB}) => [x, y]
						));
					},
					out: `(()=>{
						const a=(
							(c,d)=>()=>(a={nestedA:c},b={nestedB:d})=>[a,b]
						)({extA:1},{extB:2});
						return[a(),a(),a()]
					})()`,
					validate(arr) {
						expect(arr).toBeArrayOfSize(3);
						expect(arr[0]).not.toBe(arr[1]);
						expect(arr[0]).not.toBe(arr[2]);
						expect(arr[1]).not.toBe(arr[2]);

						const resABs = arr.map((fn) => {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							expect(res[0]).toEqual({nestedA: {extA: 1}});
							expect(res[1]).toEqual({nestedB: {extB: 2}});
							return {extA: res[0].nestedA, extB: res[1].nestedB};
						});

						const resAs = resABs.map(resAB => resAB.extA);
						expect(resAs[0]).toBe(resAs[1]);
						expect(resAs[0]).toBe(resAs[2]);

						const resBs = resABs.map(resAB => resAB.extB);
						expect(resBs[0]).toBe(resBs[1]);
						expect(resBs[0]).toBe(resBs[2]);
					}
				});
			});
		});
	});

	describe('with external scope 2 levels up', () => {
		itSerializes('single instantiation of function', {
			in() {
				const extA = {extA: 1},
					extB = {extB: 2};
				return function(x) {
					return y => [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
				};
			},
			out: '((c,d)=>function(a){return b=>[a,b,this,c,d]})({extA:1},{extB:2})',
			validate(fn1) {
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
				expect(res[3]).toEqual({extA: 1});
				expect(res[4]).toEqual({extB: 2});
			}
		});

		itSerializes('multiple instantiations of function', {
			in() {
				const extA = {extA: 1},
					extB = {extB: 2};
				return [1, 2, 3].map(() => (
					function(x) {
						return y => [x, y, this, extA, extB]; // eslint-disable-line no-invalid-this
					}
				));
			},
			out: `(()=>{
				const a=((c,d)=>()=>function(a){return b=>[a,b,this,c,d]})({extA:1},{extB:2});
				return[a(),a(),a()]
			})()`,
			validate(arr) {
				expect(arr).toBeArrayOfSize(3);
				expect(arr[0]).not.toBe(arr[1]);
				expect(arr[0]).not.toBe(arr[2]);
				expect(arr[1]).not.toBe(arr[2]);

				const resABs = arr.map((fn1) => {
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
					expect(res[3]).toEqual({extA: 1});
					expect(res[4]).toEqual({extB: 2});
					return [res[3], res[4]];
				});

				const resAs = resABs.map(resAB => resAB[0]);
				expect(resAs[0]).toBe(resAs[1]);
				expect(resAs[0]).toBe(resAs[2]);

				const resBs = resABs.map(resAB => resAB[1]);
				expect(resBs[0]).toBe(resBs[1]);
				expect(resBs[0]).toBe(resBs[2]);
			}
		});
	});

	describe('with vars from above scope', () => {
		itSerializes('single instantiation of scope', {
			in() {
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
				const [fn, inject] = outer(extB, extC);
				inject(extD);
				return fn;
			},
			out: '(g=>(c,d,e,f)=>function(a,b){return[a,b,this,g,c,d,e,f]})({extA:1})({extB:2},{extC:3},{extD:4},{extE:5})',
			validate(fn) {
				expect(fn).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = fn.call(ctx, param1, param2);
				expect(res).toEqual(
					[param1, param2, ctx, {extA: 1}, {extB: 2}, {extC: 3}, {extD: 4}, {extE: 5}]
				);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
			}
		});

		itSerializes('multiple instantiations of scope', {
			in({ctx}) {
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
				ctx.exts = exts;
				return exts.map(({extB, extC, extD}) => {
					const [fn, inject] = outer(extB, extC);
					inject(extD);
					return fn;
				});
			},
			out: `(()=>{
				const a=(g=>(c,d,e,f)=>function(a,b){return[a,b,this,g,c,d,e,f]})({extA:1});
				return[
					a({extB1:11},{extC1:12},{extD1:13},{extE:5}),
					a({extB2:21},{extC2:22},{extD2:23},{extE:5}),
					a({extB3:31},{extC3:32},{extD3:33},{extE:5})
				]
			})()`,
			validate(arr, {ctx: {exts}}) {
				expect(arr).toBeArrayOfSize(3);
				expect(arr[0]).not.toBe(arr[1]);
				expect(arr[0]).not.toBe(arr[2]);
				expect(arr[1]).not.toBe(arr[2]);

				const resAEs = arr.map((item, index) => {
					expect(item).toBeFunction();
					const param1 = {},
						param2 = {},
						ctx = {};
					const res = item.call(ctx, param1, param2);
					expect(res).toBeArrayOfSize(8);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(ctx);
					expect(res[3]).toEqual({extA: 1});
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
			}
		});
	});

	describe('with vars from above nested scopes', () => {
		itSerializes('single instantiation of scope', {
			in() {
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
				return outer(extB)(extC);
			},
			out: '(e=>d=>c=>function(a,b){return[a,b,this,e,d,c]})({extA:1})({extB:2})({extC:3})',
			validate(out) {
				expect(out).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = out.call(ctx, param1, param2);
				expect(res).toBeArrayOfSize(6);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(ctx);
				expect(res[3]).toEqual({extA: 1});
				expect(res[4]).toEqual({extB: 2});
				expect(res[5]).toEqual({extC: 3});
			}
		});

		itSerializes('multiple independent instantiations of scope', {
			in({ctx}) {
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
				ctx.exts = exts;
				return exts.map(({extB, extC}) => outer(extB)(extC));
			},
			out: `(()=>{
				const a=(e=>d=>c=>function(a,b){return[a,b,this,e,d,c]})({extA:1});
				return[
					a({extB1:11})({extC1:12}),
					a({extB2:21})({extC2:22}),
					a({extB3:31})({extC3:32})
				]
			})()`,
			validate(arr, {ctx: {exts}}) {
				expect(arr).toBeArrayOfSize(3);
				expect(arr[0]).not.toBe(arr[1]);
				expect(arr[0]).not.toBe(arr[2]);
				expect(arr[1]).not.toBe(arr[2]);

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
					expect(res[3]).toEqual({extA: 1});
					expect(res[3]).toEqual(exts[index].extB);
					expect(res[4]).toEqual(exts[index].extC);
				});

				expect(resAs[0]).toBe(resAs[1]);
				expect(resAs[0]).toBe(resAs[2]);
			}
		});

		itSerializes('multiple instantiations of scope with shared upper scope', {
			in({ctx}) {
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
				ctx.extCs = extCs;
				const inner = outer(extB);
				return extCs.map(extC => inner(extC));
			},
			out: `(()=>{
				const a=(e=>d=>c=>function(a,b){return[a,b,this,e,d,c]})({extA:1})({extB:2});
				return[a({extC1:12}),a({extC1:22}),a({extC1:32})]
			})()`,
			validate(arr, {ctx: {extCs}}) {
				expect(arr).toBeArrayOfSize(3);
				expect(arr[0]).not.toBe(arr[1]);
				expect(arr[0]).not.toBe(arr[2]);
				expect(arr[1]).not.toBe(arr[2]);

				const resABs = arr.map((item, index) => {
					expect(item).toBeFunction();
					const param1 = {},
						param2 = {},
						ctx = {};
					const res = item.call(ctx, param1, param2);
					expect(res).toBeArrayOfSize(6);
					expect(res[0]).toBe(param1);
					expect(res[1]).toBe(param2);
					expect(res[2]).toBe(ctx);
					expect(res[3]).toEqual({extA: 1});
					expect(res[4]).toEqual({extB: 2});
					expect(res[5]).toEqual(extCs[index]);
					return {extA: res[3], extB: res[4]};
				});

				const resAs = resABs.map(resAB => resAB.extA);
				expect(resAs[0]).toBe(resAs[1]);
				expect(resAs[0]).toBe(resAs[2]);

				const resBs = resABs.map(resAB => resAB.extB);
				expect(resBs[0]).toBe(resBs[1]);
				expect(resBs[0]).toBe(resBs[2]);
			}
		});
	});

	describe('with external scope vars undefined', () => {
		describe('all external scope vars undefined', () => {
			itSerializes('1 external var undefined', {
				in() {
					let ext;
					return () => ext;
				},
				out: '(a=>()=>a)()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBeUndefined();
				}
			});

			itSerializes('multiple external vars undefined', {
				in() {
					let extA, extB;
					return () => [extA, extB];
				},
				out: '((a,b)=>()=>[a,b])()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual([undefined, undefined]);
				}
			});
		});

		describe('some external scope vars undefined', () => {
			itSerializes('1 external var undefined', {
				in() {
					const extA = undefined,
						extB = 1;
					return () => [extA, extB];
				},
				out: '((a,b)=>()=>[a,b])(void 0,1)',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual([undefined, 1]);
				}
			});

			itSerializes('multiple external vars undefined', {
				in() {
					const extA = undefined,
						extB = undefined,
						extC = 1;
					return () => [extA, extB, extC];
				},
				out: '(()=>{const a=void 0;return((a,b,c)=>()=>[a,b,c])(a,a,1)})()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toEqual([undefined, undefined, 1]);
				}
			});
		});
	});

	describe('nested scopes instantiated out of order', () => {
		describe('2 levels of nesting', () => {
			describe('no scope shared between functions', () => {
				itSerializes('shallower scope encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							obj = {
								x: function x() {
									return {extA};
								},
								y: function y() {
									return {extB};
								}
							};
						}
						return obj;
					},
					out: `{
						x:(a=>function x(){return{extA:a}})({a:1}),
						y:(a=>function y(){return{extB:a}})({b:2})
					}`,
					validate({x, y}) {
						expect(x).toBeFunction();
						expect(x.name).toBe('x');
						expect(y).toBeFunction();
						expect(y.name).toBe('y');
						expect(x().extA).toEqual({a: 1});
						expect(y().extB).toEqual({b: 2});
					}
				});

				itSerializes('deeper scope encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							obj = {
								x: function x() {
									return {extB};
								},
								y: function y() {
									return {extA};
								}
							};
						}
						return obj;
					},
					out: `{
						x:(a=>function x(){return{extB:a}})({b:2}),
						y:(a=>function y(){return{extA:a}})({a:1})
					}`,
					validate({x, y}) {
						expect(x).toBeFunction();
						expect(x.name).toBe('x');
						expect(y).toBeFunction();
						expect(y.name).toBe('y');
						expect(x().extB).toEqual({b: 2});
						expect(y().extA).toEqual({a: 1});
					}
				});
			});

			describe('scope shared between functions', () => {
				itSerializes('shallower scope encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							obj = {
								x: function x() {
									return {extA};
								},
								y: function y() {
									return {extA, extB};
								}
							};
						}
						return obj;
					},
					out: `(()=>{
						const a=(
							b=>[
								function x(){return{extA:b}},
								a=>function y(){return{extA:b,extB:a}}
							]
						)({a:1});
						return{x:a[0],y:a[1]({b:2})}
					})()`,
					validate({x, y}) {
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
				});

				itSerializes('deeper scope encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							obj = {
								x: function x() {
									return {extB};
								},
								y: function y() {
									return {extA, extB};
								}
							};
						}
						return obj;
					},
					out: `(()=>{
						const a=(
							b=>a=>[
								function x(){return{extB:a}},
								function y(){return{extA:b,extB:a}}
							]
						)({a:1})({b:2});
						return{x:a[0],y:a[1]}
					})()`,
					validate({x, y}) {
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
				});

				itSerializes('both scopes encountered singly first then together, shallower first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							obj = {
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
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y, z}) {
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
				});

				itSerializes('both scopes encountered singly first then together, deeper first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							obj = {
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
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y, z}) {
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
				});
			});
		});

		describe('3 levels of nesting', () => {
			describe('1 encountered first', () => {
				itSerializes('shallowest encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
									x: function x() {
										return {extA};
									},
									y: function y() {
										return {extA, extB, extC};
									}
								};
							}
						}
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y}) {
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
				});

				itSerializes('middle encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
									x: function x() {
										return {extB};
									},
									y: function y() {
										return {extA, extB, extC};
									}
								};
							}
						}
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y}) {
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
				});

				itSerializes('deepest encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
									x: function x() {
										return {extC};
									},
									y: function y() {
										return {extA, extB, extC};
									}
								};
							}
						}
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y}) {
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
				});
			});

			describe('2 encountered first together, then all', () => {
				itSerializes('shallowest two encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
									x: function x() {
										return {extA, extB};
									},
									y: function y() {
										return {extA, extB, extC};
									}
								};
							}
						}
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y}) {
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
				});

				itSerializes('deepest two encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
									x: function x() {
										return {extB, extC};
									},
									y: function y() {
										return {extA, extB, extC};
									}
								};
							}
						}
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y}) {
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
				});

				itSerializes('deepest and shallowest two encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
									x: function x() {
										return {extA, extC};
									},
									y: function y() {
										return {extA, extB, extC};
									}
								};
							}
						}
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y}) {
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
				});
			});

			describe('2 encountered first together, then last joined', () => {
				itSerializes('shallowest two encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
									x: function x() {
										return {extA, extB};
									},
									y: function y() {
										return {extB, extC};
									}
								};
							}
						}
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y}) {
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
				});

				itSerializes('deepest two encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
									x: function x() {
										return {extB, extC};
									},
									y: function y() {
										return {extA, extC};
									}
								};
							}
						}
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y}) {
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
				});

				itSerializes('deepest and shallowest two encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
									x: function x() {
										return {extA, extC};
									},
									y: function y() {
										return {extB, extC};
									}
								};
							}
						}
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y}) {
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
				});
			});

			describe('2 encountered first singly', () => {
				itSerializes('shallowest two encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
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
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y, z}) {
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
				});

				itSerializes('deepest two encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
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
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y, z}) {
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
				});

				itSerializes('shallowest and deepest two encountered first', {
					in() {
						let obj;
						const extA = {a: 1};
						{
							const extB = {b: 2};
							{
								const extC = {c: 3};
								obj = {
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
						return obj;
					},
					out: `(()=>{
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
					})()`,
					validate({x, y, z}) {
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
				});
			});
		});

		itSerializes('many levels of nesting', {
			in() {
				let obj;
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
											obj = {
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
				return obj;
			},
			out: `(()=>{
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
			})()`,
			validate({x, y, z}) {
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
		});
	});

	describe('nested blocks where some missing scopes', () => {
		itSerializes('1 missing block in 2 deep nesting', {
			in() {
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
				return {x: res1.x, y1: res1.y, y2: res2.y};
			},
			out: `(()=>{
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
			})()`,
			validate({x, y1, y2}) {
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
		});

		itSerializes('2 missing blocks in 3-deep nesting', {
			in() {
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
				return {x: res1.x, y1: res1.y, y2: res2.y};
			},
			out: `(()=>{
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
			})()`,
			validate({x, y1, y2}) {
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
		});

		itSerializes('1 missing block in 3-deep nesting', {
			in() {
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
				return {x: res1.x, y1: res1.y, y2: res2.y};
			},
			out: `(()=>{
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
			})()`,
			validate({x, y1, y2}) {
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
		});

		itSerializes('2 missing blocks in 4-deep nesting', {
			in() {
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
				return {x: res1.x, y1: res1.y, y2: res2.y};
			},
			out: `(()=>{
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
			})()`,
			validate({x, y1, y2}) {
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
		});

		itSerializes('3 missing blocks in 5-deep nesting', {
			in() {
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
				return {x: res1.x, y1: res1.y, y2: res2.y};
			},
			out: `(()=>{
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
			})()`,
			validate({x, y1, y2}) {
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
		});
	});

	describe('including `this`', () => {
		describe('referencing upper function scope', () => {
			describe('1 level up', () => {
				itSerializes('single instantiation', {
					in() {
						function outer() {
							return () => this; // eslint-disable-line no-invalid-this
						}
						return outer.call({ctx: 1});
					},
					out: '(a=>()=>a)({ctx:1})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual({ctx: 1});
					}
				});

				itSerializes('multiple instantiations', {
					in({ctx}) {
						function outer() {
							return () => this; // eslint-disable-line no-invalid-this
						}
						const ctxs = [1, 2, 3].map(n => ({[`ctx${n}`]: n}));
						ctx.ctxs = ctxs;
						return ctxs.map(context => outer.call(context));
					},
					out: `(()=>{
						const a=a=>()=>a;
						return[
							a({ctx1:1}),
							a({ctx2:2}),
							a({ctx3:3})
						]
					})()`,
					validate(arr, {ctx: {ctxs}}) {
						expect(arr).toBeArrayOfSize(3);
						arr.forEach((fn, index) => {
							expect(fn).toBeFunction();
							expect(fn()).toEqual(ctxs[index]);
						});
					}
				});

				describe('with clashing var names', () => {
					itSerializes('outer params', {
						in() {
							function outer(this$0, this$1) {
								return () => [this, this$0, this$1]; // eslint-disable-line no-invalid-this
							}
							return outer.call({ctx: 1}, {extA: 2}, {extB: 3});
						},
						out: '((a,b,c)=>()=>[a,b,c])({ctx:1},{extA:2},{extB:3})',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn()).toEqual([{ctx: 1}, {extA: 2}, {extB: 3}]);
						}
					});

					itSerializes('inner params', {
						in() {
							function outer() {
								return (this$0, this$1) => [this, this$0, this$1]; // eslint-disable-line no-invalid-this
							}
							return outer.call({ctx: 1});
						},
						out: '(c=>(a,b)=>[c,a,b])({ctx:1})',
						validate(fn) {
							expect(fn).toBeFunction();
							const param1 = {},
								param2 = {};
							const res = fn(param1, param2);
							expect(res).toEqual([{ctx: 1}, param1, param2]);
							expect(res[1]).toBe(param1);
							expect(res[2]).toBe(param2);
						}
					});

					itSerializes('outer and inner params', {
						in() {
							function outer(this$0) {
								return this$1 => [this, this$0, this$1]; // eslint-disable-line no-invalid-this
							}
							return outer.call({ctx: 1}, {extA: 2});
						},
						out: '((b,c)=>a=>[b,c,a])({ctx:1},{extA:2})',
						validate(fn) {
							expect(fn).toBeFunction();
							const param = {};
							const res = fn(param);
							expect(res).toEqual([{ctx: 1}, {extA: 2}, param]);
							expect(res[2]).toBe(param);
						}
					});
				});
			});

			describe('2 levels up', () => {
				itSerializes('single instantiation', {
					in() {
						function outer() {
							return extA => () => [this, extA]; // eslint-disable-line no-invalid-this
						}
						return outer.call({ctx: 1})({extA: 2});
					},
					out: '(b=>a=>()=>[b,a])({ctx:1})({extA:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{ctx: 1}, {extA: 2}]);
					}
				});

				itSerializes('multiple instantiations', {
					in({ctx}) {
						function outer() {
							return extA => () => [this, extA]; // eslint-disable-line no-invalid-this
						}
						const exts = [
							{ctx: {ctx1: 1}, extA: {extA1: 11}},
							{ctx: {ctx2: 2}, extA: {extA2: 21}},
							{ctx: {ctx3: 3}, extA: {extA3: 31}}
						];
						ctx.exts = exts;
						return exts.map(ext => outer.call(ext.ctx)(ext.extA));
					},
					out: `(()=>{
						const a=b=>a=>()=>[b,a];
						return[
							a({ctx1:1})({extA1:11}),
							a({ctx2:2})({extA2:21}),
							a({ctx3:3})({extA3:31})
						]
					})()`,
					validate(arr, {ctx: {exts}}) {
						expect(arr).toBeArrayOfSize(3);
						arr.forEach((fn, index) => {
							expect(fn).toBeFunction();
							const res = fn();
							const {ctx, extA} = exts[index];
							expect(res).toEqual([ctx, extA]);
						});
					}
				});
			});

			describe('3 levels up', () => {
				itSerializes('single instantiation', {
					in() {
						function outer() {
							return extA => extB => () => [this, extA, extB]; // eslint-disable-line no-invalid-this
						}
						return outer.call({ctx: 1})({extA: 2})({extB: 3});
					},
					out: '(c=>b=>a=>()=>[c,b,a])({ctx:1})({extA:2})({extB:3})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([{ctx: 1}, {extA: 2}, {extB: 3}]);
					}
				});

				itSerializes('multiple instantiations', {
					in({ctx}) {
						function outer() {
							return extA => extB => () => [this, extA, extB]; // eslint-disable-line no-invalid-this
						}
						const exts = [
							{ctx: {ctx1: 1}, extA: {extA1: 11}, extB: {extB1: 12}},
							{ctx: {ctx2: 2}, extA: {extA2: 21}, extB: {extB2: 22}},
							{ctx: {ctx3: 3}, extA: {extA3: 31}, extB: {extB3: 32}}
						];
						ctx.exts = exts;
						return exts.map(ext => outer.call(ext.ctx)(ext.extA)(ext.extB));
					},
					out: `(()=>{
						const a=c=>b=>a=>()=>[c,b,a];
						return[
							a({ctx1:1})({extA1:11})({extB1:12}),
							a({ctx2:2})({extA2:21})({extB2:22}),
							a({ctx3:3})({extA3:31})({extB3:32})
						]
					})()`,
					validate(arr, {ctx: {exts}}) {
						expect(arr).toBeArrayOfSize(3);
						arr.forEach((fn, index) => {
							expect(fn).toBeFunction();
							const res = fn();
							const {ctx, extA, extB} = exts[index];
							expect(res).toEqual([ctx, extA, extB]);
						});
					}
				});
			});
		});

		describe('referencing local scope', () => {
			itSerializes('in exported function', {
				in() {
					return function() { return this; }; // eslint-disable-line no-invalid-this
				},
				out: 'function(){return this}',
				validate(fn) {
					expect(fn).toBeFunction();
					const ctx = {};
					expect(fn.call(ctx)).toBe(ctx);
				}
			});

			describe('in function nested inside exported function', () => {
				describe('when outer function is', () => {
					itSerializes('function declaration', {
						in() {
							function outer() {
								return function() { return this; }; // eslint-disable-line no-invalid-this
							}
							return outer;
						},
						out: 'function outer(){return function(){return this}}',
						validate(fn) {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBeFunction();
							const ctx = {};
							expect(res.call(ctx)).toBe(ctx);
						}
					});

					itSerializes('function expression', {
						in() {
							return function() {
								return function() { return this; }; // eslint-disable-line no-invalid-this
							};
						},
						out: 'function(){return function(){return this}}',
						validate(fn) {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBeFunction();
							const ctx = {};
							expect(res.call(ctx)).toBe(ctx);
						}
					});

					itSerializes('arrow function', {
						in() {
							return () => function() { return this; }; // eslint-disable-line no-invalid-this
						},
						out: '()=>function(){return this}',
						validate(fn) {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBeFunction();
							const ctx = {};
							expect(res.call(ctx)).toBe(ctx);
						}
					});
				});

				describe('referencing exported function scope', () => {
					itSerializes('from 1 level up', {
						in() {
							return function() {
								return () => this; // eslint-disable-line no-invalid-this
							};
						},
						out: 'function(){return()=>this}',
						validate(fn) {
							expect(fn).toBeFunction();
							const ctx = {};
							const res = fn.call(ctx);
							expect(res).toBeFunction();
							expect(res()).toBe(ctx);
						}
					});

					itSerializes('from 2 levels up', {
						in() {
							return function() {
								return () => () => this; // eslint-disable-line no-invalid-this
							};
						},
						out: 'function(){return()=>()=>this}',
						validate(fn) {
							expect(fn).toBeFunction();
							const ctx = {};
							const res = fn.call(ctx);
							expect(res).toBeFunction();
							const res2 = res();
							expect(res2).toBeFunction();
							expect(res2()).toBe(ctx);
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
											return () => this; // eslint-disable-line no-invalid-this
										};
									}
									return outer;
								},
								out: 'function outer(){return function(){return()=>this}}',
								validate(fn) {
									expect(fn).toBeFunction();
									const res = fn();
									expect(res).toBeFunction();
									const ctx = {};
									const res2 = res.call(ctx);
									expect(res2).toBeFunction();
									expect(res2()).toBe(ctx);
								}
							});

							itSerializes('from 2 levels up', {
								in() {
									function outer() {
										return function() {
											return () => () => this; // eslint-disable-line no-invalid-this
										};
									}
									return outer;
								},
								out: 'function outer(){return function(){return()=>()=>this}}',
								validate(fn) {
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
							});
						});

						describe('function expression', () => {
							itSerializes('from 1 level up', {
								in() {
									return function() {
										return function() {
											return () => this; // eslint-disable-line no-invalid-this
										};
									};
								},
								out: 'function(){return function(){return()=>this}}',
								validate(fn) {
									expect(fn).toBeFunction();
									const res = fn();
									expect(res).toBeFunction();
									const ctx = {};
									const res2 = res.call(ctx);
									expect(res2).toBeFunction();
									expect(res2()).toBe(ctx);
								}
							});

							itSerializes('from 2 levels up', {
								in() {
									return function() {
										return function() {
											return () => () => this; // eslint-disable-line no-invalid-this
										};
									};
								},
								out: 'function(){return function(){return()=>()=>this}}',
								validate(fn) {
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
							});
						});

						describe('arrow function', () => {
							itSerializes('from 1 level up', {
								in() {
									return () => (
										function() {
											return () => this; // eslint-disable-line no-invalid-this
										}
									);
								},
								out: '()=>function(){return()=>this}',
								validate(fn) {
									expect(fn).toBeFunction();
									const res = fn();
									expect(res).toBeFunction();
									const ctx = {};
									const res2 = res.call(ctx);
									expect(res2).toBeFunction();
									expect(res2()).toBe(ctx);
								}
							});

							itSerializes('from 2 levels up', {
								in() {
									return () => (
										function() {
											return () => () => this; // eslint-disable-line no-invalid-this
										}
									);
								},
								out: '()=>function(){return()=>()=>this}',
								validate(fn) {
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
							});
						});
					});
				});
			});
		});

		itSerializes('referencing own context', {
			in() {
				return function() {
					return this; // eslint-disable-line no-invalid-this
				};
			},
			out: 'function(){return this}',
			validate(fn) {
				expect(fn).toBeFunction();
				const ctx = {ctx: 1};
				expect(fn.call(ctx)).toBe(ctx);
			}
		});

		itSerializes('referencing global scope', {
			in: () => () => this, // eslint-disable-line no-invalid-this
			out: '()=>this',
			validate(fn) {
				expect(fn).toBeFunction();
				fn(); // Can't test for return value due to how serialized code is evaluated
			}
		});
	});

	describe('referencing other functions', () => {
		describe('in scope above (not injected)', () => {
			itSerializes('single instantiation', {
				in() {
					function other() { return 123; }
					return () => other;
				},
				out: '(a=>()=>a)(function other(){return 123})',
				validate(fn) {
					expect(fn).toBeFunction();
					const otherFn = fn();
					expect(otherFn).toBeFunction();
					expect(otherFn()).toBe(123);
				}
			});

			itSerializes('multiple instantiations', {
				in() {
					function other() { return 123; }
					return [1, 2, 3].map(() => () => other);
				},
				out: `(()=>{
					const a=(a=>()=>()=>a)(function other(){return 123});
					return[a(),a(),a()]
				})()`,
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					const others = arr.map((fn) => {
						expect(fn).toBeFunction();
						const otherFn = fn();
						expect(otherFn).toBeFunction();
						expect(otherFn()).toBe(123);
						return otherFn;
					});

					expect(others[0]).toBe(others[1]);
					expect(others[0]).toBe(others[2]);
				}
			});
		});

		describe('in same scope (injected)', () => {
			itSerializes('single instantiation', {
				in() {
					function outer(extA) {
						function other() { return extA; }
						return function inner() { return [extA, other]; };
					}
					return outer({extA: 1});
				},
				out: `(()=>{
					const a=(
							(a,b)=>[
								a=>b=a,
								function other(){return a},
								function inner(){return[a,b]}
							]
						)({extA:1});
					a[0](a[1]);
					return a[2]
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(2);
					const [resA, other] = res;
					expect(resA).toEqual({extA: 1});
					expect(other).toBeFunction();
					expect(other()).toBe(resA);
				}
			});

			itSerializes('multiple instantiations', {
				in({ctx}) {
					function outer(extA) {
						function other() { return extA; }
						return function inner() { return [extA, other]; };
					}
					const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
					ctx.extAs = extAs;
					return extAs.map(extA => outer(extA));
				},
				out: `(()=>{
					const a=(a,b)=>[
							a=>b=a,
							function other(){return a},
							function inner(){return[a,b]}
						],
						b=a({extA1:1}),
						c=a({extA2:2}),
						d=a({extA3:3});
					b[0](b[1]);
					c[0](c[1]);
					d[0](d[1]);
					return[b[2],c[2],d[2]]
				})()`,
				validate(arr, {ctx: {extAs}}) {
					expect(arr).toBeArrayOfSize(3);
					const others = arr.map((inner, index) => {
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
				}
			});
		});

		describe('in nested scope (injected)', () => {
			itSerializes('single instantiation', {
				in() {
					function outer(extA) {
						let other;
						if (true) { // eslint-disable-line no-constant-condition
							const extB = extA;
							other = (0, () => [extA, extB]);
						}
						return function inner() { return [extA, other]; };
					}
					return outer({extA: 1});
				},
				out: `(()=>{
					const a={extA:1},
						b=(
							(b,c)=>[
								a=>c=a,
								function inner(){return[b,c]},
								a=>()=>[b,a]
							]
						)(a);
					b[0](b[2](a));
					return b[1]
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn();
					expect(res).toBeArrayOfSize(2);
					const [resA, other] = res;
					expect(resA).toEqual({extA: 1});
					expect(other).toBeFunction();
					const otherRes = other();
					expect(otherRes).toBeArrayOfSize(2);
					const [resA2, resB] = otherRes;
					expect(resA2).toBe(resA);
					expect(resB).toBe(resA);
				}
			});

			itSerializes('multiple instantiations', {
				in({ctx}) {
					function outer(extA) {
						let other;
						if (true) { // eslint-disable-line no-constant-condition
							const extB = extA;
							other = (0, () => [extA, extB]);
						}
						return function inner() { return [extA, other]; };
					}
					const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
					ctx.extAs = extAs;
					return extAs.map(extA => outer(extA));
				},
				out: `(()=>{
					const a=(b,c)=>[
							a=>c=a,
							function inner(){return[b,c]},
							a=>()=>[b,a]
						],
						b={extA1:1},
						c=a(b),
						d={extA2:2},
						e=a(d),
						f={extA3:3},
						g=a(f);
					c[0](c[2](b));
					e[0](e[2](d));
					g[0](g[2](f));
					return[c[1],e[1],g[1]]
				})()`,
				validate(arr, {ctx: {extAs}}) {
					expect(arr).toBeArrayOfSize(3);
					const others = arr.map((inner, index) => {
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
				}
			});
		});

		describe('circular references between functions (both injected)', () => {
			itSerializes('single instantiation', {
				in() {
					function outer(extA) {
						function inner1() { return [extA, inner2]; }
						function inner2() { return [extA, inner1]; }
						return inner1;
					}
					return outer({extA: 1});
				},
				out: `(()=>{
					const a=(
							(a,b,c)=>[
								a=>b=a,
								a=>c=a,
								function inner2(){return[a,b]},
								function inner1(){return[a,c]}
							]
						)({extA:1}),
						b=a[3];
					a[0](b);
					a[1](a[2]);
					return b
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					const inner1Res = fn();
					expect(inner1Res).toBeArrayOfSize(2);
					const [resA, inner2] = inner1Res;
					expect(resA).toEqual({extA: 1});
					expect(inner2).toBeFunction();
					const inner2Res = inner2();
					expect(inner2Res).toBeArrayOfSize(2);
					const [resA2, inner1] = inner2Res;
					expect(resA2).toBe(resA);
					expect(inner1).toBe(fn);
				}
			});

			itSerializes('multiple instantiations', {
				in({ctx}) {
					function outer(extA) {
						function inner1() { return [extA, inner2]; }
						function inner2() { return [extA, inner1]; }
						return inner1;
					}
					const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
					ctx.extAs = extAs;
					return extAs.map(extA => outer(extA));
				},
				out: `(()=>{
					const a=(a,b,c)=>[
							a=>b=a,
							a=>c=a,
							function inner2(){return[a,b]},
							function inner1(){return[a,c]}
						],
						b=a({extA1:1}),
						c=b[3],
						d=a({extA2:2}),
						e=d[3],
						f=a({extA3:3}),
						g=f[3];
					b[0](c);
					b[1](b[2]);
					d[0](e);
					d[1](d[2]);
					f[0](g);
					f[1](f[2]);
					return[c,e,g]
				})()`,
				validate(arr, {ctx: {extAs}}) {
					expect(arr).toBeArrayOfSize(3);
					const inners = arr.map((inner1, index) => {
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
				}
			});
		});

		describe('circular references between functions defined in scope and external vars', () => {
			describe('function only', () => {
				itSerializes('single instantiation', {
					in() {
						const ext = {
							fn: (0, () => ext)
						};
						return ext.fn;
					},
					out: '(()=>{const a={},b=(a=>()=>a)(a);a.fn=b;return b})()',
					validate(fn) {
						expect(fn).toBeFunction();
						const obj = fn();
						expect(obj).toBeObject();
						expect(obj.fn).toBe(fn);
					}
				});

				itSerializes('multiple instantiations', {
					in() {
						function outer(num) {
							const ext = {num};
							ext.fn = (0, () => ext);
							return ext.fn;
						}
						return [0, 1, 2].map(num => outer(num));
					},
					out: `(()=>{
						const a=a=>()=>a,
							b={num:0},
							c=a(b),
							d={num:1},
							e=a(d),
							f={num:2},
							g=a(f);
						b.fn=c;
						d.fn=e;
						f.fn=g;
						return[c,e,g]
					})()`,
					validate(arr) {
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
				});
			});

			describe('circular function referenced by another function', () => {
				itSerializes('single instantiation', {
					in() {
						const ext = {};
						const fn = (0, () => ext);
						ext.x = fn;
						return (0, () => fn);
					},
					out: `(()=>{
						const a={},
							b=((a,b)=>[a=>b=a,()=>a,()=>b])(a),
							c=b[1];
						a.x=c;
						b[0](c);
						return b[2]
					})()`,
					validate(fn1) {
						expect(fn1).toBeFunction();
						const fn2 = fn1();
						expect(fn2).toBeFunction();
						const obj = fn2();
						expect(obj).toBeObject();
						expect(obj.x).toBe(fn2);
					}
				});

				itSerializes('multiple instantiations', {
					in() {
						function outer(num) {
							const ext = {num};
							const fn = (0, () => ext);
							ext.fn = fn;
							return (0, () => fn);
						}

						return [0, 1, 2].map(num => outer(num));
					},
					out: `(()=>{
						const a=(a,b)=>[
								a=>b=a,
								()=>a,
								()=>b
							],
							b={num:0},
							c=a(b),
							d={num:1},
							e=a(d),
							f={num:2},
							g=a(f),
							h=c[1],
							i=e[1],
							j=g[1];
						b.fn=h;
						c[0](h);
						d.fn=i;
						e[0](i);
						f.fn=j;
						g[0](j);
						return[c[2],e[2],g[2]]
					})()`,
					validate(arr) {
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
				});
			});

			describe('2 functions in same scope referencing object containing one of functions', () => {
				itSerializes('single instantiation', {
					in() {
						const ext = {x};
						function x() { return ext; }
						return function y() { return ext; };
					},
					out: `(()=>{
						const a=(
							a=>[
								b=>a=b,
								function x(){return a},
								function y(){return a}
							]
						)();
						a[0]({x:a[1]});
						return a[2]
					})()`,
					validate(fn1) {
						expect(fn1).toBeFunction();
						expect(fn1.name).toBe('y');
						const obj = fn1();
						expect(obj).toBeObject();
						const fn2 = obj.x;
						expect(fn2).toBeFunction();
						expect(fn2.name).toBe('x');
						expect(fn2()).toBe(obj);
					}
				});

				itSerializes('multiple instantiations', {
					in() {
						function outer(num) {
							const ext = {num, x};
							function x() { return ext; }
							return function y() { return ext; };
						}

						return [0, 1, 2].map(num => outer(num));
					},
					out: `(()=>{
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
					})()`,
					validate(arr) {
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
				});
			});

			describe('function referencing object containing another function in same scope', () => {
				itSerializes('single instantiation', {
					in() {
						const ext = {x};
						function x() { return y; }
						function y() { return ext; }
						return y;
					},
					out: `(()=>{
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
					})()`,
					validate(fn1) {
						expect(fn1).toBeFunction();
						expect(fn1.name).toBe('y');
						const obj = fn1();
						expect(obj).toBeObject();
						const fn2 = obj.x;
						expect(fn2).toBeFunction();
						expect(fn2.name).toBe('x');
						expect(fn2()).toBe(fn1);
					}
				});

				itSerializes('multiple instantiations', {
					in() {
						function outer(num) {
							const ext = {num, x};
							function x() { return y; }
							function y() { return ext; }
							return y;
						}

						return [0, 1, 2].map(num => outer(num));
					},
					out: `(()=>{
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
					})()`,
					validate(arr) {
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
				});
			});
		});
	});

	describe('with circular references', () => {
		itSerializes('nested in object 1 level deep', {
			in() {
				const obj = {};
				obj.fn = () => obj;
				return obj;
			},
			out: '(()=>{const a=(a=>[b=>a=b,()=>a])(),b={fn:a[1]};a[0](b);return b})()',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['fn']);
				const {fn} = obj;
				expect(fn).toBeFunction();
				expect(fn()).toBe(obj);
			}
		});

		itSerializes('nested in object 2 levels deep', {
			in() {
				const obj = {inner: {}};
				obj.inner.fn = () => obj;
				return obj;
			},
			out: '(()=>{const a=(a=>[b=>a=b,()=>a])(),b={inner:{fn:a[1]}};a[0](b);return b})()',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['inner']);
				const {inner} = obj;
				expect(inner).toBeObject();
				expect(inner).toContainAllKeys(['fn']);
				const {fn} = inner;
				expect(fn).toBeFunction();
				expect(fn()).toBe(obj);
			}
		});

		itSerializes('reference nested in nested function', {
			in() {
				const obj = {};
				obj.fn = x => () => [x, obj];
				return obj;
			},
			out: '(()=>{const a=(b=>[a=>b=a,a=>()=>[a,b]])(),b={fn:a[1]};a[0](b);return b})()',
			validate(out) {
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
		});

		describe('leaving gaps in params', () => {
			itSerializes('1 gap', {
				in() {
					const obj = {};
					const ext = {x: 1};
					obj.fn = () => [obj, ext];
					return obj;
				},
				out: '(()=>{const a=((a,b)=>[b=>a=b,()=>[a,b]])(void 0,{x:1}),b={fn:a[1]};a[0](b);return b})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['fn']);
					const {fn} = obj;
					expect(fn).toBeFunction();
					const arr = fn();
					expect(arr).toBeArrayOfSize(2);
					expect(arr[0]).toBe(obj);
					expect(arr[1]).toEqual({x: 1});
				}
			});

			itSerializes('2 gaps', {
				in() {
					const inner = {};
					const obj = {inner};
					const ext = {x: 1};
					inner.fn = () => [obj, inner, ext];
					return obj;
				},
				out: `(()=>{
					const a=void 0,
						b=(
							(a,b,c)=>[
								b=>a=b,
								a=>b=a,
								()=>[a,b,c]
							]
						)(a,a,{x:1}),
						c={fn:b[2]},
						d={inner:c};
					b[0](d);
					b[1](c);
					return d
				})()`,
				validate(obj) {
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
			});
		});
	});

	describe('with destructured params', () => {
		describe('in outer function', () => {
			describe('object destructuring', () => {
				itSerializes('destructured 1 level deep', {
					in() {
						function outer({v, w}, {x, q: y, ...z}) {
							return () => [v, w, x, y, z];
						}
						return outer({v: 1, w: 2}, {x: 3, q: 4, m: 5, n: 6});
					},
					out: '((a,b,c,d,e)=>()=>[a,b,c,d,e])(1,2,3,4,{m:5,n:6})',
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toEqual([1, 2, 3, 4, {m: 5, n: 6}]);
					}
				});

				itSerializes('destructured 2 levels deep', {
					in() {
						function outer({vv: {v, w}}, {xx: {x}, yy: {q: y, ...z}}) {
							return () => [v, w, x, y, z];
						}
						return outer({vv: {v: 1, w: 2}}, {xx: {x: 3}, yy: {q: 4, m: 5, n: 6}});
					},
					out: '((a,b,c,d,e)=>()=>[a,b,c,d,e])(1,2,3,4,{m:5,n:6})',
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toEqual([1, 2, 3, 4, {m: 5, n: 6}]);
					}
				});
			});

			describe('array destructuring', () => {
				itSerializes('destructured 1 level deep', {
					in() {
						function outer([v, w], [, x, , , y, , ...z]) {
							return () => [v, w, x, y, z];
						}
						return outer([1, 2], [0, 3, 0, 0, 4, 0, 5, 6]);
					},
					out: '((a,b,c,d,e)=>()=>[a,b,c,d,e])(1,2,3,4,[5,6])',
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toEqual([1, 2, 3, 4, [5, 6]]);
					}
				});

				itSerializes('destructured 2 levels deep', {
					in() {
						function outer([[v], [w]], [[, x, , , y, , ...z]]) {
							return () => [v, w, x, y, z];
						}
						return outer([[1], [2]], [[0, 3, 0, 0, 4, 0, 5, 6]]);
					},
					out: '((a,b,c,d,e)=>()=>[a,b,c,d,e])(1,2,3,4,[5,6])',
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toEqual([1, 2, 3, 4, [5, 6]]);
					}
				});
			});
		});

		describe('in exported function', () => {
			describe('object destructuring', () => {
				itSerializes('destructured 1 level deep', {
					in() {
						function outer(x, y, q, z) { // eslint-disable-line no-unused-vars
							return ({v, w}, {x, q: y, ...z}) => [v, w, x, y, z]; // eslint-disable-line no-shadow
						}
						return outer();
					},
					out: '({v:a,w:b},{x:c,q:d,...e})=>[a,b,c,d,e]',
					validate(fn) {
						expect(fn).toBeFunction();
						const param1 = {},
							param2 = {},
							param3 = {},
							param4 = {},
							param5 = {},
							param6 = {};
						const res = fn({v: param1, w: param2}, {x: param3, q: param4, m: param5, n: param6});
						expect(res).toBeArrayOfSize(5);
						expect(res[0]).toBe(param1);
						expect(res[1]).toBe(param2);
						expect(res[2]).toBe(param3);
						expect(res[3]).toBe(param4);
						expect(res[4]).toEqual({m: {}, n: {}});
						expect(res[4].m).toBe(param5);
						expect(res[4].n).toBe(param6);
					}
				});

				itSerializes('destructured 2 levels deep', {
					in() {
						function outer(x, y, ww, q, z) { // eslint-disable-line no-unused-vars
						// eslint-disable-next-line no-shadow
							return ({vv: {v, w}}, {xx: {x}, yy: {q: y}, ...z}) => [v, w, x, y, z];
						}
						return outer();
					},
					out: '({vv:{v:a,w:b}},{xx:{x:c},yy:{q:d},...e})=>[a,b,c,d,e]',
					validate(fn) {
						expect(fn).toBeFunction();
						const param1 = {},
							param2 = {},
							param3 = {},
							param4 = {},
							param5 = {},
							param6 = {};
						const res = fn(
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
					}
				});
			});

			describe('array destructuring', () => {
				itSerializes('destructured 1 level deep', {
					in() {
						function outer(w, y, z) { // eslint-disable-line no-unused-vars
							return ([v, w], [, x, , , y, , ...z]) => [v, w, x, y, z]; // eslint-disable-line no-shadow
						}
						return outer();
					},
					out: '([a,b],[,c,,,d,,...e])=>[a,b,c,d,e]',
					validate(fn) {
						expect(fn).toBeFunction();
						const param1 = {},
							param2 = {},
							param3 = {},
							param4 = {},
							param5 = {},
							param6 = {};
						const res = fn([param1, param2], [0, param3, 0, 0, param4, 0, param5, param6]);
						expect(res).toBeArrayOfSize(5);
						expect(res[0]).toBe(param1);
						expect(res[1]).toBe(param2);
						expect(res[2]).toBe(param3);
						expect(res[3]).toBe(param4);
						expect(res[4]).toBeArrayOfSize(2);
						expect(res[4][0]).toBe(param5);
						expect(res[4][1]).toBe(param6);
					}
				});

				itSerializes('destructured 2 levels deep', {
					in() {
						function outer(w, y, z) { // eslint-disable-line no-unused-vars
						// eslint-disable-next-line no-shadow
							return ([[v], [w]], [[, x, , , y, , ...z]]) => [v, w, x, y, z];
						}
						return outer();
					},
					out: '([[a],[b]],[[,c,,,d,,...e]])=>[a,b,c,d,e]',
					validate(fn) {
						expect(fn).toBeFunction();
						const param1 = {},
							param2 = {},
							param3 = {},
							param4 = {},
							param5 = {},
							param6 = {};
						const res = fn([[param1], [param2]], [[0, param3, 0, 0, param4, 0, param5, param6]]);
						expect(res).toBeArrayOfSize(5);
						expect(res[0]).toBe(param1);
						expect(res[1]).toBe(param2);
						expect(res[2]).toBe(param3);
						expect(res[3]).toBe(param4);
						expect(res[4]).toBeArrayOfSize(2);
						expect(res[4][0]).toBe(param5);
						expect(res[4][1]).toBe(param6);
					}
				});
			});

			itSerializes('also referencing external scope', {
				in() {
					const ext = {extA: 1};
					return ({vv: {vvv: {v}, ww: [w, [x], ...y]}, ...z}) => [ext, v, w, x, y, z];
				},
				out: '(f=>({vv:{vvv:{v:a},ww:[b,[c],...d]},...e})=>[f,a,b,c,d,e])({extA:1})',
				validate(fn) {
					expect(fn).toBeFunction();
					const res = fn({vv: {vvv: {v: 1}, ww: [2, [3], 4, 5, 6]}, e: 7, f: 8});
					expect(res).toEqual([{extA: 1}, 1, 2, 3, [4, 5, 6], {e: 7, f: 8}]);
				}
			});
		});
	});

	describe('with spread params', () => {
		itSerializes('in outer function', {
			in() {
				function outer(x, y, ...z) {
					return () => [x, y, z];
				}
				return outer(1, 2, 3, 4, 5);
			},
			out: '((a,b,c)=>()=>[a,b,c])(1,2,[3,4,5])',
			validate(fn) {
				expect(fn).toBeFunction();
				const res = fn();
				expect(res).toEqual([1, 2, [3, 4, 5]]);
			}
		});

		itSerializes('in exported function', {
			in() {
				function outer(y, z) { // eslint-disable-line no-unused-vars
					return (x, y, ...z) => [x, y, z]; // eslint-disable-line no-shadow
				}
				return outer();
			},
			out: '(a,b,...c)=>[a,b,c]',
			validate(fn) {
				expect(fn).toBeFunction();
				const param1 = {},
					param2 = {},
					param3 = {},
					param4 = {};
				const res = fn(param1, param2, param3, param4);
				expect(res).toBeArrayOfSize(3);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2][0]).toBe(param3);
				expect(res[2][1]).toBe(param4);
			}
		});

		itSerializes('also referencing external scope', {
			in() {
				const ext = {extA: 1};
				return (x, y, ...z) => [ext, x, y, z];
			},
			out: '(d=>(a,b,...c)=>[d,a,b,c])({extA:1})',
			validate(fn) {
				expect(fn).toBeFunction();
				const res = fn(1, 2, 3, 4, 5);
				expect(res).toEqual([{extA: 1}, 1, 2, [3, 4, 5]]);
			}
		});
	});

	describe('referencing error argument of `catch ()`', () => {
		itSerializes('1 level up', {
			in() {
				try {
					throw 123; // eslint-disable-line no-throw-literal
				} catch (err) {
					const extA = 456;
					return (x, y) => [x, y, extA, err];
				}
			},
			out: '((c,d)=>(a,b)=>[a,b,c,d])(456,123)',
			validate(fn) {
				expect(fn).toBeFunction();
				const param1 = {},
					param2 = {};
				const res = fn(param1, param2);
				expect(res).toBeArrayOfSize(4);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toEqual(456);
				expect(res[3]).toEqual(123);
			}
		});

		itSerializes('2 levels up', {
			in() {
				try {
					throw 123; // eslint-disable-line no-throw-literal
				} catch (err) {
					const extA = 456;
					return x => y => [x, y, extA, err];
				}
			},
			out: '((c,d)=>a=>b=>[a,b,c,d])(456,123)',
			validate(fn) {
				expect(fn).toBeFunction();
				const param1 = {},
					param2 = {};
				const res = fn(param1)(param2);
				expect(res).toBeArrayOfSize(4);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toEqual(456);
				expect(res[3]).toEqual(123);
			}
		});
	});

	describe('referencing var created in `for ()`', () => {
		describe('`for ( ...; ...; ... )', () => {
			itSerializes('using `let`', {
				in() {
					const arr = [];
					for (let x = 1, y = 11; x <= 3; x++, y++) arr.push(() => [x, y]); // NB No statement block
					return arr;
				},
				out: `(()=>{
					const a=(a,b)=>()=>[a,b];
					return[a(1,11),a(2,12),a(3,13)]
				})()`,
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					arr.forEach((fn, index) => {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toEqual([index + 1, index + 11]);
					});
				}
			});

			itSerializes('using `var`', {
				in() {
					const arr = [];
					// eslint-disable-next-line no-var, vars-on-top, no-loop-func
					for (var x = 1, y = 11; x <= 3; x++, y++) arr.push(() => [x, y]); // NB No statement block
					return arr;
				},
				out: '(()=>{const a=((a,b)=>()=>()=>[a,b])(4,14);return[a(),a(),a()]})()',
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					for (const fn of arr) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toEqual([4, 14]);
					}
				}
			});
		});

		describe('`for ( ... of ... )', () => {
			describe('using `const`', () => {
				itSerializes('without destructuring', {
					in() {
						const arr = [];
						for (const x of [0, 2, 4]) arr.push(() => x); // NB No statement block
						return arr;
					},
					out: '(()=>{const a=a=>()=>a;return[a(0),a(2),a(4)]})()',
					validate(arr) {
						expect(arr).toBeArrayOfSize(3);
						arr.forEach((fn, index) => {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBe(index * 2);
						});
					}
				});

				itSerializes('with destructuring', {
					in() {
						const arr = [];
						for (
							const {x, yy: [y], ...z} of [
								{x: 1, yy: [2], m: 3, n: 4},
								{x: 11, yy: [12], m: 13, n: 14},
								{x: 21, yy: [22], m: 23, n: 24}
							]
						) arr.push(() => [x, y, z]); // NB No statement block
						return arr;
					},
					out: `(()=>{
						const a=(a,b,c)=>()=>[a,b,c];
						return[
							a(1,2,{m:3,n:4}),
							a(11,12,{m:13,n:14}),
							a(21,22,{m:23,n:24})
						]
					})()`,
					validate(arr) {
						expect(arr).toBeArrayOfSize(3);
						arr.forEach((fn, index) => {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toEqual(
								[index * 10 + 1, index * 10 + 2, {m: index * 10 + 3, n: index * 10 + 4}]
							);
						});
					}
				});
			});

			describe('using `var`', () => {
				itSerializes('without destructuring', {
					in() {
						const arr = [];
						// eslint-disable-next-line no-var, vars-on-top, no-loop-func
						for (var x of [{obj1: 1}, {obj2: 2}, {obj3: 3}]) arr.push(() => x); // NB No statement block
						return arr;
					},
					out: '(()=>{const a=(a=>()=>()=>a)({obj3:3});return[a(),a(),a()]})()',
					validate(arr) {
						expect(arr).toBeArrayOfSize(3);
						const ress = arr.map((fn) => {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toEqual({obj3: 3});
							return res;
						});

						expect(ress[0]).toBe(ress[1]);
						expect(ress[0]).toBe(ress[2]);
					}
				});

				itSerializes('with destructuring', {
					in() {
						const arr = [];
						for (
							var {x, yy: [y], ...z} of [ // eslint-disable-line no-var, vars-on-top
								{x: {objX1: 1}, yy: [{objY1: 2}], m: {objM1: 3}, n: {objN1: 4}},
								{x: {objX2: 11}, yy: [{objY2: 12}], m: {objM2: 13}, n: {objN2: 14}},
								{x: {objX3: 21}, yy: [{objY3: 22}], m: {objM3: 23}, n: {objN3: 24}}
							]
						) arr.push(() => [x, y, z]); // eslint-disable-line no-loop-func
						// NB No statement block
						return arr;
					},
					out: `(()=>{
						const a=(
							(a,b,c)=>()=>()=>[a,b,c]
						)({objX3:21},{objY3:22},{m:{objM3:23},n:{objN3:24}});
						return[a(),a(),a()]
					})()`,
					validate(arr) {
						expect(arr).toBeArrayOfSize(3);
						const ress = arr.map((fn) => {
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
					}
				});
			});
		});

		describe('`for ( ... in ... )', () => {
			itSerializes('using `const`', {
				in() {
					const arr = [];
					for (const x in {x: 1, y: 2, z: 3}) arr.push(() => x); // NB No statement block
					return arr;
				},
				out: '(()=>{const a=a=>()=>a;return[a("x"),a("y"),a("z")]})()',
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					arr.forEach((fn, index) => {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toBe(['x', 'y', 'z'][index]);
					});
				}
			});

			itSerializes('using `var`', {
				in() {
					const arr = [];
					// eslint-disable-next-line no-var, vars-on-top, no-loop-func
					for (var x in {x: 1, y: 2, z: 3}) arr.push(() => x); // NB No statement block
					return arr;
				},
				out: '(()=>{const a=(a=>()=>()=>a)("z");return[a(),a(),a()]})()',
				validate(arr) {
					expect(arr).toBeArrayOfSize(3);
					for (const fn of arr) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res).toBe('z');
					}
				}
			});
		});
	});

	describe('self-referencing functions', () => {
		itSerializes('own function', {
			in() {
				return function x() {
					return x;
				};
			},
			out: 'function x(){return x}',
			validate: fn => expect(fn()).toBe(fn)
		});

		itSerializes('upper function', {
			in() {
				return function x() {
					return () => x;
				};
			},
			out: 'function x(){return()=>x}',
			validate: fn => expect(fn()()).toBe(fn)
		});

		describe('with name', () => {
			describe('changed', () => {
				itSerializes('simple case', {
					in() {
						function fn() { return fn; }
						Object.defineProperty(fn, 'name', {value: 'newName'});
						return fn;
					},
					out: 'function newName(){return newName}',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('newName');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						expect(fn()).toBe(fn);
					}
				});

				itSerializes('with clashing external var', {
					in() {
						const ext = 1;
						function fn() { return [fn, ext]; }
						Object.defineProperty(fn, 'name', {value: 'ext'});
						return fn;
					},
					out: '(a=>function ext(){return[ext,a]})(1)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('ext');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						const res = fn();
						expect(res).toBeArrayOfSize(2);
						expect(res[0]).toBe(fn);
						expect(res[1]).toBe(1);
					}
				});

				itSerializes('with clashing internal var', {
					in() {
						function fn() {
							const int = 1;
							return [fn, int];
						}
						Object.defineProperty(fn, 'name', {value: 'int'});
						return fn;
					},
					out: 'function int(){const a=1;return[int,a]}',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('int');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						const res = fn();
						expect(res).toBeArrayOfSize(2);
						expect(res[0]).toBe(fn);
						expect(res[1]).toBe(1);
					}
				});

				itSerializes('with clashing global var', {
					in() {
						function fn() {
							return [fn, console];
						}
						Object.defineProperty(fn, 'name', {value: 'console'});
						return fn;
					},
					out: 'Object.defineProperties(function a(){return[a,console]},{name:{value:"console"}})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('console');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						const res = fn();
						expect(res).toBeArrayOfSize(2);
						expect(res[0]).toBe(fn);
						expect(res[1]).toBe(console);
					}
				});

				itSerializes('with clashing function name', {
					in() {
						function fn() {
							function int() { return 2; }
							return [fn, int];
						}
						Object.defineProperty(fn, 'name', {value: 'int'});
						return fn;
					},
					out: `Object.defineProperties(
						function a(){function int(){return 2}return[a,int]},
						{name:{value:"int"}}
					)`,
					validate(fn) {
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
				});

				itSerializes('to an invalid identifier', {
					in() {
						function input() { return input; }
						Object.defineProperty(input, 'name', {value: 'new-name'});
						return input;
					},
					out: 'Object.defineProperties(function a(){return a},{name:{value:"new-name"}})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('new-name');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						expect(fn()).toBe(fn);
					}
				});

				itSerializes('to a non-string', {
					in() {
						function fn() { return fn; }
						Object.defineProperty(fn, 'name', {value: {x: 1}});
						return fn;
					},
					out: 'Object.defineProperties(function a(){return a},{name:{value:{x:1}}})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toEqual({x: 1});
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						expect(fn()).toBe(fn);
					}
				});
			});

			itSerializes('deleted', {
				in() {
					function fn() { return fn; }
					delete fn.name;
					return fn;
				},
				out: '(()=>{const a=function a(){return a};delete a.name;return a})()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn).not.toHaveOwnProperty('name');
					expect(fn.name).toBe('');
					expect(fn()).toBe(fn);
				}
			});
		});
	});

	describe('bound functions', () => {
		describe('no circular references (no injection)', () => {
			itSerializes('single instantiation', {
				in() {
					// eslint-disable-next-line no-invalid-this
					function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
					return fn.bind({ctx: 1}, {extA: 2}, {extB: 3}, 123);
				},
				out: 'function fn(a,b,c,d,e){return[this,a,b,c,d,e]}.bind({ctx:1},{extA:2},{extB:3},123)',
				validate(boundFn) {
					expect(boundFn).toBeFunction();
					expect(boundFn.name).toBe('bound fn');
					expect(boundFn).toHaveLength(2);
					const param1 = {},
						param2 = 100;
					const res = boundFn(param1, param2);
					expect(res).toBeArrayOfSize(6);
					expect(res[0]).toEqual({ctx: 1});
					expect(res[1]).toEqual({extA: 2});
					expect(res[2]).toEqual({extB: 3});
					expect(res[3]).toBe(123);
					expect(res[4]).toBe(param1);
					expect(res[5]).toBe(param2);
				}
			});

			itSerializes('multiple instantiations', {
				in({ctx}) {
					// eslint-disable-next-line no-invalid-this
					function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
					const context = {ctx: 1},
						extA = {extA: 2};
					const extBs = [{extB1: 11}, {extB2: 12}, {extB3: 13}];
					ctx.extBs = extBs;
					return extBs.map(extB => fn.bind(context, extA, extB, 123));
				},
				out: `(()=>{
					const a=function fn(a,b,c,d,e){return[this,a,b,c,d,e]},
						b={ctx:1},
						c={extA:2};
					return[
						a.bind(b,c,{extB1:11},123),
						a.bind(b,c,{extB2:12},123),
						a.bind(b,c,{extB3:13},123)
					]})()`,
				validate(arr, {ctx: {extBs}}) {
					expect(arr).toBeArrayOfSize(3);
					expect(arr[0]).not.toBe(arr[1]);
					expect(arr[0]).not.toBe(arr[2]);
					expect(arr[1]).not.toBe(arr[2]);

					const ctxExtAs = arr.map((boundFn, index) => {
						expect(boundFn).toBeFunction();
						expect(boundFn.name).toBe('bound fn');
						expect(boundFn).toHaveLength(2);
						const param1 = {},
							param2 = index * 100;
						const res = boundFn(param1, param2);
						expect(res).toBeArrayOfSize(6);
						expect(res[0]).toEqual({ctx: 1});
						expect(res[1]).toEqual({extA: 2});
						expect(res[2]).toEqual(extBs[index]);
						expect(res[3]).toBe(123);
						expect(res[4]).toBe(param1);
						expect(res[5]).toBe(param2);
						return {ctx: res[0], extA: res[1]};
					});

					const ctxs = ctxExtAs.map(({ctx}) => ctx);
					expect(ctxs[0]).toBe(ctxs[1]);
					expect(ctxs[0]).toBe(ctxs[2]);

					const extAs = ctxExtAs.map(({extA}) => extA);
					expect(extAs[0]).toBe(extAs[1]);
					expect(extAs[0]).toBe(extAs[2]);
				}
			});
		});

		describe('bound to circular reference', () => {
			describe('object', () => {
				itSerializes('single instantiation', {
					in() {
						// eslint-disable-next-line no-invalid-this
						function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
						const outerObj = {obj: {}};
						outerObj.obj.fn = fn.bind(outerObj, {extA: 1}, {extB: 2}, 123);
						return outerObj;
					},
					out: `(()=>{
						const a=(
								()=>{
									let a;
									return[
										(...b)=>a(...b),
										c=>a=c
									]
								}
							)(),
							b={
								obj:{
									fn:Object.defineProperties(a[0],{length:{value:2},name:{value:"bound fn"}})
								}
							};
						a[1](function fn(a,b,c,d,e){return[this,a,b,c,d,e]}.bind(b,{extA:1},{extB:2},123));
						return b
					})()`,
					validate(outerObj) {
						expect(outerObj).toBeObject();
						expect(outerObj).toContainAllKeys(['obj']);
						const {obj} = outerObj;
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
						expect(res[0]).toBe(outerObj);
						expect(res[1]).toEqual({extA: 1});
						expect(res[2]).toEqual({extB: 2});
						expect(res[3]).toBe(123);
						expect(res[4]).toBe(param1);
						expect(res[5]).toBe(param2);
					}
				});

				itSerializes('multiple instantiations', {
					in({ctx}) {
						// eslint-disable-next-line no-invalid-this
						function fn(v, w, x, y, z) { return [this, v, w, x, y, z]; }
						const extA = {extA: 2};
						const extBs = [{extB1: 11}, {extB2: 12}, {extB3: 13}];
						ctx.extBs = extBs;

						const arr = [];
						for (const extB of extBs) {
							arr.push({
								fn: fn.bind(arr, extA, extB, 123)
							});
						}
						return arr;
					},
					out: `(()=>{
						const a=(0,()=>{
								let a;
								return[
									(...b)=>a(...b),
									c=>a=c
								]
							}),
							b=a(),
							c=Object.defineProperties,
							d=function fn(a,b,c,d,e){return[this,a,b,c,d,e]},
							e={extA:2},
							f=a(),
							g=a(),
							h=[
								{fn:c(b[0],{length:{value:2},name:{value:"bound fn"}})},
								{fn:c(f[0],{length:{value:2},name:{value:"bound fn"}})},
								{fn:c(g[0],{length:{value:2},name:{value:"bound fn"}})}
							];
						b[1](d.bind(h,e,{extB1:11},123));
						f[1](d.bind(h,e,{extB2:12},123));
						g[1](d.bind(h,e,{extB3:13},123));
						return h
					})()`,
					validate(arr, {ctx: {extBs}}) {
						expect(arr).toBeArrayOfSize(3);
						expect(arr[0]).not.toBe(arr[1]);
						expect(arr[0]).not.toBe(arr[2]);
						expect(arr[1]).not.toBe(arr[2]);

						const extAs = arr.map((obj, index) => {
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
							expect(res[0]).toBe(arr);
							expect(res[1]).toEqual({extA: 2});
							expect(res[2]).toEqual(extBs[index]);
							expect(res[3]).toBe(123);
							expect(res[4]).toBe(param1);
							expect(res[5]).toBe(param2);
							return res[1];
						});

						expect(extAs[0]).toBe(extAs[1]);
						expect(extAs[0]).toBe(extAs[2]);
					}
				});
			});

			itSerializes('function', {
				in() {
					function fn() { return this; } // eslint-disable-line no-invalid-this
					return {
						fn,
						boundFn: fn.bind(fn)
					};
				},
				out: '(()=>{const a=function fn(){return this};return{fn:a,boundFn:a.bind(a)}})()',
				validate(obj) {
					expect(obj).toBeObject();
					expect(obj).toContainAllKeys(['fn', 'boundFn']);
					const {boundFn} = obj;
					expect(boundFn).toBeFunction();
					expect(boundFn.name).toBe('bound fn');
					expect(boundFn).toHaveLength(0);
					expect(boundFn()).toBe(obj.fn);
				}
			});
		});
	});

	describe('generators + async functions', () => {
		itSerializes('generator function', {
			in() {
				const extA = {extA: 1},
					extB = {extB: 2};
				return function*(x, y) {
					yield [extA, extB];
					return [this, x, y]; // eslint-disable-line no-invalid-this
				};
			},
			out: '((c,d)=>function*(a,b){yield[c,d];return[this,a,b]})({extA:1},{extB:2})',
			validate(out) {
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
			}
		});

		itSerializes('async function', {
			in() {
				const extA = {extA: 1},
					extB = {extB: 2};
				return async function(x, y) {
					await Promise.resolve();
					return [extA, extB, this, x, y]; // eslint-disable-line no-invalid-this
				};
			},
			out: `(
				(c,d)=>async function(a,b){
					await Promise.resolve();
					return[c,d,this,a,b]
				}
			)({extA:1},{extB:2})`,
			async validate(fn) {
				expect(fn).toBeFunction();
				const ctx = {},
					param1 = {},
					param2 = {};
				const res = await fn.call(ctx, param1, param2);
				expect(res).toEqual([{extA: 1}, {extB: 2}, {}, {}, {}]);
				expect(res[2]).toBe(ctx);
				expect(res[3]).toBe(param1);
				expect(res[4]).toBe(param2);
			}
		});

		itSerializes('async generator function', {
			in() {
				const extA = {extA: 1},
					extB = {extB: 2};
				return async function*(x, y) {
					await Promise.resolve();
					yield [extA, extB];
					return [this, x, y]; // eslint-disable-line no-invalid-this
				};
			},
			out: `(
				(c,d)=>async function*(a,b){
					await Promise.resolve();
					yield[c,d];
					return[this,a,b]
				}
			)({extA:1},{extB:2})`,
			async validate(out) {
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
			}
		});
	});

	describe('avoid var name clashes', () => {
		describe('with globals', () => {
			itSerializes('with mangled var names', {
				in() {
					return (x, y) => [a, x, y]; // eslint-disable-line no-undef
				},
				minify: true,
				inline: true,
				mangle: true,
				validateOutput(fn, {outputJs}) {
					expect(stripSourceMapComment(outputJs)).toBe('(b,c)=>[a,b,c]');
				}
			});

			itSerializes('with unmangled var names', {
				in() {
					const fn = (0, (x, y) => [a, x, y]); // eslint-disable-line no-undef
					return {a: fn, b: fn};
				},
				minify: true,
				inline: true,
				mangle: false,
				validateOutput(fn, {outputJs}) {
					expect(stripSourceMapComment(outputJs)).toBe(
						'(()=>{const a$0=(0,(x,y)=>[a,x,y]);return{a:a$0,b:a$0}})()'
					);
				}
			});
		});

		itSerializes('with function names', {
			in() {
				return (x, y) => function a() { return [x, y]; };
			},
			minify: true,
			inline: true,
			mangle: true,
			validateOutput(fn, {outputJs}) {
				expect(stripSourceMapComment(outputJs)).toBe('(b,c)=>function a(){return[b,c]}');
			}
		});

		itSerializes('with function names added by livepack', {
			in() {
				let a = function() { return a; };
				const fn = a;
				a = 123;
				return fn;
			},
			minify: true,
			inline: true,
			validateOutput(fn, {outputJs, mangle}) {
				expect(stripSourceMapComment(outputJs)).toBe(
					mangle
						? '(b=>function a(){return b})(123)'
						: '(a$0=>function a(){return a$0})(123)'
				);
			}
		});

		itSerializes('with globals with function names added by livepack', {
			in() {
				// eslint-disable-next-line object-shorthand
				return {console: function() { return console; }}.console;
			},
			minify: true,
			inline: true,
			validateOutput(fn, {outputJs}) {
				expect(stripSourceMapComment(outputJs)).toBe(
					'Object.defineProperties(function(){return console},{name:{value:"console"}})'
				);
			}
		});
	});

	describe('do not treat labels as variables', () => {
		itSerializes('in labels', {
			// Test `console` is not misinterpretted as referring to external var
			in() {
				let fn;
				// eslint-disable-next-line no-labels, no-label-var, no-unused-labels
				console: fn = (0, () => console);
				return fn;
			},
			out: '()=>console',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(console);
			}
		});

		itSerializes('in continue statements', {
			// Test `x` in `continue` statement is not misinterpretted as referring to external var `x`
			in() {
				const x = {}; // eslint-disable-line no-unused-vars
				return () => {
					x: for (let i = 0; i < 3; i++) { // eslint-disable-line no-labels, no-label-var
						continue x; // eslint-disable-line no-labels, no-extra-label
					}
				};
			},
			out: '()=>{x:for(let a=0;a<3;a++){continue x}}',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBeUndefined();
			}
		});

		itSerializes('in break statements', {
			// Test `x` in `break` statement is not misinterpretted as referring to external var `x`
			in() {
				const x = {}; // eslint-disable-line no-unused-vars
				return () => {
					x: for (let i = 0; i < 3; i++) { // eslint-disable-line no-labels, no-label-var
						break x; // eslint-disable-line no-labels, no-extra-label
					}
				};
			},
			out: '()=>{x:for(let a=0;a<3;a++){break x}}',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBeUndefined();
			}
		});
	});

	itSerializes('distinguish scopes and functions with same block IDs from different files', {
		in: () => require('./fixtures/function blocks/index.js'), // eslint-disable-line global-require
		out: `{
			inner1:(b=>a=>()=>[b,a])({extA1:1})({extB1:2}),
			inner2:(b=>a=>()=>[b,a])({extA2:3})({extB2:4}),
			inner3:(b=>a=>()=>[b,a])({extA3:5})({extB3:6})
		}`,
		validate(obj) {
			expect(obj).toBeObject();
			expect(obj).toContainAllKeys(['inner1', 'inner2', 'inner3']);
			const {inner1, inner2, inner3} = obj;
			expect(inner1).toBeFunction();
			expect(inner1()).toEqual([{extA1: 1}, {extB1: 2}]);
			expect(inner2).toBeFunction();
			expect(inner2()).toEqual([{extA2: 3}, {extB2: 4}]);
			expect(inner3).toBeFunction();
			expect(inner3()).toEqual([{extA3: 5}, {extB3: 6}]);
		}
	});

	describe('maintain name where', () => {
		itSerializes('unnamed function as object property', {
			in: () => ({a: (0, function() {})}),
			out: '{a:(0,function(){})}',
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['a']);
				const fn = obj.a;
				expect(fn).toBeFunction();
				expect(fn.name).toBe('');
			}
		});

		itSerializes('not valid JS identifier', {
			in: () => ({'0a': function() {}}['0a']),
			out: 'Object.defineProperties(function(){},{name:{value:"0a"}})',
			validate(fn) {
				expect(
					Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
				).toEqual(['length', 'name', 'prototype']);
				expect(fn.name).toBe('0a');
				expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		describe('descriptor altered', () => {
			itSerializes('value altered', {
				in() {
					function fn() {}
					Object.defineProperty(fn, 'name', {value: 'foo'});
					return fn;
				},
				out: 'function foo(){}',
				validate(fn) {
					expect(fn.name).toBe('foo');
					expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
				}
			});

			itSerializes('getter', {
				in() {
					function fn() {}
					// eslint-disable-next-line object-shorthand
					Object.defineProperty(fn, 'name', {get: function() { return 'foo'; }});
					return fn;
				},
				out: 'Object.defineProperties(function(){},{name:{get:function get(){return"foo"}}})',
				validate(fn) {
					expect(fn.name).toBe('foo');
					expect(Object.getOwnPropertyDescriptor(fn, 'name')).toEqual({
						get: expect.any(Function), set: undefined, enumerable: false, configurable: true
					});
				}
			});

			describe('properties altered', () => {
				describe.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
				)(
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => {
						// TODO Implement `itSerializesEqual.each()`
						itSerializes('has correct descriptor props', {
							in() {
								function fn() {}
								Object.defineProperty(fn, 'name', {value: 'fn', writable, enumerable, configurable});
								return fn;
							},
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn.name).toBe('fn');
								expect(fn).toHaveDescriptorModifiersFor('name', writable, enumerable, configurable);
							}
						});
					}
				);
			});
		});

		itSerializes('deleted', {
			in() {
				function fn() {}
				delete fn.name;
				return fn;
			},
			out: '(()=>{const a=(0,function(){});delete a.name;return a})()',
			validate(fn) {
				expect(fn.name).toBe('');
				expect(fn).not.toHaveOwnProperty('name');
			}
		});

		itSerializes('deleted and redefined (i.e. property order changed)', {
			in() {
				function fn() {}
				delete fn.name;
				Object.defineProperty(fn, 'name', {value: 'fn', configurable: true});
				return fn;
			},
			out: `(()=>{
				const a=function fn(){};
				delete a.name;
				Object.defineProperties(a,{name:{value:"fn",configurable:true}});
				return a
			})()`,
			validate(fn) {
				expect(
					Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
				).toEqual(['length', 'prototype', 'name']);
				expect(fn.name).toBe('fn');
				expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});
	});

	describe('maintain length where', () => {
		itSerializes('altered', {
			in() {
				function fn() {}
				Object.defineProperty(fn, 'length', {value: 2});
				return fn;
			},
			out: 'Object.defineProperties(function fn(){},{length:{value:2}})',
			validate(fn) {
				expect(
					Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
				).toEqual(['length', 'name', 'prototype']);
				expect(fn.length).toBe(2); // eslint-disable-line jest/prefer-to-have-length
				expect(fn).toHaveDescriptorModifiersFor('length', false, false, true);
			}
		});

		describe('descriptor altered', () => {
			itSerializes('getter', {
				in() {
					function fn() {}
					// eslint-disable-next-line object-shorthand
					Object.defineProperty(fn, 'length', {get: function() { return 2; }});
					return fn;
				},
				out: 'Object.defineProperties(function fn(){},{length:{get:function get(){return 2}}})',
				validate(fn) {
					expect(fn.length).toBe(2); // eslint-disable-line jest/prefer-to-have-length
					expect(Object.getOwnPropertyDescriptor(fn, 'length')).toEqual({
						get: expect.any(Function), set: undefined, enumerable: false, configurable: true
					});
				}
			});

			describe('properties altered', () => {
				describe.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)])
				)(
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => {
						// TODO Implement `itSerializesEqual.each()`
						itSerializes('has correct descriptor props', {
							in() {
								function fn() {}
								Object.defineProperty(fn, 'length', {value: 0, writable, enumerable, configurable});
								return fn;
							},
							validate(fn) {
								expect(fn).toBeFunction();
								expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
								expect(fn).toHaveDescriptorModifiersFor('length', writable, enumerable, configurable);
							}
						});
					}
				);
			});
		});

		itSerializes('deleted', {
			in() {
				function fn() {}
				delete fn.length;
				return fn;
			},
			out: '(()=>{const a=function fn(){};delete a.length;return a})()',
			validate(fn) {
				expect(fn.length).toBe(0); // eslint-disable-line jest/prefer-to-have-length
				expect(fn).not.toHaveOwnProperty('length');
			}
		});

		itSerializes('deleted and redefined (i.e. property order changed)', {
			in() {
				function fn() {}
				delete fn.length;
				Object.defineProperty(fn, 'length', {value: 0, configurable: true});
				return fn;
			},
			out: `(()=>{
				const a=function fn(){};
				delete a.length;
				Object.defineProperties(a,{length:{value:0,configurable:true}});
				return a
			})()`,
			validate(fn) {
				expect(
					Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
				).toEqual(['name', 'prototype', 'length']);
				expect(fn.name).toBe('fn');
				expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});
	});

	describe('with extra properties', () => {
		describe('non-circular', () => {
			describe('string keys', () => {
				itSerializes('without descriptors', {
					in() {
						const fn = function() {};
						fn.x = 1;
						fn.y = 2;
						return fn;
					},
					out: 'Object.assign(function fn(){},{x:1,y:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.x).toBe(1);
						expect(fn.y).toBe(2);
					}
				});

				itSerializes('with descriptors', {
					in() {
						const fn = function() {};
						Object.defineProperty(fn, 'x', {value: 1, enumerable: true});
						Object.defineProperty(fn, 'y', {value: 2, writable: true, configurable: true});
						return fn;
					},
					out: `Object.defineProperties(
						function fn(){},
						{
							x:{value:1,enumerable:true},
							y:{value:2,writable:true,configurable:true}
						}
					)`,
					validate(fn) {
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
				});

				itSerializes('with getter', {
					in() {
						const fn = function() {};
						Object.defineProperty(fn, 'x', {value: 1, enumerable: true});
						Object.defineProperty(fn, 'y', {get: (0, () => 2)});
						return fn;
					},
					out: `Object.defineProperties(
						function fn(){},
						{
							x:{value:1,enumerable:true},
							y:{get:(0,()=>2)}
						}
					)`,
					validate(fn) {
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
				});
			});

			describe('integer keys', () => {
				itSerializes('without descriptors', {
					in() {
						// 4294967294 is max integer key - integers above max are not moved to first position
						const input = function x() {};
						input.a = 1;
						input[0] = 2;
						input[5] = 3;
						input[4294967294] = 4;
						input[4294967295] = 5;
						return input;
					},
					out: 'Object.assign(function x(){},{0:2,5:3,4294967294:4,a:1,4294967295:5})',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(Object.getOwnPropertyNames(fn).filter(k => !['arguments', 'caller'].includes(k)))
							.toEqual(['0', '5', '4294967294', 'length', 'name', 'prototype', 'a', '4294967295']);
						expect(fn.a).toBe(1);
						expect(fn[0]).toBe(2);
						expect(fn[5]).toBe(3);
						expect(fn[4294967294]).toBe(4);
						expect(fn[4294967295]).toBe(5);
					}
				});

				itSerializes('with descriptors', {
					in() {
						const fn = function() {};
						fn.a = 1;
						Object.defineProperty(fn, 0, {value: 2, enumerable: true});
						Object.defineProperty(fn, 5, {value: 3, writable: true, configurable: true});
						Object.defineProperty(fn, 4294967294, {value: 4, enumerable: true});
						Object.defineProperty(fn, 4294967295, {value: 5, writable: true, configurable: true});
						return fn;
					},
					out: `Object.defineProperties(
						function fn(){},
						{
							0:{value:2,enumerable:true},
							5:{value:3,writable:true,configurable:true},
							4294967294:{value:4,enumerable:true},
							a:{value:1,writable:true,enumerable:true,configurable:true},
							4294967295:{value:5,writable:true,configurable:true}
						}
					)`,
					validate(fn) {
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
				});

				itSerializes('with getter', {
					in() {
						const fn = function() {};
						Object.defineProperty(fn, 0, {value: 1, enumerable: true});
						Object.defineProperty(fn, 5, {get: (0, () => 2)});
						return fn;
					},
					out: `Object.defineProperties(
						function fn(){},
						{
							0:{value:1,enumerable:true},
							5:{get:(0,()=>2)}
						}
					)`,
					validate(fn) {
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
				});
			});
		});

		describe('circular references', () => {
			describe('string keys', () => {
				itSerializes('without descriptors', {
					in() {
						const fn = function() {};
						fn.x = fn;
						fn.y = fn;
						return fn;
					},
					out: '(()=>{const a=function fn(){};a.x=a;a.y=a;return a})()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.x).toBe(fn);
						expect(fn.y).toBe(fn);
					}
				});

				itSerializes('with descriptors', {
					in() {
						const fn = function() {};
						Object.defineProperty(fn, 'x', {value: fn, enumerable: true});
						Object.defineProperty(fn, 'y', {value: fn, writable: true, configurable: true});
						return fn;
					},
					out: `(()=>{
						const a=function fn(){};
						Object.defineProperties(a,{
							x:{value:a,enumerable:true},
							y:{value:a,writable:true,configurable:true}
						});
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(
							Object.getOwnPropertyNames(fn)
								.filter(n => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(n))
						).toEqual(['x', 'y']);
						expect(fn.x).toBe(fn);
						expect(fn.y).toBe(fn);
						expect(fn).toHaveDescriptorModifiersFor('x', false, true, false);
						expect(fn).toHaveDescriptorModifiersFor('y', true, false, true);
					}
				});

				itSerializes('with getter', {
					in() {
						const fn = function() { return 2; };
						Object.defineProperty(fn, 'x', {value: 1, enumerable: true});
						Object.defineProperty(fn, 'y', {get: fn});
						return fn;
					},
					out: `(()=>{
						const a=Object.defineProperties,
							b=a(
								function fn(){return 2},
								{x:{value:1,enumerable:true}}
							);
						a(b,{y:{get:b}});
						return b
					})()`,
					validate(fn) {
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
				});
			});

			describe('integer keys', () => {
				itSerializes('without descriptors', {
					in() {
						const fn = function() {};
						fn[0] = fn;
						fn[5] = fn;
						return fn;
					},
					out: '(()=>{const a=function fn(){};a[0]=a;a[5]=a;return a})()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn[0]).toBe(fn);
						expect(fn[5]).toBe(fn);
					}
				});

				itSerializes('with descriptors', {
					in() {
						const fn = function() {};
						Object.defineProperty(fn, 0, {value: fn, enumerable: true});
						Object.defineProperty(fn, 5, {value: fn, writable: true, configurable: true});
						return fn;
					},
					out: `(()=>{
						const a=function fn(){};
						Object.defineProperties(a,{
							0:{value:a,enumerable:true},
							5:{value:a,writable:true,configurable:true}
						});
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(
							Object.getOwnPropertyNames(fn)
								.filter(n => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(n))
						).toEqual(['0', '5']);
						expect(fn[0]).toBe(fn);
						expect(fn[5]).toBe(fn);
						expect(fn).toHaveDescriptorModifiersFor(0, false, true, false);
						expect(fn).toHaveDescriptorModifiersFor(5, true, false, true);
					}
				});

				itSerializes('with getter', {
					in() {
						const fn = function() { return 2; };
						Object.defineProperty(fn, 0, {value: 1, enumerable: true});
						Object.defineProperty(fn, 5, {get: fn});
						return fn;
					},
					out: `(()=>{
						const a=Object.defineProperties,
							b=a(
								function fn(){return 2},
								{0:{value:1,enumerable:true}}
							);
						a(b,{5:{get:b}});
						return b
					})()`,
					validate(fn) {
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
				});
			});
		});
	});

	describe('inheritance', () => {
		itSerializes('no extra props', {
			in() {
				function F() {}
				Object.setPrototypeOf(F, function E() {}); // eslint-disable-line prefer-arrow-callback
				return F;
			},
			out: 'Object.setPrototypeOf(function F(){},function E(){})',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn.name).toBe('F');
				const proto = Object.getPrototypeOf(fn);
				expect(proto).toBeFunction();
				expect(proto.name).toBe('E');
			}
		});

		itSerializes('with extra props', {
			in() {
				function F() {}
				F.x = 1;
				F.y = 2;
				Object.setPrototypeOf(F, function E() {}); // eslint-disable-line prefer-arrow-callback
				return F;
			},
			out: `(()=>{
				const a=Object;
				return a.setPrototypeOf(
					a.assign(function F(){},{x:1,y:2}),
					function E(){}
				)
			})()`,
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn.name).toBe('F');
				const proto = Object.getPrototypeOf(fn);
				expect(proto).toBeFunction();
				expect(proto.name).toBe('E');
				expect(fn.x).toBe(1);
				expect(fn.y).toBe(2);
			}
		});

		itSerializes('with extra descriptor props', {
			in() {
				function F() {}
				Object.defineProperty(F, 'x', {value: 1, enumerable: true});
				Object.defineProperty(F, 'y', {value: 2, writable: true, enumerable: true});
				Object.setPrototypeOf(F, function E() {}); // eslint-disable-line prefer-arrow-callback
				return F;
			},
			out: `(()=>{
				const a=Object;
				return a.setPrototypeOf(
					a.defineProperties(
						function F(){},
						{
							x:{value:1,enumerable:true},
							y:{value:2,writable:true,enumerable:true}
						}
					),
					function E(){}
				)
			})()`,
			validate(fn) {
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
		});

		itSerializes('with prototype which itself inherits from another prototype', {
			in() {
				function F() {}
				function E() {}
				Object.setPrototypeOf(F, E);
				Object.setPrototypeOf(E, function D() {}); // eslint-disable-line prefer-arrow-callback
				return F;
			},
			out: `(()=>{
				const a=Object.setPrototypeOf;
				return a(
					function F(){},
					a(
						function E(){},
						function D(){}
					)
				)
			})()`,
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn.name).toBe('F');
				const proto = Object.getPrototypeOf(fn);
				expect(proto).toBeFunction();
				expect(proto.name).toBe('E');
				const proto2 = Object.getPrototypeOf(proto);
				expect(proto2).toBeFunction();
				expect(proto2.name).toBe('D');
			}
		});
	});
});
