/* --------------------
 * livepack module
 * Tests for functions
 * ------------------*/

'use strict';

// Imports
const {itSerializes, stripSourceMapComment, stripLineBreaks} = require('./support/index.js');

// Tests

const spy = jest.fn;

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
					// Testing object is wrapped in brackets
					// https://github.com/babel/babel/issues/12055
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

		describe('only serializes variable values which are read', () => {
			describe('assignment only', () => {
				itSerializes('direct assignment', {
					in() {
						let extA = {extA: 1}; // eslint-disable-line no-unused-vars
						return () => extA = 123; // eslint-disable-line no-return-assign
					},
					out: '(a=>()=>a=123)()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(123);
					}
				});

				itSerializes('array destructuring', {
					in() {
						let extA = {extA: 1}; // eslint-disable-line no-unused-vars
						return () => [extA] = [123]; // eslint-disable-line no-return-assign
					},
					out: '(a=>()=>[a]=[123])()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([123]);
					}
				});

				itSerializes('array rest destructuring', {
					in() {
						let extA = {extA: 1}; // eslint-disable-line no-unused-vars
						return () => [...extA] = [123]; // eslint-disable-line no-return-assign
					},
					out: '(a=>()=>[...a]=[123])()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual([123]);
					}
				});

				itSerializes('object destructuring', {
					in() {
						let extA = {extA: 1}; // eslint-disable-line no-unused-vars
						return () => ({x: extA} = {x: 123}); // eslint-disable-line no-return-assign
					},
					out: '(a=>()=>({x:a}={x:123}))()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual({x: 123});
					}
				});

				itSerializes('object rest destructuring', {
					in() {
						let extA = {extA: 1}; // eslint-disable-line no-unused-vars
						return () => ({...extA} = {x: 123}); // eslint-disable-line no-return-assign
					},
					out: '(a=>()=>({...a}={x:123}))()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toEqual({x: 123});
					}
				});

				itSerializes('for in', {
					in() {
						let extA = {extA: 1}; // eslint-disable-line no-unused-vars
						return () => {
							for (extA in {}) {} // eslint-disable-line no-empty
						};
					},
					out: '(a=>()=>{for(a in{}){}})()',
					validate(fn) {
						expect(fn).toBeFunction();
					}
				});

				itSerializes('for of', {
					in() {
						let extA = {extA: 1}; // eslint-disable-line no-unused-vars
						return () => {
							for (extA of []) {} // eslint-disable-line no-empty
						};
					},
					out: '(a=>()=>{for(a of[]){}})()',
					validate(fn) {
						expect(fn).toBeFunction();
					}
				});
			});

			describe('assignment and reading', () => {
				itSerializes('assignment with operator which reads (+=)', {
					in() {
						let extA = 100;
						return () => extA += 50; // eslint-disable-line no-return-assign
					},
					out: '(a=>()=>a+=50)(100)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(150);
					}
				});

				itSerializes('assignment with operator which reads (++)', {
					in() {
						let extA = 100;
						return () => ++extA;
					},
					out: '(a=>()=>++a)(100)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(101);
					}
				});

				itSerializes('assignment and read in separate functions', {
					in() {
						let extA = 100;
						return [
							() => extA,
							newExtA => extA = newExtA // eslint-disable-line no-return-assign
						];
					},
					out: `(()=>{
						const a=(
								b=>[
									()=>b,
									a=>b=a
								]
							)(100);
						return[a[0],a[1]]
					})()`,
					validate(arr) {
						expect(arr).toBeArrayOfSize(2);
						const [get, set] = arr;
						expect(get).toBeFunction();
						expect(set).toBeFunction();
						expect(get()).toBe(100);
						expect(set(200)).toBe(200);
						expect(get()).toBe(200);
					}
				});

				itSerializes('assignment in some scopes only', {
					in() {
						const fns = [11, 22, 33].map(num => ({
							get: (0, () => num),
							set: (0, newNum => num = newNum) // eslint-disable-line no-return-assign
						}));
						return [fns[0].set, fns[1].set, fns[2].set, fns[1].get];
					},
					out: `(()=>{
						const a=b=>[
								a=>b=a,
								()=>b
							],
							b=a(22);
						return[a()[0],b[0],a()[0],b[1]]
					})()`,
					validate(arr) {
						expect(arr).toBeArrayOfSize(4);
						arr.forEach(fn => expect(fn).toBeFunction());
						const [set1, set2, set3, get2] = arr;
						expect(get2()).toBe(22);
						expect(set1(4)).toBe(4);
						expect(set2(5)).toBe(5);
						expect(set3(6)).toBe(6);
						expect(get2()).toBe(5);
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
			out: '(g=>(e,f)=>(c,d)=>function(a,b){return[a,b,this,g,e,f,c,d]})({extA:1})({extB:2},{extC:3})({extD:4},{extE:5})',
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
				const a=(g=>(e,f)=>(c,d)=>function(a,b){return[a,b,this,g,e,f,c,d]})({extA:1});
				return[
					a({extB1:11},{extC1:12})({extD1:13},{extE:5}),
					a({extB2:21},{extC2:22})({extD2:23},{extE:5}),
					a({extB3:31},{extC3:32})({extD3:33},{extE:5})
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
			validate(fn) {
				expect(fn).toBeFunction();
				const param1 = {},
					param2 = {},
					ctx = {};
				const res = fn.call(ctx, param1, param2);
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
				out: '((a,b)=>()=>[b,a])(1)',
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
				out: '((a,b,c)=>()=>[b,c,a])(1)',
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

	// Test for https://github.com/overlookmotel/livepack/issues/259
	itSerializes('nested blocks where some scopes unused', {
		in() {
			const extA = {a: 1},
				extB = {b: 2};
			function outer(extC) {
				let getACD, getBCE;
				{
					const extD = {d: 4};
					getACD = (0, () => ({extA, extC, extD}));
				}
				{
					const extE = {e: 5};
					getBCE = (0, () => ({extB, extC, extE}));
				}
				return {getACD, getBCE};
			}
			return {
				getACD: outer({c: 3}).getACD,
				getBCE: outer({c: 30}).getBCE
			};
		},
		out: `(()=>{
			const a=((c,d)=>b=>[
					a=>()=>({extA:c,extC:b,extD:a}),
					a=>()=>({extB:d,extC:b,extE:a})
				])({a:1},{b:2});
			return{
				getACD:a({c:3})[0]({d:4}),
				getBCE:a({c:30})[1]({e:5})
			}
		})()`,
		validate({getACD, getBCE}) {
			expect(getACD).toBeFunction();
			expect(getACD()).toEqual({extA: {a: 1}, extC: {c: 3}, extD: {d: 4}});
			expect(getBCE).toBeFunction();
			expect(getBCE()).toEqual({extB: {b: 2}, extC: {c: 30}, extE: {e: 5}});
		}
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

		describe('referencing global scope', () => {
			itSerializes('in CommonJS context', {
				in: () => () => [this, exports], // eslint-disable-line no-invalid-this, node/exports-style
				out: '(()=>{const a={};return((a,b)=>()=>[a,b])(a,a)})()',
				validate(fn) {
					expect(fn).toBeFunction();
					const [_this, _exports] = fn();
					expect(_this).toBeObject();
					expect(_this).toBe(_exports);
				}
			});

			/*
			// TODO: Uncomment once https://github.com/overlookmotel/livepack/issues/353 resolved
			itSerializes('in script context', {
				in: () => (0, eval)('() => [this, globalThis]'), // eslint-disable-line no-eval
				out: '(a=>()=>[a,globalThis])(globalThis)',
				strictEnv: false,
				validate(fn) {
					expect(fn).toBeFunction();
					const [_this, _globalThis] = fn();
					expect(_this).toBeObject();
					expect(_this).toBe(_globalThis);
				}
			});
			*/
		});
	});

	describe('including `new.target`', () => {
		describe('referencing upper function scope', () => {
			describe('1 level up', () => {
				itSerializes('single instantiation', {
					in() {
						function outer() {
							return () => new.target;
						}
						// eslint-disable-next-line prefer-arrow-callback
						return Reflect.construct(outer, [], function() { return 1; });
					},
					out: '(a=>()=>a)(function(){return 1})',
					validate(fn) {
						expect(fn).toBeFunction();
						const target = fn();
						expect(target).toBeFunction();
						expect(target()).toBe(1);
					}
				});

				itSerializes('multiple instantiations', {
					in() {
						function outer() {
							return () => new.target;
						}
						// eslint-disable-next-line prefer-arrow-callback
						return [1, 2, 3].map(n => Reflect.construct(outer, [], function() { return n; }));
					},
					out: `(()=>{
						const a=a=>()=>a,
							b=a=>function(){return a};
						return[a(b(1)),a(b(2)),a(b(3))]
					})()`,
					validate(arr) {
						expect(arr).toBeArrayOfSize(3);
						arr.forEach((fn, index) => {
							expect(fn).toBeFunction();
							const target = fn();
							expect(target).toBeFunction();
							expect(target()).toEqual(index + 1);
						});
					}
				});

				describe('with clashing var names', () => {
					itSerializes('outer params', {
						in() {
							function outer(newTarget, newTarget$0) {
								return () => [new.target, newTarget, newTarget$0];
							}
							// eslint-disable-next-line prefer-arrow-callback
							return Reflect.construct(outer, [{extA: 2}, {extB: 3}], function() { return 1; });
						},
						out: '((a,b,c)=>()=>[a,b,c])(function(){return 1},{extA:2},{extB:3})',
						validate(fn) {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res[0]).toBeFunction();
							expect(res[0]()).toBe(1);
							expect(res[1]).toEqual({extA: 2});
							expect(res[2]).toEqual({extB: 3});
						}
					});

					itSerializes('inner params', {
						in() {
							function outer() {
								return (newTarget, newTarget$0) => [new.target, newTarget, newTarget$0];
							}
							// eslint-disable-next-line prefer-arrow-callback
							return Reflect.construct(outer, [], function() { return 1; });
						},
						out: '(c=>(a,b)=>[c,a,b])(function(){return 1})',
						validate(fn) {
							expect(fn).toBeFunction();
							const param1 = {},
								param2 = {};
							const res = fn(param1, param2);
							expect(res[0]).toBeFunction();
							expect(res[0]()).toBe(1);
							expect(res[1]).toBe(param1);
							expect(res[2]).toBe(param2);
						}
					});

					itSerializes('outer and inner params', {
						in() {
							function outer(newTarget) {
								return newTarget$0 => [new.target, newTarget, newTarget$0];
							}
							// eslint-disable-next-line prefer-arrow-callback
							return Reflect.construct(outer, [{extA: 2}], function() { return 1; });
						},
						out: '((b,c)=>a=>[b,c,a])(function(){return 1},{extA:2})',
						validate(fn) {
							expect(fn).toBeFunction();
							const param = {};
							const res = fn(param);
							expect(res[0]).toBeFunction();
							expect(res[0]()).toBe(1);
							expect(res[1]).toEqual({extA: 2});
							expect(res[2]).toBe(param);
						}
					});
				});
			});

			describe('2 levels up', () => {
				itSerializes('single instantiation', {
					in() {
						function outer() {
							return extA => () => [new.target, extA];
						}
						// eslint-disable-next-line prefer-arrow-callback
						return Reflect.construct(outer, [], function() { return 1; })({extA: 2});
					},
					out: '(b=>a=>()=>[b,a])(function(){return 1})({extA:2})',
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res[0]).toBeFunction();
						expect(res[0]()).toBe(1);
						expect(res[1]).toEqual({extA: 2});
					}
				});

				itSerializes('multiple instantiations', {
					in({ctx}) {
						function outer() {
							return extA => () => [new.target, extA];
						}
						const exts = [
							{n: 10, extA: {extA1: 11}},
							{n: 20, extA: {extA2: 21}},
							{n: 30, extA: {extA3: 31}}
						];
						ctx.exts = exts;
						return exts.map(
							// eslint-disable-next-line prefer-arrow-callback
							({n, extA}) => Reflect.construct(outer, [], function() { return n; })(extA)
						);
					},
					out: `(()=>{
						const a=b=>a=>()=>[b,a],
							b=a=>function(){return a};
							return[
								a(b(10))({extA1:11}),
								a(b(20))({extA2:21}),
								a(b(30))({extA3:31})
							]
					})()`,
					validate(arr, {ctx: {exts}}) {
						expect(arr).toBeArrayOfSize(3);
						arr.forEach((fn, index) => {
							expect(fn).toBeFunction();
							const res = fn();
							const {n, extA} = exts[index];
							expect(res[0]).toBeFunction();
							expect(res[0]()).toBe(n);
							expect(res[1]).toEqual(extA);
						});
					}
				});
			});

			describe('3 levels up', () => {
				itSerializes('single instantiation', {
					in() {
						function outer() {
							return extA => extB => () => [new.target, extA, extB];
						}
						// eslint-disable-next-line prefer-arrow-callback
						return Reflect.construct(outer, [], function() { return 1; })({extA: 2})({extB: 3});
					},
					out: '(c=>b=>a=>()=>[c,b,a])(function(){return 1})({extA:2})({extB:3})',
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn();
						expect(res[0]).toBeFunction();
						expect(res[0]()).toBe(1);
						expect(res[1]).toEqual({extA: 2});
						expect(res[2]).toEqual({extB: 3});
					}
				});

				itSerializes('multiple instantiations', {
					in({ctx}) {
						function outer() {
							return extA => extB => () => [new.target, extA, extB];
						}
						const exts = [
							{n: 10, extA: {extA1: 11}, extB: {extB1: 12}},
							{n: 20, extA: {extA2: 21}, extB: {extB2: 22}},
							{n: 30, extA: {extA3: 31}, extB: {extB3: 32}}
						];
						ctx.exts = exts;
						return exts.map(
							// eslint-disable-next-line prefer-arrow-callback
							({n, extA, extB}) => Reflect.construct(outer, [], function() { return n; })(extA)(extB)
						);
					},
					out: `(()=>{
						const a=c=>b=>a=>()=>[c,b,a],
							b=a=>function(){return a};
						return[
							a(b(10))({extA1:11})({extB1:12}),
							a(b(20))({extA2:21})({extB2:22}),
							a(b(30))({extA3:31})({extB3:32})
						]
					})()`,
					validate(arr, {ctx: {exts}}) {
						expect(arr).toBeArrayOfSize(3);
						arr.forEach((fn, index) => {
							expect(fn).toBeFunction();
							const res = fn();
							const {n, extA, extB} = exts[index];
							expect(res[0]).toBeFunction();
							expect(res[0]()).toBe(n);
							expect(res[1]).toEqual(extA);
							expect(res[2]).toEqual(extB);
						});
					}
				});
			});

			itSerializes('from object method', {
				in() {
					function Outer() {
						return {
							foo() {
								return () => new.target;
							}
						};
					}
					return new Outer().foo();
				},
				out: '(a=>()=>a)()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBeUndefined();
				}
			});

			describe('from class', () => {
				itSerializes('in class constructor', {
					in() {
						class C {
							constructor() {
								this.fn = () => new.target;
							}
						}
						// eslint-disable-next-line prefer-arrow-callback
						return Reflect.construct(C, [], function() { return 1; }).fn;
					},
					out: '(a=>()=>a)(function(){return 1})',
					validate(fn) {
						expect(fn).toBeFunction();
						const target = fn();
						expect(target).toBeFunction();
						expect(target()).toBe(1);
					}
				});

				itSerializes('in class prototype method', {
					in() {
						function Outer() {
							return class C {
								foo() { // eslint-disable-line class-methods-use-this
									return () => new.target;
								}
							};
						}
						const C = new Outer();
						return new C().foo();
					},
					out: '(a=>()=>a)()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBeUndefined();
					}
				});

				itSerializes('in class static method', {
					in() {
						function Outer() {
							return class C {
								static foo() {
									return () => new.target;
								}
							};
						}
						return new Outer().foo();
					},
					out: '(a=>()=>a)()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBeUndefined();
					}
				});

				itSerializes('in class prototype property', {
					in() {
						function Outer() {
							return class C {
								foo = (0, () => new.target);
							};
						}
						const C = new Outer();
						return new C().foo;
					},
					out: '(a=>()=>a)()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBeUndefined();
					}
				});

				itSerializes('in class static property', {
					in() {
						function Outer() {
							return class C {
								static foo = (0, () => new.target);
							};
						}
						return new Outer().foo;
					},
					out: '(a=>()=>a)()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBeUndefined();
					}
				});

				itSerializes('in class static block', {
					in() {
						function Outer() {
							let fn;
							class C { // eslint-disable-line no-unused-vars
								static {
									fn = (0, () => new.target);
								}
							}
							return fn;
						}
						return new Outer();
					},
					out: '(a=>()=>a)()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBeUndefined();
					}
				});

				itSerializes('in class prototype method key', {
					in() {
						function outer() {
							let fn;
							class C { // eslint-disable-line no-unused-vars
								[fn = (0, () => new.target)]() {} // eslint-disable-line class-methods-use-this
							}
							return fn;
						}
						// eslint-disable-next-line prefer-arrow-callback
						return Reflect.construct(outer, [], function() { return 1; });
					},
					out: '(a=>()=>a)(function(){return 1})',
					validate(fn) {
						expect(fn).toBeFunction();
						const target = fn();
						expect(target).toBeFunction();
						expect(target()).toBe(1);
					}
				});

				itSerializes('in class static method key', {
					in() {
						function outer() {
							let fn;
							class C { // eslint-disable-line no-unused-vars
								static [fn = (0, () => new.target)]() {}
							}
							return fn;
						}
						// eslint-disable-next-line prefer-arrow-callback
						return Reflect.construct(outer, [], function() { return 1; });
					},
					out: '(a=>()=>a)(function(){return 1})',
					validate(fn) {
						expect(fn).toBeFunction();
						const target = fn();
						expect(target).toBeFunction();
						expect(target()).toBe(1);
					}
				});

				itSerializes('in class prototype property key', {
					in() {
						function outer() {
							let fn;
							class C { // eslint-disable-line no-unused-vars
								[fn = (0, () => new.target)] = 1;
							}
							return fn;
						}
						// eslint-disable-next-line prefer-arrow-callback
						return Reflect.construct(outer, [], function() { return 1; });
					},
					out: '(a=>()=>a)(function(){return 1})',
					validate(fn) {
						expect(fn).toBeFunction();
						const target = fn();
						expect(target).toBeFunction();
						expect(target()).toBe(1);
					}
				});

				itSerializes('in class static property key', {
					in() {
						function outer() {
							let fn;
							class C { // eslint-disable-line no-unused-vars
								static [fn = (0, () => new.target)] = 1;
							}
							return fn;
						}
						// eslint-disable-next-line prefer-arrow-callback
						return Reflect.construct(outer, [], function() { return 1; });
					},
					out: '(a=>()=>a)(function(){return 1})',
					validate(fn) {
						expect(fn).toBeFunction();
						const target = fn();
						expect(target).toBeFunction();
						expect(target()).toBe(1);
					}
				});
			});
		});

		describe('referencing local scope', () => {
			itSerializes('in exported function', {
				in() {
					return function() { return new.target; };
				},
				out: 'function(){return new.target}',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBeUndefined();
					expect(new fn()).toBe(fn); // eslint-disable-line new-cap
				}
			});

			describe('in function nested inside exported function', () => {
				describe('when outer function is', () => {
					itSerializes('function declaration', {
						in() {
							function outer() {
								return function() { return new.target; };
							}
							return outer;
						},
						out: 'function outer(){return function(){return new.target}}',
						validate(outer) {
							expect(outer).toBeFunction();
							const fn = outer();
							expect(fn).toBeFunction();
							expect(fn()).toBeUndefined();
							expect(new fn()).toBe(fn); // eslint-disable-line new-cap
						}
					});

					itSerializes('function expression', {
						in() {
							return function() {
								return function() { return new.target; };
							};
						},
						out: 'function(){return function(){return new.target}}',
						validate(outer) {
							expect(outer).toBeFunction();
							const fn = outer();
							expect(fn).toBeFunction();
							expect(fn()).toBeUndefined();
							expect(new fn()).toBe(fn); // eslint-disable-line new-cap
						}
					});

					itSerializes('arrow function', {
						in() {
							return () => function() { return new.target; };
						},
						out: '()=>function(){return new.target}',
						validate(outer) {
							expect(outer).toBeFunction();
							const fn = outer();
							expect(fn).toBeFunction();
							expect(fn()).toBeUndefined();
							expect(new fn()).toBe(fn); // eslint-disable-line new-cap
						}
					});
				});

				describe('referencing exported function scope', () => {
					itSerializes('from 1 level up', {
						in() {
							return function() {
								return () => new.target;
							};
						},
						out: 'function(){return()=>new.target}',
						validate(outer) {
							expect(outer).toBeFunction();
							const fn = new outer(); // eslint-disable-line new-cap
							expect(fn).toBeFunction();
							expect(fn()).toBe(outer);
						}
					});

					itSerializes('from 2 levels up', {
						in() {
							return function() {
								return () => () => new.target;
							};
						},
						out: 'function(){return()=>()=>new.target}',
						validate(outer) {
							expect(outer).toBeFunction();
							const middle = new outer(); // eslint-disable-line new-cap
							expect(middle).toBeFunction();
							const inner = middle();
							expect(inner).toBeFunction();
							expect(inner()).toBe(outer);
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
											return () => new.target;
										};
									}
									return outer;
								},
								out: 'function outer(){return function(){return()=>new.target}}',
								validate(outer) {
									expect(outer).toBeFunction();
									const middle = outer();
									expect(middle).toBeFunction();
									const inner = new middle(); // eslint-disable-line new-cap
									expect(inner).toBeFunction();
									expect(inner()).toBe(middle);
								}
							});

							itSerializes('from 2 levels up', {
								in() {
									function outer() {
										return function() {
											return () => () => new.target;
										};
									}
									return outer;
								},
								out: 'function outer(){return function(){return()=>()=>new.target}}',
								validate(outer) {
									expect(outer).toBeFunction();
									const middle = outer();
									expect(middle).toBeFunction();
									const middle2 = new middle(); // eslint-disable-line new-cap
									expect(middle2).toBeFunction();
									const inner = middle2();
									expect(inner).toBeFunction();
									expect(inner()).toBe(middle);
								}
							});
						});

						describe('function expression', () => {
							itSerializes('from 1 level up', {
								in() {
									return function() {
										return function() {
											return () => new.target;
										};
									};
								},
								out: 'function(){return function(){return()=>new.target}}',
								validate(outer) {
									expect(outer).toBeFunction();
									const middle = outer();
									expect(middle).toBeFunction();
									const inner = new middle(); // eslint-disable-line new-cap
									expect(inner).toBeFunction();
									expect(inner()).toBe(middle);
								}
							});

							itSerializes('from 2 levels up', {
								in() {
									return function() {
										return function() {
											return () => () => new.target;
										};
									};
								},
								out: 'function(){return function(){return()=>()=>new.target}}',
								validate(outer) {
									expect(outer).toBeFunction();
									const middle = outer();
									expect(middle).toBeFunction();
									const middle2 = new middle(); // eslint-disable-line new-cap
									expect(middle2).toBeFunction();
									const inner = middle2();
									expect(inner).toBeFunction();
									expect(inner()).toBe(middle);
								}
							});
						});

						describe('arrow function', () => {
							itSerializes('from 1 level up', {
								in() {
									return () => (
										function() {
											return () => new.target;
										}
									);
								},
								out: '()=>function(){return()=>new.target}',
								validate(outer) {
									expect(outer).toBeFunction();
									const middle = outer();
									expect(middle).toBeFunction();
									const inner = new middle(); // eslint-disable-line new-cap
									expect(inner).toBeFunction();
									expect(inner()).toBe(middle);
								}
							});

							itSerializes('from 2 levels up', {
								in() {
									return () => (
										function() {
											return () => () => new.target;
										}
									);
								},
								out: '()=>function(){return()=>()=>new.target}',
								validate(outer) {
									expect(outer).toBeFunction();
									const middle = outer();
									expect(middle).toBeFunction();
									const middle2 = new middle(); // eslint-disable-line new-cap
									expect(middle2).toBeFunction();
									const inner = middle2();
									expect(inner).toBeFunction();
									expect(inner()).toBe(middle);
								}
							});
						});
					});
				});
			});
		});

		describe('referencing global scope', () => {
			itSerializes('in CommonJS context', {
				// Using a fixture because ESLint can't parse this file if included inline
				in: "'use strict'; module.exports = () => new.target;",
				out: '(a=>()=>a)()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBeUndefined();
				}
			});
		});
	});

	describe('including `super`', () => {
		describe('from class prototype method', () => {
			itSerializes('1 level up', {
				in() {
					class S {
						foo() { // eslint-disable-line class-methods-use-this
							return 1;
						}
					}
					class C extends S {
						getFoo() {
							return () => super.foo();
						}
					}
					return new C().getFoo();
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								getFoo(){
									return()=>Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this).call(this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b.prototype),"foo",a).call(a)
						])(),
						b=a[0],
						c=Object,
						d=c.setPrototypeOf,
						e=class S{},
						f=e.prototype,
						g=c.defineProperties,
						h=b.prototype;
					g(
						f,
						{
							foo:{
								value:{foo(){return 1}}.foo,
								writable:true,
								configurable:true
							}
						}
					);
					d(b,e);
					d(
						g(
							h,
							{
								getFoo:{value:a[1],writable:true,configurable:true}
							}
						),
						f
					);
					return a[2](c.create(h))
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('2 levels up', {
				in() {
					class S {
						foo() { // eslint-disable-line class-methods-use-this
							return 1;
						}
					}
					class C extends S {
						getFoo() {
							return () => () => super.foo();
						}
					}
					return new C().getFoo()();
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								getFoo(){
									return()=>()=>Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this).call(this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b.prototype),"foo",a).call(a)
						])(),
						b=a[0],
						c=Object,
						d=c.setPrototypeOf,
						e=class S{},
						f=e.prototype,
						g=c.defineProperties,
						h=b.prototype;
					g(
						f,
						{
							foo:{
								value:{foo(){return 1}}.foo,
								writable:true,
								configurable:true
							}
						}
					);
					d(b,e);
					d(
						g(
							h,
							{
								getFoo:{value:a[1],writable:true,configurable:true}
							}
						),
						f
					);
					return a[2](c.create(h))
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('handles change of prototype', {
				in() {
					class S {
						foo() { // eslint-disable-line class-methods-use-this
							return 1;
						}
					}
					class C extends S {
						getFoo() {
							return () => super.foo();
						}
					}
					return [C, new C().getFoo()];
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								getFoo(){
									return()=>Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this).call(this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b.prototype),"foo",a).call(a)
						])(),
						b=Object,
						c=b.setPrototypeOf,
						d=class S{},
						e=d.prototype,
						f=b.defineProperties,
						g=a[0],
						h=g.prototype;
					f(
						e,
						{
							foo:{
								value:{foo(){return 1}}.foo,
								writable:true,
								configurable:true
							}
						}
					);
					c(g,d);
					c(
						f(
							h,
							{
								getFoo:{value:a[1],writable:true,configurable:true}
							}
						),
						e
					);
					return[g,a[2](b.create(h))]
				})()`,
				validate([C, fn]) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
					Object.setPrototypeOf(C.prototype, {foo: () => 2});
					expect(fn()).toBe(2);
				}
			});

			itSerializes('with super getter', {
				in() {
					class S {
						get foo() {
							return this.x * 2;
						}
					}
					class C extends S {
						get foo() {
							return this.x * 3;
						}

						getFoo() {
							return () => super.foo;
						}
					}
					const c = new C();
					c.x = 5;
					return c.getFoo();
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								getFoo(){
									return()=>Reflect.get(Object.getPrototypeOf(b.prototype),"foo",this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b.prototype),"foo",a)
						])(),
						b=a[0],
						c=Object,
						d=c.setPrototypeOf,
						e=class S{},
						f=e.prototype,
						g=c.defineProperties,
						h=b.prototype;
					g(
						f,
						{
							foo:{get:{"get foo"(){return this.x*2}}["get foo"],configurable:true}
						}
					);
					d(b,e);
					d(
						g(
							h,
							{
								foo:{get:{"get foo"(){return this.x*3}}["get foo"],configurable:true},
								getFoo:{value:a[1],writable:true,configurable:true}
							}
						),
						f
					);
					return a[2](c.assign(c.create(h),{x:5}))
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(10);
				}
			});

			itSerializes('with super setter', {
				in() {
					class S {
						set foo(v) {
							this.x = v * 2;
						}
					}
					class C extends S {
						set foo(v) {
							this.x = v * 3;
						}

						setFoo() {
							return () => {
								super.foo = 5;
							};
						}
					}
					const c = new C();
					return {fn: c.setFoo(), c};
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								setFoo(){
									return()=>{
										Reflect.set(Object.getPrototypeOf(b.prototype),"foo",5,this)
									}
								}
							}.setFoo,
							a=>()=>{
								Reflect.set(Object.getPrototypeOf(b.prototype),"foo",5,a)
							}
						])(),
						b=a[0],
						c=Object,
						d=c.setPrototypeOf,
						e=class S{},
						f=e.prototype,
						g=c.defineProperties,
						h=b.prototype,
						i=c.create(h);
					g(
						f,
						{
							foo:{set:{"set foo"(a){this.x=a*2}}["set foo"],configurable:true}
						}
					);
					d(b,e);
					d(
						g(
							h,
							{
								foo:{set:{"set foo"(a){this.x=a*3}}["set foo"],configurable:true},
								setFoo:{value:a[1],writable:true,configurable:true}
							}
						),
						f
					);
					return{fn:a[2](i),c:i}
				})()`,
				validate({fn, c}) {
					expect(fn).toBeFunction();
					expect(c).toBeObject();
					expect(c.x).toBeUndefined();
					fn();
					expect(c.x).toBe(10);
				}
			});
		});

		describe('from class static method', () => {
			itSerializes('1 level up', {
				in() {
					class S {
						static foo() {
							return 1;
						}
					}
					class C extends S {
						static getFoo() {
							return () => super.foo();
						}
					}
					return C.getFoo();
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								getFoo(){
									return()=>Reflect.get(Object.getPrototypeOf(b),"foo",this).call(this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",a).call(a)
						])(),
						b=a[0],
						c=Object,
						d=c.defineProperties,
						e=c.setPrototypeOf,
						f=d(
							class S{},
							{
								foo:{
									value:{foo(){return 1}}.foo,
									writable:true,
									configurable:true
								}
							}
						);
					e(
						d(
							b,
							{
								getFoo:{value:a[1],writable:true,configurable:true}
							}
						),
						f
					);
					e(b.prototype,f.prototype);
					return a[2](b)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('2 levels up', {
				in() {
					class S {
						static foo() {
							return 1;
						}
					}
					class C extends S {
						static getFoo() {
							return () => () => super.foo();
						}
					}
					return C.getFoo()();
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								getFoo(){
									return()=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",this).call(this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",a).call(a)
						])(),
						b=a[0],
						c=Object,
						d=c.defineProperties,
						e=c.setPrototypeOf,
						f=d(
							class S{},
							{
								foo:{
									value:{foo(){return 1}}.foo,
									writable:true,
									configurable:true
								}
							}
						);
					e(
						d(
							b,
							{
								getFoo:{value:a[1],writable:true,configurable:true}
							}
						),
						f
					);
					e(b.prototype,f.prototype);
					return a[2](b)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('handles change of prototype', {
				in() {
					class S {
						static foo() {
							return 1;
						}
					}
					class C extends S {
						static getFoo() {
							return () => super.foo();
						}
					}
					return [C, C.getFoo()];
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								getFoo(){
									return()=>Reflect.get(Object.getPrototypeOf(b),"foo",this).call(this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",a).call(a)
						])(),
						b=Object,
						c=b.defineProperties,
						d=b.setPrototypeOf,
						e=c(
							class S{},
							{
								foo:{
									value:{foo(){return 1}}.foo,
									writable:true,
									configurable:true
								}
							}
						),
						f=a[0];
					d(
						c(
							f,
							{
								getFoo:{value:a[1],writable:true,configurable:true}
							}
						),
						e
					);
					d(f.prototype,e.prototype);
					return[f,a[2](f)]
				})()`,
				validate([C, fn]) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
					Object.setPrototypeOf(C, {foo: () => 2});
					expect(fn()).toBe(2);
				}
			});

			itSerializes('with super getter', {
				in() {
					class S {
						static get foo() {
							return this.x * 2;
						}
					}
					class C extends S {
						static get foo() {
							return this.x * 3;
						}

						static getFoo() {
							return () => super.foo;
						}
					}
					C.x = 5;
					return C.getFoo();
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								getFoo(){
									return()=>Reflect.get(Object.getPrototypeOf(b),"foo",this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",a)
						])(),
						b=a[0],
						c=Object,
						d=c.defineProperties,
						e=c.setPrototypeOf,
						f=d(
							class S{},
							{
								foo:{get:{"get foo"(){return this.x*2}}["get foo"],configurable:true}
							}
						);
					e(
						d(
							b,
							{
								foo:{get:{"get foo"(){return this.x*3}}["get foo"],configurable:true},
								getFoo:{value:a[1],writable:true,configurable:true},
								x:{value:5,writable:true,enumerable:true,configurable:true}
							}
						),
						f
					);
					e(b.prototype,f.prototype);
					return a[2](b)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(10);
				}
			});

			itSerializes('with super setter', {
				in() {
					class S {
						static set foo(v) {
							this.x = v * 2;
						}
					}
					class C extends S {
						static set foo(v) {
							this.x = v * 3;
						}

						static setFoo() {
							return () => {
								super.foo = 5;
							};
						}
					}
					return {fn: C.setFoo(), C};
				},
				out: `(()=>{
					const a=(b=>[
							b=class C{
								constructor(...a){
									return Reflect.construct(Object.getPrototypeOf(b),a,b)
								}
							},
							{
								setFoo(){
									return()=>{
										Reflect.set(Object.getPrototypeOf(b),"foo",5,this)
									}
								}
							}.setFoo,
							a=>()=>{
								Reflect.set(Object.getPrototypeOf(b),"foo",5,a)
							}
						])(),
						b=a[0],
						c=Object,
						d=c.defineProperties,
						e=c.setPrototypeOf,
						f=d(
							class S{},
							{
								foo:{set:{"set foo"(a){this.x=a*2}}["set foo"],configurable:true}
							}
						);
					e(
						d(
							b,
							{
								foo:{set:{"set foo"(a){this.x=a*3}}["set foo"],configurable:true},
								setFoo:{value:a[1],writable:true,configurable:true}
							}
						),
						f
					);
					e(b.prototype,f.prototype);
					return{fn:a[2](b),C:b}
				})()`,
				validate({fn, C}) {
					expect(fn).toBeFunction();
					expect(C).toBeFunction();
					expect(C.x).toBeUndefined();
					fn();
					expect(C.x).toBe(10);
				}
			});
		});

		describe('from object method', () => {
			itSerializes('1 level up', {
				in() {
					const obj = Object.setPrototypeOf(
						{
							getFoo() {
								return () => super.foo();
							}
						},
						{
							foo() {
								return 1;
							}
						}
					);
					return obj.getFoo();
				},
				out: `(()=>{
					const a=(b=>[
							a=>b=a,
							{
								getFoo(){
									return()=>Reflect.get(Object.getPrototypeOf(b),"foo",this).call(this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",a).call(a)
						])(),
						b=Object,
						c=b.assign(
							b.create({foo(){return 1}}),
							{getFoo:a[1]}
						);
					a[0](c);
					return a[2](c)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('2 levels up', {
				in() {
					const obj = Object.setPrototypeOf(
						{
							getFoo() {
								return () => () => super.foo();
							}
						},
						{
							foo() {
								return 1;
							}
						}
					);
					return obj.getFoo()();
				},
				out: `(()=>{
					const a=(b=>[
							a=>b=a,
							{
								getFoo(){
									return()=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",this).call(this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",a).call(a)
						])(),
						b=Object,
						c=b.assign(
							b.create({foo(){return 1}}),
							{getFoo:a[1]}
						);
					a[0](c);
					return a[2](c)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
				}
			});

			itSerializes('handles change of prototype', {
				in() {
					const obj = Object.setPrototypeOf(
						{
							getFoo() {
								return () => super.foo();
							}
						},
						{
							foo() {
								return 1;
							}
						}
					);
					return [obj, obj.getFoo()];
				},
				out: `(()=>{
					const a=(b=>[
							a=>b=a,
							{
								getFoo(){
									return()=>Reflect.get(Object.getPrototypeOf(b),"foo",this).call(this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",a).call(a)
						])(),
						b=Object,
						c=b.assign(
							b.create({foo(){return 1}}),
							{getFoo:a[1]}
						);
					a[0](c);
					return[c,a[2](c)]
				})()`,
				validate([obj, fn]) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(1);
					Object.setPrototypeOf(obj, {foo: () => 2});
					expect(fn()).toBe(2);
				}
			});

			itSerializes('with super getter', {
				in() {
					const obj = Object.setPrototypeOf(
						{
							get foo() {
								return this.x * 3;
							},
							getFoo() {
								return () => super.foo;
							},
							x: 5
						},
						{
							get foo() {
								return this.x * 2;
							}
						}
					);
					return obj.getFoo();
				},
				out: `(()=>{
					const a=(b=>[
							a=>b=a,
							{
								getFoo(){
									return()=>Reflect.get(Object.getPrototypeOf(b),"foo",this)
								}
							}.getFoo,
							a=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",a)
						])(),
						b=Object,
						c=b.create(
							b.defineProperties(
								{},
								{
									foo:{get:{"get foo"(){return this.x*2}}["get foo"],enumerable:true,configurable:true}
								}
							),
							{
								foo:{get:{"get foo"(){return this.x*3}}["get foo"],enumerable:true,configurable:true},
								getFoo:{value:a[1],writable:true,enumerable:true,configurable:true},
								x:{value:5,writable:true,enumerable:true,configurable:true}
							}
						);
					a[0](c);
					return a[2](c)
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn()).toBe(10);
				}
			});

			itSerializes('with super setter', {
				in() {
					const obj = Object.setPrototypeOf(
						{
							set foo(v) {
								this.x = v * 3;
							},
							setFoo() {
								return () => {
									super.foo = 5;
								};
							}
						},
						{
							set foo(v) {
								this.x = v * 2;
							}
						}
					);
					return {fn: obj.setFoo(), obj};
				},
				out: `(()=>{
					const a=(b=>[
							a=>b=a,
							{
								setFoo(){
									return()=>{Reflect.set(Object.getPrototypeOf(b),"foo",5,this)}
								}
							}.setFoo,
							a=>()=>{Reflect.set(Object.getPrototypeOf(b),"foo",5,a)}
						])(),
						b=Object,
						c=b.create(
							b.defineProperties(
								{},
								{
									foo:{set:{"set foo"(a){this.x=a*2}}["set foo"],enumerable:true,configurable:true}
								}
							),
							{
								foo:{set:{"set foo"(a){this.x=a*3}}["set foo"],enumerable:true,configurable:true},
								setFoo:{value:a[1],writable:true,enumerable:true,configurable:true}
							}
						);
					a[0](c);
					return{fn:a[2](c),obj:c}
				})()`,
				validate({fn, obj}) {
					expect(fn).toBeFunction();
					expect(obj).toBeObject();
					expect(obj.x).toBeUndefined();
					fn();
					expect(obj.x).toBe(10);
				}
			});
		});

		itSerializes('within extends clause of another class', {
			in() {
				const obj = Object.setPrototypeOf(
					{
						getFoo() {
							let f;
							class Y {
								foo() { // eslint-disable-line class-methods-use-this
									return 2;
								}

								static foo() {
									return 3;
								}
							}
							class X extends (f = (0, () => super.foo()), Y) {} // eslint-disable-line no-unused-vars
							return f;
						}
					},
					{
						foo() {
							return 1;
						}
					}
				);
				return obj.getFoo();
			},
			out: `(()=>{
				const a=(b=>[
						a=>b=a,
						{
							getFoo(){
								let a;
								class Y{
									foo(){return 2}
									static foo(){return 3}
								}
								class X extends(
									a=(0,()=>Reflect.get(Object.getPrototypeOf(b),"foo",this).call(this)),Y
								){}
								return a
							}
						}.getFoo,
						a=>()=>Reflect.get(Object.getPrototypeOf(b),"foo",a).call(a)
					])(),
					b=Object,
					c=b.assign(
						b.create({foo(){return 1}}),
						{getFoo:a[1]}
					);
				a[0](c);
				return a[2](c)
			})()`,
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(1);
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

		describe('also referenced in another scope', () => {
			itSerializes('nested scope', {
				in() {
					const ext = {ext: 1},
						f = (0, () => ext),
						getF = (0, () => f),
						getG = (g => () => g)(f);
					return {getF, getG};
				},
				out: `(()=>{
					const a=((a,b)=>[
							b=(0,()=>a),
							()=>b
						])({ext:1});
					return{
						getF:a[1],
						getG:(a=>()=>a)(a[0])
					}
				})()`,
				validate({getF, getG}) {
					expect(getF).toBeFunction();
					const f = getF();
					expect(f).toBeFunction();
					expect(getG()).toBe(f);
					expect(f()).toEqual({ext: 1});
				}
			});

			itSerializes('sibling block', {
				in() {
					const {f, getF} = (() => {
						const ext = {ext: 1},
							f = (0, () => ext); // eslint-disable-line no-shadow
						return {
							f,
							getF: (0, () => f)
						};
					})();
					const getG = (g => () => g)(f);
					return {getF, getG};
				},
				out: `(()=>{
					const a=((a,b)=>[
							b=(0,()=>a),
							()=>b
						])({ext:1});
					return{
						getF:a[1],
						getG:(a=>()=>a)(a[0])
					}
				})()`,
				validate({getF, getG}) {
					expect(getF).toBeFunction();
					const f = getF();
					expect(f).toBeFunction();
					expect(getG()).toBe(f);
					expect(f()).toEqual({ext: 1});
				}
			});

			itSerializes('another var in different scope in same block', {
				in() {
					function outer(otherF) {
						const ext = {ext: 1},
							f = (0, () => ext),
							g = otherF;
						return {
							f,
							getF: (0, () => f),
							getG: (0, () => g)
						};
					}
					const {f, getF} = outer(),
						{getG} = outer(f);
					return {getF, getG};
				},
				out: `(()=>{
					const a=(a,b,c)=>[
							a=>c=a,
							b=(0,()=>a),
							()=>b,
							()=>c
						],
						b=a({ext:1}),
						c=a();
					c[0](b[1]);
					return{
						getF:b[2],
						getG:c[3]
					}
				})()`,
				validate({getF, getG}) {
					expect(getF).toBeFunction();
					const f = getF();
					expect(f).toBeFunction();
					expect(getG()).toBe(f);
					expect(f()).toEqual({ext: 1});
				}
			});
		});

		describe('in same scope', () => {
			describe('consistently (not injected)', () => {
				itSerializes('single instantiation', {
					in() {
						const extA = {extA: 1};
						function other() { return extA; }
						return function inner() { return [extA, other]; };
					},
					out: `
						((a,b)=>(
							b=function other(){return a},
							function inner(){return[a,b]}
						))({extA:1})
					`,
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
						function outer(ext) {
							const extA = ext;
							function other() { return extA; }
							return function inner() { return [extA, other]; };
						}
						const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
						ctx.extAs = extAs;
						return extAs.map(extA => outer(extA));
					},
					out: `(()=>{
						const a=(a,b)=>(
								b=function other(){return a},
								function inner(){return[a,b]}
							);
						return[a({extA1:1}),a({extA2:2}),a({extA3:3})]
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

			itSerializes(
				'consistently across multiple instantiations where not always accessed (not injected)',
				{
					in() {
						function outer(ext) {
							const extA = ext;
							function other() { return extA; }
							return {
								getOther: (0, () => other),
								getExt: (0, () => extA)
							};
						}
						const {getOther} = outer({extA1: 1}),
							{getOther: getOther2} = outer({extA2: 2}),
							{getExt} = outer({extA3: 3});
						return {getOther, getOther2, getExt};
					},
					out: `(()=>{
						const a=(a,b)=>(
								b=function other(){return a},
								[()=>b,()=>a]
							);
						return{
							getOther:a({extA1:1})[0],
							getOther2:a({extA2:2})[0],
							getExt:a({extA3:3})[1]
						}
					})()`,
					validate({getOther, getOther2, getExt}) {
						expect(getOther).toBeFunction();
						const other = getOther();
						expect(other).toBeFunction();
						expect(other()).toEqual({extA1: 1});

						expect(getOther2).toBeFunction();
						const other2 = getOther2();
						expect(other2).toBeFunction();
						expect(other2()).toEqual({extA2: 2});

						expect(getExt).toBeFunction();
						expect(getExt()).toEqual({extA3: 3});
					}
				}
			);

			describe(
				'multiple instantiations where scope var is function defined in scope only sometimes (injected)',
				() => {
					itSerializes('and other times another value', {
						in() {
							function outer(obj) {
								const ext = obj;
								const other = ext.extA === 1
									? function other() { return ext; }
									: {extB: 3};
								return function inner() { return [ext, other]; };
							}
							return [outer({extA: 1}), outer({extA: 2})];
						},
						out: `(()=>{
							const a=(a,b)=>[
									a=>b=a,
									function other(){return a},
									function inner(){return[a,b]}
								],
								b=a({extA:1});
							b[0](b[1]);
							return[b[2],a({extA:2},{extB:3})[2]]
						})()`,
						validate(arr) {
							expect(arr).toBeArrayOfSize(2);
							const [inner1, inner2] = arr;
							expect(inner1).toBeFunction();
							const res1 = inner1();
							expect(res1).toBeArrayOfSize(2);
							const [ext1, other1] = res1;
							expect(ext1).toEqual({extA: 1});
							expect(other1).toBeFunction();
							expect(other1()).toBe(ext1);

							expect(inner2).toBeFunction();
							expect(inner2()).toEqual([{extA: 2}, {extB: 3}]);
						}
					});

					itSerializes('and other times undefined', {
						in() {
							function outer(obj) {
								const ext = obj;
								const other = ext.extA === 1
									? function other() { return ext; }
									: undefined;
								return function inner() { return [ext, other]; };
							}
							return [outer({extA: 1}), outer({extA: 2})];
						},
						out: `(()=>{
							const a=(a,b)=>[
									a=>b=a,
									function other(){return a},
									function inner(){return[a,b]}
								],
								b=a({extA:1});
							b[0](b[1]);
							return[b[2],a({extA:2})[2]]
						})()`,
						validate(arr) {
							expect(arr).toBeArrayOfSize(2);
							const [inner1, inner2] = arr;
							expect(inner1).toBeFunction();
							const res1 = inner1();
							expect(res1).toBeArrayOfSize(2);
							const [ext1, other1] = res1;
							expect(ext1).toEqual({extA: 1});
							expect(other1).toBeFunction();
							expect(other1()).toBe(ext1);

							expect(inner2).toBeFunction();
							expect(inner2()).toEqual([{extA: 2}, undefined]);
						}
					});
				}
			);

			describe('consistently with extra props set on function (returned but not injected)', () => {
				describe('simple props', () => {
					itSerializes('single instantiation', {
						in() {
							const extA = {extA: 1};
							function other() { return extA; }
							other.x = 1;
							return function inner() { return [extA, other]; };
						},
						out: `(()=>{
							const a=(
									(a,b)=>[
										b=function other(){return a},
										function inner(){return[a,b]}
									]
								)({extA:1});
							Object.assign(a[0],{x:1});
							return a[1]
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							const [resA, other] = res;
							expect(resA).toEqual({extA: 1});
							expect(other).toBeFunction();
							expect(other()).toBe(resA);
							expect(other.x).toBe(1);
						}
					});

					itSerializes('multiple instantiations', {
						in({ctx}) {
							function outer(ext, index) {
								const extA = ext;
								function other() { return extA; }
								other.index = index;
								return function inner() { return [extA, other]; };
							}
							const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
							ctx.extAs = extAs;
							return extAs.map((extA, index) => outer(extA, index));
						},
						out: `(()=>{
							const a=(a,b)=>[
									b=function other(){return a},
									function inner(){return[a,b]}
								],
								b=a({extA1:1}),
								c=Object.assign,
								d=a({extA2:2}),
								e=a({extA3:3});
							c(b[0],{index:0});
							c(d[0],{index:1});
							c(e[0],{index:2});
							return[b[1],d[1],e[1]]
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
								expect(other.index).toBe(index);
								return other;
							});

							expect(others[0]).not.toBe(others[1]);
							expect(others[0]).not.toBe(others[2]);
						}
					});
				});

				describe('props requiring descriptor', () => {
					itSerializes('single instantiation', {
						in() {
							const extA = {extA: 1};
							function other() { return extA; }
							Object.defineProperty(other, 'x', {value: 1});
							return function inner() { return [extA, other]; };
						},
						out: `(()=>{
							const a=(
									(a,b)=>[
										b=function other(){return a},
										function inner(){return[a,b]}
									]
								)({extA:1});
							Object.defineProperties(a[0],{x:{value:1}});
							return a[1]
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							const [resA, other] = res;
							expect(resA).toEqual({extA: 1});
							expect(other).toBeFunction();
							expect(other()).toBe(resA);
							expect(other.x).toBe(1);
							expect(other).toHaveDescriptorModifiersFor('x', false, false, false);
						}
					});

					itSerializes('multiple instantiations', {
						in({ctx}) {
							function outer(ext, index) {
								const extA = ext;
								function other() { return extA; }
								Object.defineProperty(other, 'index', {value: index});
								return function inner() { return [extA, other]; };
							}
							const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
							ctx.extAs = extAs;
							return extAs.map((extA, index) => outer(extA, index));
						},
						out: `(()=>{
							const a=(a,b)=>[
									b=function other(){return a},
									function inner(){return[a,b]}
								],
								b=a({extA1:1}),
								c=Object.defineProperties,
								d=a({extA2:2}),
								e=a({extA3:3});
							c(b[0],{index:{value:0}});
							c(d[0],{index:{value:1}});
							c(e[0],{index:{value:2}});
							return[b[1],d[1],e[1]]
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
								expect(other.index).toBe(index);
								expect(other).toHaveDescriptorModifiersFor('index', false, false, false);
								return other;
							});

							expect(others[0]).not.toBe(others[1]);
							expect(others[0]).not.toBe(others[2]);
						}
					});
				});

				describe('circular props', () => {
					itSerializes('single instantiation', {
						in() {
							const extA = {extA: 1};
							function other() { return extA; }
							other.other = other;
							return function inner() { return [extA, other]; };
						},
						out: `(()=>{
							const a=(
									(a,b)=>[
										b=function other(){return a},
										function inner(){return[a,b]}
									]
								)({extA:1}),
								b=a[0];
							b.other=b;
							return a[1]
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							const [resA, other] = res;
							expect(resA).toEqual({extA: 1});
							expect(other).toBeFunction();
							expect(other()).toBe(resA);
							expect(other.other).toBe(other);
						}
					});

					itSerializes('multiple instantiations', {
						in({ctx}) {
							function outer(ext) {
								const extA = ext;
								function other() { return extA; }
								other.other = other;
								return function inner() { return [extA, other]; };
							}
							const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
							ctx.extAs = extAs;
							return extAs.map(extA => outer(extA));
						},
						out: `(()=>{
							const a=(a,b)=>[
									b=function other(){return a},
									function inner(){return[a,b]}
								],
								b=a({extA1:1}),
								c=b[0],
								d=a({extA2:2}),
								e=d[0],
								f=a({extA3:3}),
								g=f[0];
							c.other=c;
							e.other=e;
							g.other=g;
							return[b[1],d[1],f[1]]
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
								expect(other.other).toBe(other);
								return other;
							});

							expect(others[0]).not.toBe(others[1]);
							expect(others[0]).not.toBe(others[2]);
						}
					});
				});
			});

			describe(
				'consistently with extra props set on function prototype (returned but not injected)',
				() => {
					itSerializes('single instantiation', {
						in() {
							const extA = {extA: 1};
							function other() { return extA; }
							other.prototype.x = 1;
							return function inner() { return [extA, other]; };
						},
						out: `(()=>{
							const a=(
									(a,b)=>[
										b=function other(){return a},
										function inner(){return[a,b]}
									]
								)({extA:1});
							a[0].prototype.x=1;
							return a[1]
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							const res = fn();
							expect(res).toBeArrayOfSize(2);
							const [resA, other] = res;
							expect(resA).toEqual({extA: 1});
							expect(other).toBeFunction();
							expect(other()).toBe(resA);
							expect(other.prototype.x).toBe(1);
						}
					});

					itSerializes('multiple instantiations', {
						in({ctx}) {
							function outer(ext, index) {
								const extA = ext;
								function other() { return extA; }
								other.prototype.index = index;
								return function inner() { return [extA, other]; };
							}
							const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
							ctx.extAs = extAs;
							return extAs.map((extA, index) => outer(extA, index));
						},
						out: `(()=>{
							const a=(a,b)=>[
									b=function other(){return a},
									function inner(){return[a,b]}
								],
								b=a({extA1:1}),
								c=a({extA2:2}),
								d=a({extA3:3});
							b[0].prototype.index=0;
							c[0].prototype.index=1;
							d[0].prototype.index=2;
							return[b[1],c[1],d[1]]
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
								expect(other.prototype.index).toBe(index);
								return other;
							});

							expect(others[0]).not.toBe(others[1]);
							expect(others[0]).not.toBe(others[2]);
						}
					});
				}
			);
		});

		describe('when function in multiple vars in same scope', () => {
			describe('with vars referenced by within 1 function', () => {
				itSerializes('single instantiation', {
					in() {
						const extA = {extA: 1};
						const f = (0, () => extA),
							g = f;
						return () => [f, g];
					},
					out: `
						((a,b,c)=>(
							c=b=(0,()=>a),
							()=>[b,c]
						))({extA:1})
					`,
					validate(getter) {
						expect(getter).toBeFunction();
						const res = getter();
						expect(res).toBeArrayOfSize(2);
						const f = res[0];
						expect(f).toBeFunction();
						expect(res[1]).toBe(f);
						expect(f()).toEqual({extA: 1});
					}
				});

				itSerializes('multiple instantiations', {
					in({ctx}) {
						function outer(ext) {
							const extA = ext;
							const f = (0, () => extA),
								g = f;
							return () => [f, g];
						}
						const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
						ctx.extAs = extAs;
						return extAs.map(extA => outer(extA));
					},
					out: `(()=>{
						const a=(a,b,c)=>(
								c=b=(0,()=>a),
								()=>[b,c]
							);
						return[a({extA1:1}),a({extA2:2}),a({extA3:3})]
					})()`,
					validate(getters, {ctx: {extAs}}) {
						expect(getters).toBeArrayOfSize(3);
						const fns = getters.map((getter, index) => {
							expect(getter).toBeFunction();
							const res = getter();
							expect(res).toBeArrayOfSize(2);
							const f = res[0];
							expect(f).toBeFunction();
							expect(res[1]).toBe(f);
							expect(f()).toEqual(extAs[index]);
							return f;
						});

						expect(getters[0]).not.toBe(getters[1]);
						expect(getters[0]).not.toBe(getters[2]);
						expect(fns[0]).not.toBe(fns[1]);
						expect(fns[0]).not.toBe(fns[2]);
					}
				});
			});

			describe('with vars referenced by multiple functions', () => {
				itSerializes('single instantiation', {
					in() {
						const extA = {extA: 1};
						const f = (0, () => extA),
							g = f;
						return {
							getF: (0, () => f),
							getG: (0, () => g)
						};
					},
					out: `(()=>{
						const a=((a,b,c)=>(
								c=b=(0,()=>a),
								[()=>b,()=>c]
							))({extA:1});
						return{getF:a[0],getG:a[1]}
					})()`,
					validate({getF, getG}) {
						expect(getF).toBeFunction();
						const f = getF();
						expect(f).toBeFunction();
						expect(getG()).toBe(f);
						expect(f()).toEqual({extA: 1});
					}
				});

				itSerializes('multiple instantiations', {
					in({ctx}) {
						function outer(ext) {
							const extA = ext;
							const f = (0, () => extA),
								g = f;
							return {
								getF: (0, () => f),
								getG: (0, () => g)
							};
						}
						const extAs = [{extA1: 1}, {extA2: 2}, {extA3: 3}];
						ctx.extAs = extAs;
						return extAs.map(extA => outer(extA));
					},
					out: `(()=>{
						const a=(a,b,c)=>(
								c=b=(0,()=>a),
								[()=>b,()=>c]
							),
							b=a({extA1:1}),
							c=a({extA2:2}),
							d=a({extA3:3});
						return[{getF:b[0],getG:b[1]},{getF:c[0],getG:c[1]},{getF:d[0],getG:d[1]}]
					})()`,
					validate(objs, {ctx: {extAs}}) {
						expect(objs).toBeArrayOfSize(3);
						const fns = objs.map(({getF, getG}, index) => {
							expect(getF).toBeFunction();
							const f = getF();
							expect(f).toBeFunction();
							expect(getG()).toBe(f);
							expect(f()).toEqual(extAs[index]);
							return f;
						});

						expect(objs[0]).not.toBe(objs[1]);
						expect(objs[0]).not.toBe(objs[2]);
						expect(objs[0].getF).not.toBe(objs[1].getF);
						expect(objs[0].getF).not.toBe(objs[2].getF);
						expect(objs[0].getG).not.toBe(objs[1].getG);
						expect(objs[0].getG).not.toBe(objs[2].getG);
						expect(fns[0]).not.toBe(fns[1]);
						expect(fns[0]).not.toBe(fns[2]);
					}
				});
			});
		});

		itSerializes('in same block but different scope with circularity (injected)', {
			in() {
				function outer(ext) {
					const extA = ext;
					let other = (0, () => extA);
					const inner = (0, () => [extA, other]);
					const setOther = v => other = v; // eslint-disable-line no-return-assign
					return [inner, other, setOther];
				}

				const [inner1, other1, setOther1] = outer({ext: 1});
				const [inner2, other2, setOther2] = outer({ext: 2});
				setOther1(other2);
				setOther2(other1);
				return [inner1, inner2];
			},
			out: `(()=>{
				const a=(a,b)=>[
						a=>b=a,
						()=>a,
						()=>[a,b]
					],
					b=a({ext:1}),
					c=a({ext:2});
				c[0](b[1]);
				b[0](c[1]);
				return[b[2],c[2]]
			})()`,
			validate([inner1, inner2]) {
				expect(inner1).toBeFunction();
				const res1 = inner1();
				expect(res1).toBeArrayOfSize(2);
				const [ext1, other1] = res1;
				expect(ext1).toEqual({ext: 1});
				expect(other1).toBeFunction();

				expect(inner2).toBeFunction();
				const res2 = inner2();
				expect(res2).toBeArrayOfSize(2);
				const [ext2, other2] = res2;
				expect(ext2).toEqual({ext: 2});
				expect(other2).toBeFunction();

				expect(other1()).toBe(ext2);
				expect(other2()).toBe(ext1);
			}
		});

		describe('in nested scope (injected)', () => {
			itSerializes('single instantiation', {
				in() {
					const extA = {extA: 1};
					let other;
					if (true) { // eslint-disable-line no-constant-condition
						const extB = extA;
						other = (0, () => [extA, extB]);
					}
					return function inner() { return [extA, other]; };
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
					function outer(ext) {
						const extA = ext;
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

		describe('circular references between functions (neither injected)', () => {
			itSerializes('single instantiation', {
				in() {
					const extA = {extA: 1};
					function inner1() { return [extA, inner2]; }
					function inner2() { return [extA, inner1]; }
					return inner1;
				},
				out: `
					((a,b,c)=>(
						b=function inner2(){return[a,c]},
						c=function inner1(){return[a,b]}
					))({extA:1})
				`,
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
					const a=c=>(a,b)=>(
							a=function inner2(){return[c,b]},
							b=function inner1(){return[c,a]}
						);
					return[a({extA1:1})(),a({extA2:2})(),a({extA3:3})()]
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
							b=((a,b)=>[
								b=(0,()=>a),
								()=>b
							])(a);
						a.x=b[0];
						return b[1]
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
								b=(0,()=>a),
								()=>b
							],
							b={num:0},
							c=a(b),
							d={num:1},
							e=a(d),
							f={num:2},
							g=a(f);
						b.fn=c[0];
						d.fn=e[0];
						f.fn=g[0];
						return[c[1],e[1],g[1]]
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
									function x(){return b},
									b=function y(){return a}
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
								function x(){return b},
								b=function y(){return a}
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
			validate(obj) {
				expect(obj).toBeObject();
				expect(obj).toContainAllKeys(['fn']);
				const {fn} = obj;
				expect(fn).toBeFunction();
				const param = {};
				const fnInner = fn(param);
				expect(fnInner).toBeFunction();
				const res = fnInner();
				expect(res).toBeArrayOfSize(2);
				expect(res[0]).toBe(param);
				expect(res[1]).toBe(obj);
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
				out: `(()=>{
					const a=((a,b)=>[
							a=>b=a,
							()=>[b,a]
						])({x:1}),
						b={fn:a[1]};
					a[0](b);
					return b
				})()`,
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
					const a=(
							(a,b,c)=>[
								a=>b=a,
								a=>c=a,
								()=>[b,c,a]
							]
						)({x:1}),
						b={fn:a[2]},
						c={inner:b};
					a[0](c);
					a[1](b);
					return c
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

			describe('object destructuring with dynamic keys', () => {
				itSerializes('referencing no external vars', {
					in() {
						return ({['x' + 'y']: x}) => x; // eslint-disable-line no-useless-concat
					},
					out: '({["x"+"y"]:a})=>a',
					validate(fn) {
						expect(fn).toBeFunction();
						const param = {xy: {}};
						const res = fn(param);
						expect(res).toBe(param.xy);
					}
				});

				itSerializes('referencing external vars in function body', {
					in() {
						const extA = 10;
						return ({['x' + 'y']: x}) => x + extA; // eslint-disable-line no-useless-concat
					},
					out: '(b=>({["x"+"y"]:a})=>a+b)(10)',
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn({xy: 5});
						expect(res).toBe(15);
					}
				});

				itSerializes('referencing external vars in dynamic key', {
					in() {
						const extA = 'xy';
						return ({[extA]: x}) => x;
					},
					out: '(b=>({[b]:a})=>a)("xy")',
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn({xy: 5});
						expect(res).toBe(5);
					}
				});

				itSerializes('referencing external vars in dynamic key and function body', {
					in() {
						const extA = 'xy';
						return ({[extA]: x}) => x + extA;
					},
					out: '(b=>({[b]:a})=>a+b)("xy")',
					validate(fn) {
						expect(fn).toBeFunction();
						const res = fn({xy: 'ab'});
						expect(res).toBe('abxy');
					}
				});

				itSerializes('with function in dynamic key', {
					in() {
						const obj = {};
						obj.fn1 = ({[!(obj.fn2 = () => obj)]: x}) => x;
						return obj;
					},
					out: `(()=>{
						const a=(
								b=>[
									a=>b=a,
									({[!(b.fn2=()=>b)]:a})=>a
								]
							)(),
							b={fn1:a[1]};
						a[0](b);
						return b
					})()`,
					validate(obj) {
						expect(obj).toBeObject();
						const {fn1} = obj;
						expect(fn1).toBeFunction();
						const param = {};
						expect(fn1({false: param})).toBe(param);

						const {fn2} = obj;
						expect(fn2).toBeFunction();
						expect(fn2()).toBe(obj);
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

	describe('with param defaults', () => {
		describe('not referencing external vars', () => {
			itSerializes('arrow function', {
				in() {
					return (x = 1, y = 2) => [x, y];
				},
				out: '(a=1,b=2)=>[a,b]',
				validate(fn) {
					expect(fn).toBeFunction();
					const param = {};
					const res = fn(param);
					expect(res).toEqual([param, 2]);
					expect(res[0]).toBe(param);
				}
			});

			itSerializes('function expression', {
				in() {
					// eslint-disable-next-line no-invalid-this, prefer-rest-params
					return function(w = 1, x = 2, y = this, z = arguments) {
						return [w, x, y, z];
					};
				},
				out: 'function(a=1,b=2,c=this,d=arguments){return[a,b,c,d]}',
				validate(fn) {
					expect(fn).toBeFunction();
					const param = {},
						ctx = {ctx: 3};
					const res = fn.call(ctx, param);
					expect(res).toEqual([param, 2, ctx, expect.objectContaining({0: param, length: 1})]);
					expect(res[0]).toBe(param);
					expect(res[2]).toBe(ctx);
					expect(res[3]).toBeArguments();
					expect(res[3][0]).toBe(param);
				}
			});
		});

		describe('referencing external vars', () => {
			itSerializes('arrow function', {
				in() {
					function outer(extA, extB) {
						// eslint-disable-next-line no-invalid-this, prefer-rest-params
						return (w = extA, x = extB, y = this, z = arguments) => [w, x, y, z];
					}
					return outer.call({ctx: 3}, {extA: 1}, {extB: 2});
				},
				out: `(()=>{
					const a={extA:1},b={extB:2};
					return(
						(e,f,g,h)=>(a=f,b=g,c=e,d=h)=>[a,b,c,d]
					)({ctx:3},a,b,function(){return arguments}(a,b))
				})()`,
				validate(fn) {
					expect(fn).toBeFunction();
					const param = {param: 4};
					const res = fn.call({ctx: 5}, param);
					expect(res).toEqual([
						param, {extB: 2}, {ctx: 3},
						expect.objectContaining({0: {extA: 1}, 1: {extB: 2}, length: 2})
					]);
					expect(res[0]).toBe(param);
					expect(res[3]).toBeArguments();
					expect(res[3][1]).toBe(res[1]);
				}
			});

			itSerializes('function expression', {
				in() {
					function outer(extA, extB) {
						// eslint-disable-next-line no-invalid-this, prefer-rest-params
						return function(w = extA, x = extB, y = this, z = arguments) {
							return [w, x, y, z];
						};
					}
					return outer.call({ctx: 3}, {extA: 1}, {extB: 2});
				},
				out: '((e,f)=>function(a=e,b=f,c=this,d=arguments){return[a,b,c,d]})({extA:1},{extB:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					const param = {},
						ctx = {ctx: 5};
					const res = fn.call(ctx, param);
					expect(res).toEqual([param, {extB: 2}, ctx, expect.objectContaining({0: param, length: 1})]);
					expect(res[0]).toBe(param);
					expect(res[2]).toBe(ctx);
					expect(res[3]).toBeArguments();
					expect(res[3][0]).toBe(param);
				}
			});
		});

		describe('referencing external vars shadowed inside function', () => {
			itSerializes('arrow function', {
				in() {
					const extA = {extA: 1},
						extB = {extB: 2};
					return (x = extA, y = extB) => {
						const extA = 11, extB = 22; // eslint-disable-line no-shadow, one-var-declaration-per-line
						return [x, y, extA, extB];
					};
				},
				out: '((e,f)=>(a=e,b=f)=>{const c=11,d=22;return[a,b,c,d]})({extA:1},{extB:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					const param = {};
					const res1 = fn(param);
					expect(res1).toEqual([param, {extB: 2}, 11, 22]);
					expect(res1[0]).toBe(param);

					const res2 = fn(undefined, param);
					expect(res2).toEqual([{extA: 1}, param, 11, 22]);
					expect(res2[1]).toBe(param);
				}
			});

			itSerializes('function expression', {
				in() {
					const extA = {extA: 1},
						extB = {extB: 2};
					return function(x = extA, y = extB) {
						const extA = 11, extB = 22; // eslint-disable-line no-shadow, one-var-declaration-per-line
						return [x, y, extA, extB];
					};
				},
				out: '((e,f)=>function(a=e,b=f){const c=11,d=22;return[a,b,c,d]})({extA:1},{extB:2})',
				validate(fn) {
					expect(fn).toBeFunction();
					const param = {};
					const res1 = fn(param);
					expect(res1).toEqual([param, {extB: 2}, 11, 22]);
					expect(res1[0]).toBe(param);

					const res2 = fn(undefined, param);
					expect(res2).toEqual([{extA: 1}, param, 11, 22]);
					expect(res2[1]).toBe(param);
				}
			});
		});

		describe('with inline functions', () => {
			itSerializes('arrow function', {
				in() {
					return (x = () => 1, y = () => 2) => [x, y];
				},
				out: '(a=()=>1,b=()=>2)=>[a,b]',
				validate(fn) {
					expect(fn).toBeFunction();
					const param1 = {};
					const res = fn(param1);
					expect(res).toBeArrayOfSize(2);
					expect(res[0]).toBe(param1);
					const res2 = res[1];
					expect(res2).toBeFunction();
					expect(res2()).toBe(2);
				}
			});

			itSerializes('function expression', {
				in() {
					return function(x = () => 1, y = () => 2) {
						return [x, y];
					};
				},
				out: 'function(a=()=>1,b=()=>2){return[a,b]}',
				validate(fn) {
					expect(fn).toBeFunction();
					const param1 = {};
					const res = fn(param1);
					expect(res).toBeArrayOfSize(2);
					expect(res[0]).toBe(param1);
					const res2 = res[1];
					expect(res2).toBeFunction();
					expect(res2()).toBe(2);
				}
			});
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
			out: '(d=>c=>(a,b)=>[a,b,c,d])(123)(456)',
			validate(fn) {
				expect(fn).toBeFunction();
				const param1 = {},
					param2 = {};
				const res = fn(param1, param2);
				expect(res).toBeArrayOfSize(4);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(456);
				expect(res[3]).toBe(123);
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
			out: '(d=>c=>a=>b=>[a,b,c,d])(123)(456)',
			validate(fn) {
				expect(fn).toBeFunction();
				const param1 = {},
					param2 = {};
				const res = fn(param1)(param2);
				expect(res).toBeArrayOfSize(4);
				expect(res[0]).toBe(param1);
				expect(res[1]).toBe(param2);
				expect(res[2]).toBe(456);
				expect(res[3]).toBe(123);
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

	describe('referencing var created in `switch` statement', () => {
		itSerializes('1 level up', {
			in() {
				const ext = 1;
				let fn;
				switch (ext) { // eslint-disable-line default-case
					case 1:
						const ext = 2; // eslint-disable-line no-case-declarations, no-shadow
						fn = (0, () => ext);
				}
				return [fn, () => ext];
			},
			out: '[(a=>()=>a)(2),(a=>()=>a)(1)]',
			validate([getInnerExt, getOuterExt]) {
				expect(getInnerExt).toBeFunction();
				expect(getOuterExt).toBeFunction();
				expect(getInnerExt()).toBe(2);
				expect(getOuterExt()).toBe(1);
			}
		});

		itSerializes('2 levels up', {
			in() {
				const ext = 1;
				let fn;
				switch (ext) { // eslint-disable-line default-case
					case 1:
						const ext = 2; // eslint-disable-line no-case-declarations, no-shadow
						fn = (0, () => () => ext);
				}
				return [fn, () => ext];
			},
			out: '[(a=>()=>()=>a)(2),(a=>()=>a)(1)]',
			validate([getInnerExtGetter, getOuterExt]) {
				expect(getInnerExtGetter).toBeFunction();
				expect(getOuterExt).toBeFunction();
				const getInnerExt = getInnerExtGetter();
				expect(getInnerExt).toBeFunction();
				expect(getInnerExt()).toBe(2);
				expect(getOuterExt()).toBe(1);
			}
		});
	});

	describe('self-referencing functions', () => {
		describe('function expression', () => {
			itSerializes('referencing own function', {
				in() {
					return function x() {
						return x;
					};
				},
				out: '(a=>a=function x(){return a})()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('x');
					expect(fn()).toBe(fn);
				}
			});

			itSerializes('referencing upper function', {
				in() {
					return function x() {
						return () => x;
					};
				},
				out: '(a=>a=function x(){return()=>a})()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('x');
					const innerFn = fn();
					expect(innerFn).toBeFunction();
					expect(innerFn()).toBe(fn);
				}
			});

			describe('referencing own function with assigment', () => {
				itSerializes('strict mode function assignment throws error', {
					in() {
						return function x() {
							x = 1; // eslint-disable-line no-func-assign
						};
					},
					out: 'function x(){1,(()=>{const a=0;a=0})()}',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('x');
						expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('sloppy mode function assignment silently fails', {
					// eslint-disable-next-line no-eval
					in: () => (0, eval)(`
						(function x() {
							x = 1;
							return x;
						})
					`),
					out: '(a=>a=function x(){1;return a})()',
					strictEnv: false,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('x');
						expect(fn()).toBe(fn);
					}
				});
			});

			/* eslint-disable no-eval */
			describe('in function containing `eval()`', () => {
				itSerializes('referencing own function', {
					in: () => (0, eval)(`
						(function x() {
							eval('0');
							return x;
						})
					`),
					out: '(0,eval)("(function x(){eval(\\"0\\");return x})")',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('x');
						expect(fn()).toBe(fn);
					}
				});

				itSerializes('referencing upper function', {
					in: () => (0, eval)(`
						(function x() {
							eval('0');
							return () => x;
						})
					`),
					out: '(0,eval)("(function x(){eval(\\"0\\");return()=>x})")',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('x');
						const innerFn = fn();
						expect(innerFn).toBeFunction();
						expect(innerFn()).toBe(fn);
					}
				});

				describe('referencing own function with assigment', () => {
					itSerializes('strict mode function assignment throws error', {
						in: () => (0, eval)(`
							'use strict';
							(function x() {
								eval('0');
								x = 1;
							})
						`),
						out: '(0,eval)("\\"use strict\\";(function x(){eval(\\"0\\");x=1})")',
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('x');
							expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						}
					});

					itSerializes('sloppy mode function assignment silently fails', {
						in: () => (0, eval)(`
							(function x() {
								eval('0');
								x = 1;
								return x;
							})
						`),
						out: '(0,eval)("(function x(){eval(\\"0\\");x=1;return x})")',
						strictEnv: false,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('x');
							expect(fn()).toBe(fn);
						}
					});
				});
			});
			/* eslint-enable no-eval */

			describe('with name', () => {
				describe('changed', () => {
					itSerializes('simple case', {
						in() {
							const fn = function fn() { return fn; };
							Object.defineProperty(fn, 'name', {value: 'newName'});
							return fn;
						},
						out: '(a=>a=function newName(){return a})()',
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
							const fn = function fn() { return [fn, ext]; };
							Object.defineProperty(fn, 'name', {value: 'ext'});
							return fn;
						},
						out: '(b=>a=>a=function ext(){return[a,b]})(1)()',
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
							const fn = function fn() {
								const int = 1;
								return [fn, int];
							};
							Object.defineProperty(fn, 'name', {value: 'int'});
							return fn;
						},
						out: '(b=>b=function int(){const a=1;return[b,a]})()',
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
							const fn = function fn() {
								return [fn, console];
							};
							Object.defineProperty(fn, 'name', {value: 'console'});
							return fn;
						},
						// TODO: This output should be one-liner - `const a` is not required
						out: `(()=>{
							const a=(a=>a=(0,function(){return[a,console]}))();
							Object.defineProperties(a,{name:{value:"console"}});
							return a
						})()`,
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
							const fn = function fn() {
								function int() { return 2; }
								return [fn, int];
							};
							Object.defineProperty(fn, 'name', {value: 'int'});
							return fn;
						},
						out: '(a=>a=function int(){function int(){return 2}return[a,int]})()',
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
							const fn = function fn() { return fn; };
							Object.defineProperty(fn, 'name', {value: 'new-name'});
							return fn;
						},
						// TODO: This output should be one-liner - `const a` is not required
						out: `(()=>{
							const a=(a=>a=(0,function(){return a}))();
							Object.defineProperties(a,{name:{value:"new-name"}});
							return a
						})()`,
						validate(fn) {
							expect(fn).toBeFunction();
							expect(fn.name).toBe('new-name');
							expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
							expect(fn()).toBe(fn);
						}
					});

					itSerializes('to a non-string', {
						in() {
							const fn = function fn() { return fn; };
							Object.defineProperty(fn, 'name', {value: {x: 1}});
							return fn;
						},
						// TODO: This output should be one-liner - `const a` is not required
						out: `(()=>{
							const a=(a=>a=(0,function(){return a}))();
							Object.defineProperties(a,{name:{value:{x:1}}});
							return a
						})()`,
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
						const fn = function fn() { return fn; };
						delete fn.name;
						return fn;
					},
					out: '(()=>{const a=(a=>a=(0,function(){return a}))();delete a.name;return a})()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn).not.toHaveOwnProperty('name');
						expect(fn.name).toBe('');
						expect(fn()).toBe(fn);
					}
				});

				itSerializes('deleted and redefined (i.e. property order changed)', {
					in() {
						const fn = function fn() { return fn; };
						delete fn.name;
						Object.defineProperty(fn, 'name', {value: 'fn', configurable: true});
						return fn;
					},
					// TODO: Output could be a little more compact. No need for `fn` name in `function fn(){}`.
					out: `(()=>{
						const a=(a=>a=function fn(){return a})();
						delete a.name;
						Object.defineProperties(a,{name:{value:"fn",configurable:true}});
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('fn');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						expect(
							Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
						).toEqual(['length', 'prototype', 'name']);
						expect(fn()).toBe(fn);
					}
				});
			});
		});

		describe('function declaration', () => {
			itSerializes('referencing own function', {
				in() {
					function x() {
						return x;
					}
					return x;
				},
				out: '(a=>a=function x(){return a})()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('x');
					expect(fn()).toBe(fn);
				}
			});

			itSerializes('referencing upper function', {
				in() {
					function x() {
						return () => x;
					}
					return x;
				},
				out: '(a=>a=function x(){return()=>a})()',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('x');
					const innerFn = fn();
					expect(innerFn).toBeFunction();
					expect(innerFn()).toBe(fn);
				}
			});

			itSerializes('where var overridden', {
				in() {
					function x() {
						return x;
					}
					const f = x;
					x = 1; // eslint-disable-line no-func-assign
					return f;
				},
				out: '(a=>function x(){return a})(1)',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('x');
					expect(fn()).toBe(1);
				}
			});

			itSerializes('setting var internally', {
				in() {
					function x() {
						const fn = x;
						x = 1; // eslint-disable-line no-func-assign
						return fn;
					}
					return () => x;
				},
				out: '(b=>(b=function x(){const a=b;b=1;return a},()=>b))()',
				validate(getX) {
					expect(getX).toBeFunction();
					const fn = getX();
					expect(fn.name).toBe('x');
					expect(fn()).toBe(fn);
					expect(getX()).toBe(1);
					expect(fn()).toBe(1);
				}
			});

			/* eslint-disable no-eval */
			describe('function containing `eval()`', () => {
				itSerializes('referencing own function', {
					in: () => (0, eval)(`
						function x() {
							eval('0');
							return x;
						}
						x;
					`),
					// TODO: This should be output as a one-liner. No need for `a` to be a separate var.
					out: `(()=>{
						const a=(0,eval)("x=>x=(0,function(){eval(\\"0\\");return x})")();
						Object.defineProperties(a,{name:{value:"x"}});
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('x');
						expect(fn()).toBe(fn);
					}
				});

				itSerializes('referencing own function with assigment', {
					in: () => (0, eval)(`
						function x() {
							eval('0');
							x = 1;
							return x;
						}
						({x, getX: (0, () => x)})
					`),
					// TODO: This output should be shorter. No need for the var `b`.
					out: `(()=>{
						const a=(0,eval)("x=>[x=(0,function(){eval(\\"0\\");x=1;return x}),()=>x]")(),
							b=a[0];
						Object.defineProperties(b,{name:{value:"x"}});
						return{
							x:b,
							getX:a[1]
						}
					})()`,
					validate({x, getX}) {
						expect(x).toBeFunction();
						expect(x.name).toBe('x');
						expect(x).toHaveDescriptorModifiersFor('name', false, false, true);
						expect(getX).toBeFunction();
						expect(getX()).toBe(x);
						expect(x()).toBe(1);
						expect(getX()).toBe(1);
					}
				});
			});
			/* eslint-enable no-eval */

			describe('with name', () => {
				describe('changed', () => {
					itSerializes('simple case', {
						in() {
							function fn() { return fn; }
							Object.defineProperty(fn, 'name', {value: 'newName'});
							return fn;
						},
						out: '(a=>a=function newName(){return a})()',
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
						out: '((a,b)=>b=function ext(){return[b,a]})(1)',
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
						out: '(b=>b=function int(){const a=1;return[b,a]})()',
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
						out: `(()=>{
							const a=(a=>a=(0,function(){return[a,console]}))();
							Object.defineProperties(a,{name:{value:"console"}});
							return a
						})()`,
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
						out: '(a=>a=function int(){function int(){return 2}return[a,int]})()',
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
							function fn() { return fn; }
							Object.defineProperty(fn, 'name', {value: 'new-name'});
							return fn;
						},
						out: `(()=>{
							const a=(a=>a=(0,function(){return a}))();
							Object.defineProperties(a,{name:{value:"new-name"}});
							return a
						})()`,
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
						out: `(()=>{
							const a=(a=>a=(0,function(){return a}))();
							Object.defineProperties(a,{name:{value:{x:1}}});
							return a
						})()`,
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
					out: '(()=>{const a=(a=>a=(0,function(){return a}))();delete a.name;return a})()',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn).not.toHaveOwnProperty('name');
						expect(fn.name).toBe('');
						expect(fn()).toBe(fn);
					}
				});

				itSerializes('deleted and redefined (i.e. property order changed)', {
					in() {
						function fn() { return fn; }
						delete fn.name;
						Object.defineProperty(fn, 'name', {value: 'fn', configurable: true});
						return fn;
					},
					out: `(()=>{
						const a=(a=>a=function fn(){return a})();
						delete a.name;
						Object.defineProperties(a,{name:{value:"fn",configurable:true}});
						return a
					})()`,
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn.name).toBe('fn');
						expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
						expect(
							Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
						).toEqual(['length', 'prototype', 'name']);
						expect(fn()).toBe(fn);
					}
				});
			});
		});
	});

	describe('containing other functions', () => {
		itSerializes('with no scope access', {
			in() {
				return () => () => 1;
			},
			out: '()=>()=>1',
			validate(fn) {
				expect(fn).toBeFunction();
				const innerFn = fn();
				expect(innerFn).toBeFunction();
				expect(innerFn()).toBe(1);
			}
		});

		itSerializes('with scope external to outer function', {
			in() {
				const ext = 1;
				return () => () => ext;
			},
			out: '(a=>()=>()=>a)(1)',
			validate(fn) {
				expect(fn).toBeFunction();
				const innerFn = fn();
				expect(innerFn).toBeFunction();
				expect(innerFn()).toBe(1);
			}
		});

		itSerializes('with scope internal to outer function', {
			in() {
				return () => {
					const int = 1;
					return () => int;
				};
			},
			out: '()=>{const a=1;return()=>a}',
			validate(fn) {
				expect(fn).toBeFunction();
				const innerFn = fn();
				expect(innerFn).toBeFunction();
				expect(innerFn()).toBe(1);
			}
		});

		itSerializes('with scope nested inside outer function', {
			in() {
				return () => { // eslint-disable-line consistent-return
					if (true) { // eslint-disable-line no-constant-condition
						const int = 1;
						return () => int;
					}
				};
			},
			out: '()=>{if(true){const a=1;return()=>a}}',
			validate(fn) {
				expect(fn).toBeFunction();
				const innerFn = fn();
				expect(innerFn).toBeFunction();
				expect(innerFn()).toBe(1);
			}
		});

		describe('referencing other internal functions', () => {
			itSerializes('function declaration', {
				in() {
					return () => {
						function fn() {
							return [fn, () => fn];
						}
						return [fn, () => fn];
					};
				},
				out: '()=>{function fn(){return[fn,()=>fn]}return[fn,()=>fn]}',
				validate(outerFn) {
					expect(outerFn).toBeFunction();
					const [fn, getFn] = outerFn();
					expect(fn).toBeFunction();
					expect(getFn()).toBe(fn);
					const [fn2, getFn2] = fn();
					expect(fn2).toBe(fn);
					expect(getFn2()).toBe(fn);
				}
			});

			itSerializes('function expression', {
				in() {
					return () => function fn() {
						return [fn, () => fn];
					};
				},
				out: '()=>function fn(){return[fn,()=>fn]}',
				validate(outerFn) {
					expect(outerFn).toBeFunction();
					const fn = outerFn();
					expect(fn).toBeFunction();
					const [fn2, getFn] = fn();
					expect(fn2).toBe(fn);
					expect(getFn()).toBe(fn);
				}
			});
		});

		describe('containing loop with no body block', () => {
			itSerializes('for', {
				in() {
					return () => {
						const fns = [];
						for (const x of [1, 11, 21]) fns.push(() => x);
						return fns;
					};
				},
				out: '()=>{const a=[];for(const b of[1,11,21])a.push(()=>b);return a}',
				validate(fn) {
					expect(fn).toBeFunction();
					const innerFns = fn();
					expect(innerFns).toBeArrayOfSize(3);
					innerFns.forEach((innerFn, index) => {
						expect(innerFn).toBeFunction();
						expect(innerFn()).toBe(index * 10 + 1);
					});
				}
			});

			itSerializes('while', {
				in() {
					return () => {
						const fns = [];
						let x = -9;
						while ((x += 10) < 30) fns.push((y => () => y)(x)); // eslint-disable-line no-cond-assign
						return fns;
					};
				},
				out: '()=>{const a=[];let b=-9;while((b+=10)<30)a.push((c=>()=>c)(b));return a}',
				validate(fn) {
					expect(fn).toBeFunction();
					const innerFns = fn();
					expect(innerFns).toBeArrayOfSize(3);
					innerFns.forEach((innerFn, index) => {
						expect(innerFn).toBeFunction();
						expect(innerFn()).toBe(index * 10 + 1);
					});
				}
			});

			itSerializes('do while', {
				in() {
					return () => {
						const fns = [];
						let x = 1;
						do fns.push((y => () => y)(x)); while ((x += 10) < 30); // eslint-disable-line no-cond-assign
						return fns;
					};
				},
				out: '()=>{const a=[];let b=1;do a.push((c=>()=>c)(b));while((b+=10)<30);return a}',
				validate(fn) {
					expect(fn).toBeFunction();
					const innerFns = fn();
					expect(innerFns).toBeArrayOfSize(3);
					innerFns.forEach((innerFn, index) => {
						expect(innerFn).toBeFunction();
						expect(innerFn()).toBe(index * 10 + 1);
					});
				}
			});
		});
	});

	describe("defined in another function's params", () => {
		// These tests cover serialization, but also the transforms to functions made by instrumentation
		// for functions with complex params where initializing params moved into function body
		describe('can be serialized when defined in', () => {
			itSerializes('param default', {
				in() {
					const outer = (fn = (0, () => 1)) => fn;
					return outer();
				},
				out: '()=>1',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('');
					expect(fn()).toBe(1);
				}
			});

			itSerializes('deconstruction object key', {
				in() {
					let f;
					const outer = ({[f = (0, () => 1)]: x}) => x;
					outer({});
					return f;
				},
				out: '()=>1',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('');
					expect(fn()).toBe(1);
				}
			});
		});

		describe('has name preserved when defined as', () => {
			itSerializes('param default', {
				in() {
					const outer = (fn = () => 1) => fn;
					return outer();
				},
				out: 'Object.defineProperties(()=>1,{name:{value:"fn"}})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('fn');
					expect(fn()).toBe(1);
				}
			});

			itSerializes('deconstruction object key', {
				in() {
					let fn;
					const outer = ({[fn = () => 1]: x}) => x;
					outer({});
					return fn;
				},
				out: 'Object.defineProperties(()=>1,{name:{value:"fn"}})',
				validate(fn) {
					expect(fn).toBeFunction();
					expect(fn.name).toBe('fn');
					expect(fn()).toBe(1);
				}
			});
		});

		describe('can access', () => {
			describe('external var', () => {
				itSerializes('no clashing vars', {
					in() {
						const ext = 1;
						const outer = (fn = (0, () => ext)) => fn;
						return outer();
					},
					out: '(a=>()=>a)(1)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(1);
					}
				});

				itSerializes('when shadowed by another var in function body', {
					in() {
						const ext = 1;
						const outer = (getOuter = (0, () => ext)) => {
							const ext = 2; // eslint-disable-line no-shadow
							return {getOuter, getInner: (0, () => ext)};
						};
						return outer();
					},
					out: '{getOuter:(a=>()=>a)(1),getInner:(a=>()=>a)(2)}',
					validate({getOuter, getInner}) {
						expect(getOuter).toBeFunction();
						expect(getInner).toBeFunction();
						expect(getOuter()).toBe(1);
						expect(getInner()).toBe(2);
					}
				});
			});

			describe('another param', () => {
				itSerializes('no clashing vars', {
					in() {
						const outer = (x, fn = (0, () => x)) => fn;
						return outer(1);
					},
					out: '(a=>()=>a)(1)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(1);
					}
				});

				itSerializes('when shadowed by a `var` in function body', {
					in() {
						const outer = (x, fn = (0, () => x)) => { // eslint-disable-line block-scoped-var
							var x = 2; // eslint-disable-line no-var, no-redeclare
							return fn;
						};
						return outer(1);
					},
					out: '(a=>()=>a)(1)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(1);
					}
				});

				itSerializes('when shadowed by a function declaration in function body', {
					in() {
						const outer = (x, fn = (0, () => x)) => {
							function x() {} // eslint-disable-line no-redeclare
							return fn;
						};
						return outer(1);
					},
					out: '(a=>()=>a)(1)',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(1);
					}
				});
			});

			describe('outer function name', () => {
				itSerializes('no clashing vars', {
					in() {
						function outer(fn = (0, () => outer)) {
							return fn;
						}
						return outer();
					},
					out: '(b=>(b=function outer(a=(0,()=>b)){return a},()=>b))()',
					validate(fn) {
						expect(fn).toBeFunction();
						const outerFn = fn();
						expect(outerFn).toBeFunction();
						expect(outerFn.name).toBe('outer');
					}
				});

				itSerializes('when shadowed by another var in function body', {
					in() {
						function outer(getOuter = (0, () => outer)) {
							const outer = 1; // eslint-disable-line no-shadow
							return {getOuter, getInner: (0, () => outer)};
						}
						return outer();
					},
					out: `{
						getOuter:(
							c=>(
								c=function outer(a=(0,()=>c)){const b=1;return{getOuter:a,getInner:(0,()=>b)}},
								()=>c
							)
						)(),
						getInner:(a=>()=>a)(1)
					}`,
					validate({getOuter, getInner}) {
						expect(getOuter).toBeFunction();
						expect(getInner).toBeFunction();
						const outerFn = getOuter();
						expect(outerFn).toBeFunction();
						expect(outerFn.name).toBe('outer');
						expect(getInner()).toBe(1);
					}
				});
			});
		});

		itSerializes('can be serialized if later param throws error', {
			in() {
				let fn;
				const outer = (x, y = (fn = (0, () => x)), z = null()) => [x, y, z];
				expect(() => outer(1)).toThrowWithMessage(TypeError, 'null is not a function');
				return fn;
			},
			out: '(a=>()=>a)(1)',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toBe(1);
			}
		});
	});

	describe('function param and var in function are independent vars', () => {
		describe('`var` statement', () => {
			describe('when no init to `var` statement and', () => {
				itSerializes('param left as initial value', {
					in() {
						// eslint-disable-next-line block-scoped-var
						const outerFn = (x, getOuter = (0, () => x), setOuter = (0, (v) => { x = v; })) => {
							var x; // eslint-disable-line no-var, no-redeclare
							return {
								getOuter,
								setOuter,
								getInner: (0, () => x),
								setInner: (0, (v) => { x = v; })
							};
						};
						return outerFn(1);
					},
					out: `(()=>{
						const a=(b=>[()=>b,a=>{b=a}])(1),
							b=(b=>[()=>b,a=>{b=a}])(1);
						return{getOuter:a[0],setOuter:a[1],getInner:b[0],setInner:b[1]}
					})()`,
					validate({getOuter, setOuter, getInner, setInner}) {
						expect(getOuter()).toBe(1);
						expect(getInner()).toBe(1); // Inner value initialized as value of param
						setOuter(2);
						expect(getOuter()).toBe(2);
						expect(getInner()).toBe(1);
						setInner(3);
						expect(getOuter()).toBe(2);
						expect(getInner()).toBe(3);
					}
				});

				itSerializes('param set as default', {
					in() {
						// eslint-disable-next-line block-scoped-var
						const outerFn = (x = 1, getOuter = (0, () => x), setOuter = (0, (v) => { x = v; })) => {
							var x; // eslint-disable-line no-var, no-redeclare
							return {
								getOuter,
								setOuter,
								getInner: (0, () => x),
								setInner: (0, (v) => { x = v; })
							};
						};
						return outerFn();
					},
					out: `(()=>{
						const a=(b=>[()=>b,a=>{b=a}])(1),
							b=(b=>[()=>b,a=>{b=a}])(1);
						return{getOuter:a[0],setOuter:a[1],getInner:b[0],setInner:b[1]}
					})()`,
					validate({getOuter, setOuter, getInner, setInner}) {
						expect(getOuter()).toBe(1);
						expect(getInner()).toBe(1); // Inner value initialized as value of param default
						setOuter(2);
						expect(getOuter()).toBe(2);
						expect(getInner()).toBe(1);
						setInner(3);
						expect(getOuter()).toBe(2);
						expect(getInner()).toBe(3);
					}
				});

				itSerializes('param set later in params', {
					in() {
						// eslint-disable-next-line block-scoped-var
						const outerFn = (x, getOuter = (0, () => x), setOuter = (x = 1, (v) => { x = v; })) => {
							var x; // eslint-disable-line no-var, no-redeclare
							return {
								getOuter,
								setOuter,
								getInner: (0, () => x),
								setInner: (0, (v) => { x = v; })
							};
						};
						return outerFn();
					},
					out: `(()=>{
						const a=(b=>[()=>b,a=>{b=a}])(1),
							b=(b=>[()=>b,a=>{b=a}])(1);
						return{getOuter:a[0],setOuter:a[1],getInner:b[0],setInner:b[1]}
					})()`,
					validate({getOuter, setOuter, getInner, setInner}) {
						expect(getOuter()).toBe(1);
						expect(getInner()).toBe(1); // Inner value initialized as value of param upon exiting params
						setOuter(2);
						expect(getOuter()).toBe(2);
						expect(getInner()).toBe(1);
						setInner(3);
						expect(getOuter()).toBe(2);
						expect(getInner()).toBe(3);
					}
				});
			});

			itSerializes('when `var` statement has init value', {
				in() {
					// eslint-disable-next-line block-scoped-var
					const outerFn = (x, getOuter = (0, () => x), setOuter = (0, (v) => { x = v; })) => {
						var x = 2; // eslint-disable-line no-var, no-redeclare
						return {
							getOuter,
							setOuter,
							getInner: (0, () => x),
							setInner: (0, (v) => { x = v; })
						};
					};
					return outerFn(1);
				},
				out: `(()=>{
					const a=(b=>[()=>b,a=>{b=a}])(1),
						b=(b=>[()=>b,a=>{b=a}])(2);
					return{getOuter:a[0],setOuter:a[1],getInner:b[0],setInner:b[1]}
				})()`,
				validate({getOuter, setOuter, getInner, setInner}) {
					expect(getOuter()).toBe(1);
					expect(getInner()).toBe(2);
					setOuter(3);
					expect(getOuter()).toBe(3);
					expect(getInner()).toBe(2);
					setInner(4);
					expect(getOuter()).toBe(3);
					expect(getInner()).toBe(4);
				}
			});
		});

		describe('function declaration', () => {
			itSerializes('param left as initial value', {
				in() {
					const outerFn = (x, getOuter = (0, () => x), setOuter = (0, (v) => { x = v; })) => {
						return {
							getOuter,
							setOuter,
							getInner: (0, () => x),
							setInner: (0, (v) => { x = v; })
						};
						function x() {} // eslint-disable-line no-redeclare
					};
					return outerFn(1);
				},
				out: `(()=>{
					const a=(b=>[()=>b,a=>{b=a}])(1),
						b=(b=>[()=>b,a=>{b=a}])(function x(){});
					return{getOuter:a[0],setOuter:a[1],getInner:b[0],setInner:b[1]}
				})()`,
				validate({getOuter, setOuter, getInner, setInner}) {
					expect(getOuter()).toBe(1);
					expect(getInner()).toBeFunction();
					expect(getInner().name).toBe('x');
					setOuter(2);
					expect(getOuter()).toBe(2);
					expect(getInner()).toBeFunction();
					setInner(3);
					expect(getOuter()).toBe(2);
					expect(getInner()).toBe(3);
				}
			});

			itSerializes('param set as default', {
				in() {
					const outerFn = (x = 1, getOuter = (0, () => x), setOuter = (0, (v) => { x = v; })) => {
						return {
							getOuter,
							setOuter,
							getInner: (0, () => x),
							setInner: (0, (v) => { x = v; })
						};
						function x() {} // eslint-disable-line no-redeclare
					};
					return outerFn();
				},
				out: `(()=>{
					const a=(b=>[()=>b,a=>{b=a}])(1),
						b=(b=>[()=>b,a=>{b=a}])(function x(){});
					return{getOuter:a[0],setOuter:a[1],getInner:b[0],setInner:b[1]}
				})()`,
				validate({getOuter, setOuter, getInner, setInner}) {
					expect(getOuter()).toBe(1);
					expect(getInner()).toBeFunction();
					expect(getInner().name).toBe('x');
					setOuter(2);
					expect(getOuter()).toBe(2);
					expect(getInner()).toBeFunction();
					setInner(3);
					expect(getOuter()).toBe(2);
					expect(getInner()).toBe(3);
				}
			});

			itSerializes('param set later in params', {
				in() {
					const outerFn = (x, getOuter = (0, () => x), setOuter = (x = 1, (v) => { x = v; })) => {
						return {
							getOuter,
							setOuter,
							getInner: (0, () => x),
							setInner: (0, (v) => { x = v; })
						};
						function x() {} // eslint-disable-line no-redeclare
					};
					return outerFn();
				},
				out: `(()=>{
					const a=(b=>[()=>b,a=>{b=a}])(1),
						b=(b=>[()=>b,a=>{b=a}])(function x(){});
					return{getOuter:a[0],setOuter:a[1],getInner:b[0],setInner:b[1]}
				})()`,
				validate({getOuter, setOuter, getInner, setInner}) {
					expect(getOuter()).toBe(1);
					expect(getInner()).toBeFunction();
					expect(getInner().name).toBe('x');
					setOuter(2);
					expect(getOuter()).toBe(2);
					expect(getInner()).toBeFunction();
					setInner(3);
					expect(getOuter()).toBe(2);
					expect(getInner()).toBe(3);
				}
			});
		});

		describe('var in function body has value of param before `var` statement', () => {
			// These tests for transform made in instrumentation
			itSerializes('when function has no complex params', {
				in() {
					return (x) => {
						const xBefore = x;
						var x = 2; // eslint-disable-line no-var, no-redeclare
						return [xBefore, x];
					};
				},
				out: 'a=>{const b=a;var a=2;return[b,a]}',
				validate(fn) {
					expect(fn).toBeFunction();
					const [xBefore, xAfter] = fn(1);
					expect(xBefore).toBe(1);
					expect(xAfter).toBe(2);
				}
			});

			itSerializes('when function param has default', {
				in() {
					return (x = 1) => { // eslint-disable-line block-scoped-var
						const xBefore = x;
						var x = 2; // eslint-disable-line no-var, no-redeclare
						return [xBefore, x];
					};
				},
				out: '(a=1)=>{const b=a;var a=2;return[b,a]}',
				validate(fn) {
					expect(fn).toBeFunction();
					const [xBefore, xAfter] = fn();
					expect(xBefore).toBe(1);
					expect(xAfter).toBe(2);
				}
			});
		});
	});

	describe('interaction between function declaration and var in same function is maintained', () => {
		// These tests for transform made in instrumentation which moves param definitions into function body
		// if function has complex params
		describe('when var statement first', () => {
			itSerializes('with no initializer', {
				in() {
					const x = 1;
					return (y = x) => { // eslint-disable-line no-unused-vars
						const xBefore = x; // eslint-disable-line no-use-before-define
						var x; // eslint-disable-line no-var, no-shadow
						function x() {} // eslint-disable-line no-redeclare
						return [xBefore, x];
					};
				},
				out: '(c=>(a=c)=>{const b=x;var x;function x(){}return[b,x]})(1)',
				validate(fn) {
					expect(fn).toBeFunction();
					const [xBefore, xAfter] = fn();
					expect(xBefore).toBeFunction();
					expect(xBefore.name).toBe('x');
					expect(xAfter).toBe(xBefore);
				}
			});

			itSerializes('with initializer', {
				in() {
					const x = 1;
					return (y = x) => { // eslint-disable-line no-unused-vars
						const xBefore = x; // eslint-disable-line no-use-before-define
						var x = 2; // eslint-disable-line no-var, no-shadow
						function x() {} // eslint-disable-line no-redeclare
						return [xBefore, x];
					};
				},
				out: '(c=>(a=c)=>{const b=x;var x=2;function x(){}return[b,x]})(1)',
				validate(fn) {
					expect(fn).toBeFunction();
					const [xBefore, xAfter] = fn();
					expect(xBefore).toBeFunction();
					expect(xBefore.name).toBe('x');
					expect(xAfter).toBe(2);
				}
			});
		});

		describe('when function declaration first', () => {
			itSerializes('with no initializer in `var` statement', {
				in() {
					const x = 1;
					return (y = x) => { // eslint-disable-line no-unused-vars
						const xBefore = x;
						function x() {} // eslint-disable-line no-shadow
						var x; // eslint-disable-line no-var, vars-on-top, no-redeclare
						return [xBefore, x];
					};
				},
				out: '(c=>(a=c)=>{const b=x;function x(){}var x;return[b,x]})(1)',
				validate(fn) {
					expect(fn).toBeFunction();
					const [xBefore, xAfter] = fn();
					expect(xBefore).toBeFunction();
					expect(xBefore.name).toBe('x');
					expect(xAfter).toBe(xBefore);
				}
			});

			itSerializes('with initializer in `var` statement', {
				in() {
					const x = 1;
					return (y = x) => { // eslint-disable-line no-unused-vars
						const xBefore = x;
						function x() {} // eslint-disable-line no-shadow
						var x = 2; // eslint-disable-line no-var, vars-on-top, no-redeclare
						return [xBefore, x];
					};
				},
				out: '(c=>(a=c)=>{const b=x;function x(){}var x=2;return[b,x]})(1)',
				validate(fn) {
					expect(fn).toBeFunction();
					const [xBefore, xAfter] = fn();
					expect(xBefore).toBeFunction();
					expect(xBefore.name).toBe('x');
					expect(xAfter).toBe(2);
				}
			});
		});
	});

	describe('interaction between multiple `var` statements in same function is maintained', () => {
		// These tests for transform made in instrumentation which moves param definitions into function body
		// if function has complex params
		itSerializes('first `var` statement with no initializer', {
			in() {
				const x = 1;
				/* eslint-disable no-var, vars-on-top, no-redeclare, no-use-before-define, block-scoped-var */
				return (y = x) => { // eslint-disable-line no-unused-vars
					const xValues = [x];
					var x; // eslint-disable-line no-shadow
					xValues.push(x);
					var x = 2;
					xValues.push(x);
					{ // eslint-disable-line no-lone-blocks
						var x = 3;
					}
					xValues.push(x);
					var x;
					xValues.push(x);
					return xValues;
				};
				/* eslint-enable no-var, vars-on-top, no-redeclare, no-use-before-define, block-scoped-var */
			},
			out: `(d=>(a=d)=>{
				const b=[c];
				var c;
				b.push(c);
				var c=2;
				b.push(c);
				{var c=3}
				b.push(c);
				var c;
				b.push(c);
				return b
			})(1)`,
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toEqual([undefined, undefined, 2, 3, 3]);
			}
		});

		itSerializes('first `var` statement with initializer', {
			in() {
				const x = 1;
				/* eslint-disable no-var, vars-on-top, no-redeclare, no-use-before-define, block-scoped-var */
				return (y = x) => { // eslint-disable-line no-unused-vars
					const xValues = [x];
					var x = 2; // eslint-disable-line no-shadow
					xValues.push(x);
					var x = 3;
					xValues.push(x);
					{ // eslint-disable-line no-lone-blocks
						var x = 4;
					}
					xValues.push(x);
					var x;
					xValues.push(x);
					return xValues;
				};
				/* eslint-enable no-var, vars-on-top, no-redeclare, no-use-before-define, block-scoped-var */
			},
			out: `(d=>(a=d)=>{
				const b=[c];
				var c=2;
				b.push(c);
				var c=3;
				b.push(c);
				{var c=4}
				b.push(c);
				var c;
				b.push(c);
				return b
			})(1)`,
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn()).toEqual([undefined, 2, 3, 4, 4]);
			}
		});
	});

	itSerializes('params and `arguments` remain unlinked in sloppy mode function with complex params', {
		in() {
			// eslint-disable-next-line no-eval
			return (0, eval)(`(function(x = 1) {
				arguments[0] = 2;
				x = 3;
				return [x, arguments];
			})`);
		},
		strictEnv: false,
		out: 'function(a=1){arguments[0]=2;a=3;return[a,arguments]}',
		validate(fn) {
			expect(fn).toBeFunction();
			const [x, args] = fn();
			expect(x).toBe(3);
			expect(args).toBeArguments();
			expect(args[0]).toBe(2);
		}
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
								a=>[
									(...b)=>a(...b),
									c=>a=c
								]
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
						const a=(0,a=>[
								(...b)=>a(...b),
								c=>a=c
							]),
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
			validate(fn) {
				expect(fn).toBeFunction();
				const ctx = {},
					param1 = {},
					param2 = {};
				const iterator = fn.call(ctx, param1, param2);
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
			async validate(fn) {
				expect(fn).toBeFunction();
				const ctx = {},
					param1 = {},
					param2 = {};
				const iterator = fn.call(ctx, param1, param2);
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

		itSerializes('with function names added by Livepack', {
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

		itSerializes('with globals with function names added by Livepack', {
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
					// eslint-disable-next-line no-labels, no-label-var, no-unreachable-loop
					x: for (let i = 0; i < 3; i++) {
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
		in: {
			'index.js': `
				'use strict';
				const inner1 = require('./1.js'),
					{inner2, inner3} = require('./2.js');
				module.exports = {inner1, inner2, inner3};
			`,
			'1.js': `
				'use strict';
				const extA = {extA1: 1};
				function outer(extB) {
					return () => [extA, extB];
				}
				module.exports = outer({extB1: 2});
			`,
			'2.js': `
				'use strict';
				const inner3 = require('./3.js');
				const extA = {extA2: 3};
				function outer(extB) {
					return () => [extA, extB];
				}
				const inner2 = outer({extB2: 4});
				module.exports = {inner2, inner3};
			`,
			'3.js': `
				'use strict';
				const extA = {extA3: 5};
				function outer(extB) {
					return () => [extA, extB];
				}
				module.exports = outer({extB3: 6});
			`
		},
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

		itSerializes('named function as default export', {
			in() {
				return function f() {};
			},
			format: 'esm',
			out: 'export default function f(){}',
			validate(fn) {
				expect(fn).toBeFunction();
				expect(fn.name).toBe('f');
			}
		});

		itSerializes('unnamed function as default export', {
			in() {
				return function() {};
			},
			format: 'esm',
			out: 'export default(0,function(){})',
			validate(fn) {
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

		itSerializes('reserved word', {
			in: () => ({export: function() {}}.export), // eslint-disable-line object-shorthand
			out: 'Object.defineProperties(function(){},{name:{value:"export"}})',
			validate(fn) {
				expect(
					Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
				).toEqual(['length', 'name', 'prototype']);
				expect(fn.name).toBe('export');
				expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('arguments', {
			in: () => ({arguments: function() {}}.arguments), // eslint-disable-line object-shorthand
			out: 'Object.defineProperties(function(){},{name:{value:"arguments"}})',
			validate(fn) {
				expect(
					Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
				).toEqual(['length', 'name', 'prototype']);
				expect(fn.name).toBe('arguments');
				expect(fn).toHaveDescriptorModifiersFor('name', false, false, true);
			}
		});

		itSerializes('eval', {
			in: () => ({eval: function() {}}.eval), // eslint-disable-line object-shorthand
			out: 'Object.defineProperties(function(){},{name:{value:"eval"}})',
			validate(fn) {
				expect(
					Object.getOwnPropertyNames(fn).filter(key => key !== 'arguments' && key !== 'caller')
				).toEqual(['length', 'name', 'prototype']);
				expect(fn.name).toBe('eval');
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
				itSerializes.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)]),
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => ({
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
					})
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
				itSerializes.each( // eslint-disable-next-line no-bitwise
					[0, 1, 2, 3, 4, 5, 6, 7].map(n => [!(n & 4), !(n & 2), !(n & 1)]),
					'{writable: %p, enumerable: %p, configurable: %p}',
					(writable, enumerable, configurable) => ({
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
					})
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
						const fn = function x() {};
						fn.a = 1;
						fn[0] = 2;
						fn[5] = 3;
						fn[4294967294] = 4;
						fn[4294967295] = 5;
						return fn;
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
						expect(fn()).toBe(2);
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
						expect(fn()).toBe(2);
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

	describe('const violations', () => {
		itSerializes('straight assignment', {
			in() {
				const extA = 1;
				let extB = 2;
				return [
					() => {
						extA = extB++; // eslint-disable-line no-const-assign
					},
					() => extA,
					() => extB
				];
			},
			out: `(()=>{
				const a=((b,c)=>[
					()=>{b++,(()=>{const a=0;a=0})()},
					()=>c,
					()=>b
				])(2,1);
				return[a[0],a[1],a[2]]
			})()`,
			validate([setA, getA, getB]) {
				expect(setA).toBeFunction();
				expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				expect(getA()).toBe(1); // Assignment not made
				expect(getB()).toBe(3); // Side effect executed
			}
		});

		describe('assignment expression', () => {
			itSerializes('+=', {
				in() {
					const calls = [];
					const extA = {
						valueOf() {
							calls.push('valueOf');
							return 1;
						}
					};
					const f = (0, () => calls.push('f'));
					return [
						() => {
							extA += f(); // eslint-disable-line no-const-assign
						},
						() => extA,
						calls
					];
				},
				out: `(()=>{
					const a=[],
						b=((b,c,d)=>(
							d=(0,()=>b.push("f")),
							[
								a=>c=a,
								{valueOf(){b.push("valueOf");return 1}}.valueOf,
								()=>{
									c+d(),(()=>{const a=0;a=0})()
								},
								()=>c
							]
						))(a);
					b[0]({valueOf:b[1]});
					return[b[2],b[3],a]
				})()`,
				validate([setA, getA, calls]) {
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBeObject(); // Assignment not made
					expect(calls).toEqual(['f', 'valueOf']); // `.valueOf` called + side effect executed
				}
			});

			itSerializes('>>>=', {
				in() {
					const calls = [];
					const extA = {
						valueOf() {
							calls.push('valueOf');
							return 1;
						}
					};
					const f = (0, () => calls.push('f'));
					return [
						() => {
							extA >>>= f(); // eslint-disable-line no-const-assign, no-bitwise
						},
						() => extA,
						calls
					];
				},
				out: `(()=>{
					const a=[],
						b=((b,c,d)=>(
							d=(0,()=>b.push("f")),
							[
								a=>c=a,
								{valueOf(){b.push("valueOf");return 1}}.valueOf,
								()=>{
									c>>>d(),
									(()=>{const a=0;a=0})()
								},
								()=>c
							]
						))(a);
					b[0]({valueOf:b[1]});
					return[b[2],b[3],a]
				})()`,
				validate([setA, getA, calls]) {
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBeObject(); // Assignment not made
					expect(calls).toEqual(['f', 'valueOf']); // `.valueOf` called + side effect executed
				}
			});

			describe('&&=', () => {
				itSerializes('where executes', {
					in() {
						const extA = 1;
						let extB = 2;
						return [
							() => { extA &&= extB++; }, // eslint-disable-line no-const-assign
							() => extA,
							() => extB
						];
					},
					out: `(()=>{
						const a=((b,c)=>[
							()=>{
								b&&(c++,(()=>{const a=0;a=0})())
							},
							()=>b,
							()=>c
						])(1,2);
						return[a[0],a[1],a[2]]
					})()`,
					validate([setA, getA, getB]) {
						expect(setA).toBeFunction();
						expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(getA()).toBe(1); // Assignment not made
						expect(getB()).toBe(3); // Side effect executed
					}
				});

				itSerializes('where does not execute', {
					in() {
						const extA = 0;
						let extB = 2;
						return [
							() => { extA &&= extB++; }, // eslint-disable-line no-const-assign
							() => extA,
							() => extB
						];
					},
					out: `(()=>{
						const a=((b,c)=>[
							()=>{
								b&&(c++,(()=>{const a=0;a=0})())
							},
							()=>b,
							()=>c
						])(0,2);
						return[a[0],a[1],a[2]]
					})()`,
					validate([setA, getA, getB]) {
						expect(setA).toBeFunction();
						setA(); // Does not throw
						expect(getA()).toBe(0); // Assignment not made
						expect(getB()).toBe(2); // Side effect not executed
					}
				});
			});
		});

		describe('update expression', () => {
			itSerializes('x++', {
				in() {
					const calls = [];
					const extA = {
						valueOf() {
							calls.push('valueOf');
							return 1;
						}
					};
					return [
						() => {
							extA++; // eslint-disable-line no-const-assign
						},
						() => extA,
						calls
					];
				},
				out: `(()=>{
					const a=[],
						b=((b,c)=>[
							a=>c=a,
							{valueOf(){b.push("valueOf");return 1}}.valueOf,
							()=>{
								+c,
								(()=>{const a=0;a=0})()
							},
							()=>c
						])(a);
					b[0]({valueOf:b[1]});
					return[b[2],b[3],a]
				})()`,
				validate([setA, getA, calls]) {
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBeObject(); // Assignment not made
					expect(calls).toEqual(['valueOf']); // `.valueOf` called
				}
			});

			itSerializes('--x', {
				in() {
					const calls = [];
					const extA = {
						valueOf() {
							calls.push('valueOf');
							return 1;
						}
					};
					return [
						() => {
							--extA; // eslint-disable-line no-const-assign
						},
						() => extA,
						calls
					];
				},
				out: `(()=>{
					const a=[],
						b=((b,c)=>[
							a=>c=a,
							{valueOf(){b.push("valueOf");return 1}}.valueOf,
							()=>{
								+c,
								(()=>{const a=0;a=0})()
							},
							()=>c
						])(a);
					b[0]({valueOf:b[1]});
					return[b[2],b[3],a]
				})()`,
				validate([setA, getA, calls]) {
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBeObject(); // Assignment not made
					expect(calls).toEqual(['valueOf']); // `.valueOf` called
				}
			});
		});

		describe('assignment via deconstruction', () => {
			itSerializes('array deconstruction', {
				in() {
					const extA = 1;
					let extB = 2,
						extC = 3;
					const arr = [
						() => {
							// eslint-disable-next-line no-const-assign
							[extB, extA, extC] = Object.defineProperty([4, 5, 6], 1, {
								get() {
									arr[4] = true;
									return 5;
								}
							});
						},
						() => extA,
						() => extB,
						() => extC
					];
					return arr;
				},
				out: `(()=>{
					const a=((c,d,e,f)=>[
							a=>f=a,
							()=>{
								[c,{set a(a){const b=0;b=0}}.a,d]=Object.defineProperty([4,5,6],1,{
									get(){f[4]=true;return 5}
								})
							},
							()=>e,
							()=>c,
							()=>d
						])(2,3,1),
						b=[a[1],a[2],a[3],a[4]];
					a[0](b);
					return b
				})()`,
				validate(arr) {
					const [setA, getA, getB, getC] = arr;
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBe(1); // Assignment not made
					expect(getB()).toBe(4); // Prior assignment was made
					expect(getC()).toBe(3); // Later assignment not made
					expect(arr[4]).toBeTrue(); // Getter executed
				}
			});

			describe('array deconstruction with default', () => {
				itSerializes('where default is evaluated', {
					in() {
						const extA = 1;
						let extB = 2,
							extC = 3;
						const arr = [
							() => {
								// eslint-disable-next-line no-const-assign
								[extB, extA = (() => { arr[5] = true; })(), extC] = Object.defineProperty(
									[4, undefined, 6],
									1,
									{
										get() {
											arr[4] = true;
											return undefined;
										}
									}
								);
							},
							() => extA,
							() => extB,
							() => extC
						];
						return arr;
					},
					out: `(()=>{
						const a=((d,e,f,g)=>[
								a=>g=a,
								()=>{
									[
										d,
										(b=>({set a(a){a===void 0&&b();const c=0;c=0}}))(()=>(()=>{g[5]=true})()).a,
										e
									]=Object.defineProperty([4,undefined,6],1,{
										get(){g[4]=true;return undefined}
									})
								},
								()=>f,
								()=>d,
								()=>e
							])(2,3,1),
							b=[a[1],a[2],a[3],a[4]];
						a[0](b);
						return b
					})()`,
					validate(arr) {
						const [setA, getA, getB, getC] = arr;
						expect(setA).toBeFunction();
						expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(getA()).toBe(1); // Assignment not made
						expect(getB()).toBe(4); // Prior assignment was made
						expect(getC()).toBe(3); // Later assignment not made
						expect(arr[4]).toBeTrue(); // Getter executed
						expect(arr[5]).toBeTrue(); // Default evaluated
					}
				});

				itSerializes('where default is not evaluated', {
					in() {
						const extA = 1;
						let extB = 2,
							extC = 3;
						const arr = [
							() => {
								// eslint-disable-next-line no-const-assign
								[extB, extA = (() => { arr[5] = true; })(), extC] = Object.defineProperty(
									[4, 5, 6],
									1,
									{
										get() {
											arr[4] = true;
											return 5;
										}
									}
								);
							},
							() => extA,
							() => extB,
							() => extC
						];
						return arr;
					},
					out: `(()=>{
						const a=((d,e,f,g)=>[
								a=>g=a,
								()=>{
									[
										d,
										(b=>({set a(a){a===void 0&&b();const c=0;c=0}}))(()=>(()=>{g[5]=true})()).a,
										e
									]=Object.defineProperty([4,5,6],1,{
										get(){g[4]=true;return 5}
									})
								},
								()=>f,
								()=>d,
								()=>e
							])(2,3,1),
							b=[a[1],a[2],a[3],a[4]];
						a[0](b);
						return b
					})()`,
					validate(arr) {
						const [setA, getA, getB, getC] = arr;
						expect(setA).toBeFunction();
						expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(getA()).toBe(1); // Assignment not made
						expect(getB()).toBe(4); // Prior assignment was made
						expect(getC()).toBe(3); // Later assignment not made
						expect(arr[4]).toBeTrue(); // Getter executed
						expect(arr[5]).toBeUndefined(); // Default not evaluated
					}
				});
			});

			itSerializes('array rest deconstruction', {
				in() {
					const extA = 1;
					let extB = 2;
					const arr = [
						() => {
							// eslint-disable-next-line no-const-assign
							[extB, ...extA] = Object.defineProperties([4, 5, 6], {
								1: {
									get() {
										arr[3] += 1;
										return 5;
									}
								},
								2: {
									get() {
										arr[3] += 2;
										return 6;
									}
								}
							});
						},
						() => extA,
						() => extB,
						0
					];
					return arr;
				},
				out: `(()=>{
					const a=((c,d,e)=>[
							a=>e=a,
							()=>{
								[c,...{set a(a){const b=0;b=0}}.a]=Object.defineProperties([4,5,6],{
									1:{get(){e[3]+=1;return 5}},
									2:{get(){e[3]+=2;return 6}}
								})
							},
							()=>d,
							()=>c
						])(2,1),
						b=[a[1],a[2],a[3],0];
					a[0](b);
					return b
				})()`,
				validate(arr) {
					const [setA, getA, getB] = arr;
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBe(1); // Assignment not made
					expect(getB()).toBe(4); // Prior assignment was made
					expect(arr[3]).toBe(3); // Getters executed
				}
			});

			itSerializes('object deconstruction', {
				in() {
					const extA = 1;
					let extB = 2,
						extC = 3;
					const arr = [
						() => {
							// eslint-disable-next-line no-const-assign
							({x: extB, y: extA, z: extC} = Object.defineProperty({x: 4, y: 5, z: 6}, 'y', {
								get() {
									arr[4] = true;
									return 5;
								}
							}));
						},
						() => extA,
						() => extB,
						() => extC
					];
					return arr;
				},
				out: `(()=>{
					const a=((c,d,e,f)=>[
							a=>f=a,
							()=>{
								({x:c,y:{set a(a){const b=0;b=0}}.a,z:d}=Object.defineProperty({x:4,y:5,z:6},"y",{
									get(){f[4]=true;return 5}
								}))
							},
							()=>e,
							()=>c,
							()=>d
						])(2,3,1),
						b=[a[1],a[2],a[3],a[4]];
					a[0](b);
					return b
				})()`,
				validate(arr) {
					const [setA, getA, getB, getC] = arr;
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBe(1); // Assignment not made
					expect(getB()).toBe(4); // Prior assignment was made
					expect(getC()).toBe(3); // Later assignment not made
					expect(arr[4]).toBeTrue(); // Getter executed
				}
			});

			describe('object deconstruction with default', () => {
				itSerializes('where default is evaluated', {
					in() {
						const extA = 1;
						let extB = 2,
							extC = 3;
						const arr = [
							() => {
								// eslint-disable-next-line no-const-assign
								({x: extB, y: extA = (() => { arr[5] = true; })(), z: extC} = Object.defineProperty(
									{x: 4, y: undefined, z: 6},
									'y',
									{
										get() {
											arr[4] = true;
											return undefined;
										}
									}
								));
							},
							() => extA,
							() => extB,
							() => extC
						];
						return arr;
					},
					out: `(()=>{
						const a=((d,e,f,g)=>[
								a=>g=a,
								()=>{
									({
										x:d,
										y:(b=>({set a(a){a===void 0&&b();const c=0;c=0}}))(()=>(()=>{g[5]=true})()).a,
										z:e
									}=Object.defineProperty({x:4,y:undefined,z:6},"y",{
										get(){g[4]=true;return undefined}
									}))
								},
								()=>f,
								()=>d,
								()=>e
							])(2,3,1),
							b=[a[1],a[2],a[3],a[4]];
						a[0](b);
						return b
					})()`,
					validate(arr) {
						const [setA, getA, getB, getC] = arr;
						expect(setA).toBeFunction();
						expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(getA()).toBe(1); // Assignment not made
						expect(getB()).toBe(4); // Prior assignment was made
						expect(getC()).toBe(3); // Later assignment not made
						expect(arr[4]).toBeTrue(); // Getter executed
						expect(arr[5]).toBeTrue(); // Default evaluated
					}
				});

				itSerializes('where default is not evaluated', {
					in() {
						const extA = 1;
						let extB = 2,
							extC = 3;
						const arr = [
							() => {
								// eslint-disable-next-line no-const-assign
								({x: extB, y: extA = (() => { arr[5] = true; })(), z: extC} = Object.defineProperty(
									{x: 4, y: 5, z: 6},
									'y',
									{
										get() {
											arr[4] = true;
											return 5;
										}
									}
								));
							},
							() => extA,
							() => extB,
							() => extC
						];
						return arr;
					},
					out: `(()=>{
						const a=((d,e,f,g)=>[
								a=>g=a,
								()=>{
									({
										x:d,
										y:(b=>({set a(a){a===void 0&&b();const c=0;c=0}}))(()=>(()=>{g[5]=true})()).a,
										z:e
									}=Object.defineProperty({x:4,y:5,z:6},"y",{
										get(){g[4]=true;return 5}
									}))
								},
								()=>f,
								()=>d,
								()=>e
							])(2,3,1),
							b=[a[1],a[2],a[3],a[4]];
						a[0](b);
						return b
					})()`,
					validate(arr) {
						const [setA, getA, getB, getC] = arr;
						expect(setA).toBeFunction();
						expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(getA()).toBe(1); // Assignment not made
						expect(getB()).toBe(4); // Prior assignment was made
						expect(getC()).toBe(3); // Later assignment not made
						expect(arr[4]).toBeTrue(); // Getter executed
						expect(arr[5]).toBeUndefined(); // Default not evaluated
					}
				});
			});

			itSerializes('object rest deconstruction', {
				in() {
					const extA = 1;
					let extB = 2;
					const arr = [
						() => {
							// eslint-disable-next-line no-const-assign
							({x: extB, ...extA} = Object.defineProperties({x: 4, y: 5, z: 6}, {
								y: {
									get() {
										arr[3] += 1;
										return 5;
									}
								},
								z: {
									get() {
										arr[3] += 2;
										return 6;
									}
								}
							}));
						},
						() => extA,
						() => extB,
						0
					];
					return arr;
				},
				out: `(()=>{
					const a=((c,d,e)=>[
							a=>e=a,
							()=>{
								({x:c,...{set a(a){const b=0;b=0}}.a}=Object.defineProperties({x:4,y:5,z:6},{
									y:{get(){e[3]+=1;return 5}},
									z:{get(){e[3]+=2;return 6}}
								}))
							},
							()=>d,
							()=>c
						])(2,1),
						b=[a[1],a[2],a[3],0];
					a[0](b);
					return b
				})()`,
				validate(arr) {
					const [setA, getA, getB] = arr;
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBe(1); // Assignment not made
					expect(getB()).toBe(4); // Prior assignment was made
					expect(arr[3]).toBe(3); // Getters executed
				}
			});
		});

		describe('for in statement', () => {
			itSerializes('where assignment occurs', {
				in() {
					const extA = 1;
					const arr = [
						() => {
							for (extA in {x: 1}) { // eslint-disable-line no-const-assign
								arr[2] = 3;
							}
						},
						() => extA,
						2
					];
					return arr;
				},
				out: `(()=>{
					const a=((c,d)=>[
							a=>d=a,
							()=>{
								for({set a(a){const b=0;b=0}}.a in{x:1}){
									d[2]=3
								}
							},
							()=>c
						])(1),
						b=[a[1],a[2],2];
					a[0](b);
					return b
				})()`,
				validate(arr) {
					const [setA, getA] = arr;
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBe(1); // Assignment not made
					expect(arr[2]).toBe(2); // Loop body doesn't execute
				}
			});

			itSerializes("where assignment doesn't occur", {
				in() {
					const extA = 1;
					const arr = [
						() => {
							for (extA in {}) { // eslint-disable-line no-const-assign
								arr[2] = 3;
							}
						},
						() => extA,
						2
					];
					return arr;
				},
				out: `(()=>{
					const a=((c,d)=>[
							a=>d=a,
							()=>{
								for({set a(a){const b=0;b=0}}.a in{}){
									d[2]=3
								}
							},
							()=>c
						])(1),
						b=[a[1],a[2],2];
					a[0](b);
					return b
				})()`,
				validate(arr) {
					const [setA, getA] = arr;
					expect(setA).toBeFunction();
					setA(); // Doesn't throw
					expect(getA()).toBe(1); // Assignment not made
					expect(arr[2]).toBe(2); // Loop body doesn't execute
				}
			});
		});

		describe('for of statement', () => {
			itSerializes('where assignment occurs', {
				in() {
					const extA = 1;
					const arr = [
						() => {
							for (extA of [1]) { // eslint-disable-line no-const-assign
								arr[2] = 3;
							}
						},
						() => extA,
						2
					];
					return arr;
				},
				out: `(()=>{
					const a=((c,d)=>[
							a=>d=a,
							()=>{
								for({set a(a){const b=0;b=0}}.a of[1]){
									d[2]=3
								}
							},
							()=>c
						])(1),
						b=[a[1],a[2],2];
					a[0](b);
					return b
				})()`,
				validate(arr) {
					const [setA, getA] = arr;
					expect(setA).toBeFunction();
					expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					expect(getA()).toBe(1); // Assignment not made
					expect(arr[2]).toBe(2); // Loop body doesn't execute
				}
			});

			itSerializes("where assignment doesn't occur", {
				in() {
					const extA = 1;
					const arr = [
						() => {
							for (extA of []) { // eslint-disable-line no-const-assign
								arr[2] = 3;
							}
						},
						() => extA,
						2
					];
					return arr;
				},
				out: `(()=>{
					const a=((c,d)=>[
							a=>d=a,
							()=>{
								for({set a(a){const b=0;b=0}}.a of[]){
									d[2]=3
								}
							},
							()=>c
						])(1),
						b=[a[1],a[2],2];
					a[0](b);
					return b
				})()`,
				validate(arr) {
					const [setA, getA] = arr;
					expect(setA).toBeFunction();
					setA(); // Doesn't throw
					expect(getA()).toBe(1); // Assignment not made
					expect(arr[2]).toBe(2); // Loop body doesn't execute
				}
			});
		});

		describe('when only reference to var is const violation, omitted from scope function params', () => {
			describe('leaving no remaining scopes', () => {
				itSerializes('straight assignment', {
					in() {
						const extA = 1; // eslint-disable-line no-unused-vars
						return () => {
							extA = 2; // eslint-disable-line no-const-assign
						};
					},
					out: '()=>{2,(()=>{const a=0;a=0})()}',
					validate(set) {
						expect(set).toBeFunction();
						expect(set).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('assignment via deconstruction', {
					in() {
						const extA = 1; // eslint-disable-line no-unused-vars
						return () => {
							[extA] = [2]; // eslint-disable-line no-const-assign
						};
					},
					out: '()=>{[{set a(a){const b=0;b=0}}.a]=[2]}',
					validate(set) {
						expect(set).toBeFunction();
						expect(set).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('assignment in for in statement', {
					in() {
						const extA = 1; // eslint-disable-line no-unused-vars
						return () => {
							for (extA in {x: 1}) ; // eslint-disable-line no-const-assign
						};
					},
					out: '()=>{for({set a(a){const b=0;b=0}}.a in{x:1});}',
					validate(set) {
						expect(set).toBeFunction();
						expect(set).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('assignment in for of statement', {
					in() {
						const extA = 1; // eslint-disable-line no-unused-vars
						return () => {
							for (extA of [2]) ; // eslint-disable-line no-const-assign
						};
					},
					out: '()=>{for({set a(a){const b=0;b=0}}.a of[2]);}',
					validate(set) {
						expect(set).toBeFunction();
						expect(set).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});
			});

			describe('with other scope vars', () => {
				itSerializes('in same block', {
					in() {
						const extA = 1, // eslint-disable-line no-unused-vars
							extB = 2;
						return () => {
							extA = extB; // eslint-disable-line no-const-assign
						};
					},
					out: '(b=>()=>{b,(()=>{const a=0;a=0})()})(2)',
					validate(set) {
						expect(set).toBeFunction();
						expect(set).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('in block above', {
					in() {
						const extA = 1; // eslint-disable-line no-unused-vars
						{
							const extB = 2;
							return () => {
								extA = extB; // eslint-disable-line no-const-assign
							};
						}
					},
					out: '(b=>()=>{b,(()=>{const a=0;a=0})()})(2)',
					validate(set) {
						expect(set).toBeFunction();
						expect(set).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('in block below', {
					in() {
						const extB = 2;
						{
							const extA = 1; // eslint-disable-line no-unused-vars
							return () => {
								extA = extB; // eslint-disable-line no-const-assign
							};
						}
					},
					out: '(b=>()=>{b,(()=>{const a=0;a=0})()})(2)',
					validate(set) {
						expect(set).toBeFunction();
						expect(set).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('in blocks above and below', {
					in() {
						const extB = 2;
						{
							const extA = 1; // eslint-disable-line no-unused-vars
							{
								const extC = 3;
								return () => {
									extA = extB + extC; // eslint-disable-line no-const-assign
								};
							}
						}
					},
					out: '(c=>b=>()=>{c+b,(()=>{const a=0;a=0})()})(2)(3)',
					validate(set) {
						expect(set).toBeFunction();
						expect(set).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});
			});
		});

		itSerializes('in nested function', {
			in() {
				const extA = 1;
				let extB = 2;
				return [
					() => () => {
						extA = extB++; // eslint-disable-line no-const-assign
					},
					() => extA,
					() => extB
				];
			},
			out: `(()=>{
				const a=((b,c)=>[
					()=>()=>{b++,(()=>{const a=0;a=0})()},
					()=>c,
					()=>b
				])(2,1);
				return[a[0],a[1],a[2]]
			})()`,
			validate([getSetA, getA, getB]) {
				expect(getSetA).toBeFunction();
				const setA = getSetA();
				expect(setA).toBeFunction();
				expect(setA).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				expect(getA()).toBe(1); // Assignment not made
				expect(getB()).toBe(3); // Side effect executed
			}
		});

		itSerializes('chained const violations', {
			in() {
				const extA = 1,
					extB = 2;
				let extC = 3;
				return [
					() => {
						extA = extB = extC++; // eslint-disable-line no-const-assign
					},
					() => extA,
					() => extB,
					() => extC
				];
			},
			out: `(()=>{
				const a=((c,d,e)=>[
					()=>{(c++,(()=>{const a=0;a=0})()),(()=>{const b=0;b=0})()},
					()=>d,
					()=>e,
					()=>c
				])(3,1,2);
				return[a[0],a[1],a[2],a[3]]
			})()`,
			validate([set, getA, getB, getC]) {
				expect(set).toBeFunction();
				expect(set).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
				expect(getA()).toBe(1); // Assignment not made
				expect(getB()).toBe(2); // Assignment not made
				expect(getC()).toBe(4); // Side effect executed
			}
		});

		describe('interacting with transpiled `super`', () => {
			describe('`super()`', () => {
				itSerializes('const set as `super()`', {
					in() {
						const extA = 1;
						let extB;
						class SuperKlass {
							constructor() {
								extB = 2;
							}
						}
						return [
							class extends SuperKlass {
								constructor() {
									extA = super(); // eslint-disable-line no-const-assign
								}
							},
							() => extA,
							() => extB
						];
					},
					out: `(()=>{
						const a=Object.setPrototypeOf,
							b=((a,b)=>[
								class SuperKlass{
									constructor(){
										b=2
									}
								},
								()=>a,
								()=>b
							])(1),
							c=b[0],
							d=(
								c=>c=(0,class{
									constructor(){
										let a;
										a=Reflect.construct(Object.getPrototypeOf(c),[],c),(()=>{const b=0;b=0})();
										return a
									}
								})
							)();
						a(d,c);
						a(d.prototype,c.prototype);
						return[d,b[1],b[2]]
					})()`,
					validate([Klass, getExtA, getExtB]) {
						expect(Klass).toBeFunction();
						expect(() => new Klass()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(getExtA()).toBe(1); // `ext` not set
						expect(getExtB()).toBe(2); // `SuperKlass` constructor called
					}
				});

				itSerializes('`super()` called with const violation', {
					in() {
						const extA = 1;
						let extB;
						class SuperKlass {
							constructor() {
								extB = 2;
							}
						}
						return [
							class extends SuperKlass {
								constructor() {
									super(extA = 3); // eslint-disable-line no-const-assign
								}
							},
							() => extA,
							() => extB
						];
					},
					out: `(()=>{
						const a=Object.setPrototypeOf,
							b=((a,b)=>[
								class SuperKlass{
									constructor(){
										b=2
									}
								},
								()=>a,
								()=>b
							])(1),
							c=b[0],
							d=(
								b=>b=(0,class{
									constructor(){
										return Reflect.construct(Object.getPrototypeOf(b),[(3,(()=>{const a=0;a=0})())],b)
									}
								})
							)();
						a(d,c);
						a(d.prototype,c.prototype);
						return[d,b[1],b[2]]
					})()`,
					validate([Klass, getExtA, getExtB]) {
						expect(Klass).toBeFunction();
						expect(() => new Klass()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(getExtA()).toBe(1); // `ext` not set
						expect(getExtB()).toBeUndefined(); // `SuperKlass` constructor not called
					}
				});
			});

			describe('`super` prop', () => {
				itSerializes('const set as `super` property', {
					in() {
						const ext = 1;
						return [
							Object.setPrototypeOf(
								{
									f() {
										ext = super.x; // eslint-disable-line no-const-assign
									}
								},
								{
									get x() { // eslint-disable-line getter-return
										this.y = 2;
									}
								}
							),
							() => ext
						];
					},
					out: `(()=>{
						const a=(b=>[
								a=>b=a,
								{
									f(){
										Reflect.get(Object.getPrototypeOf(b),"x",this),(()=>{const a=0;a=0})()
									}
								}.f
							])(),
							b=Object,
							c=b.assign(
								b.create(
									b.defineProperties(
										{},
										{
											x:{
												get:{"get x"(){this.y=2}}["get x"],
												enumerable:true,
												configurable:true
											}
										}
									)
								),
								{
									f:a[1]
								}
							);
						a[0](c);
						return[c,(a=>()=>a)(1)]
					})()`,
					validate([obj, getExt]) {
						expect(obj).toBeObject();
						expect(obj.y).toBeUndefined();
						expect(() => obj.f()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(obj.y).toBe(2); // `x` getter called
						expect(getExt()).toBe(1); // `ext` not set
					}
				});

				itSerializes('set as const', {
					in() {
						const ext = 1;
						return [
							Object.setPrototypeOf(
								{
									f() {
										super.x = ext = 2; // eslint-disable-line no-const-assign
									}
								},
								{
									set x(v) {
										this.y = v;
									}
								}
							),
							() => ext
						];
					},
					out: `(()=>{
						const a=(b=>[
								a=>b=a,
								{
									f(){
										Reflect.set(Object.getPrototypeOf(b),"x",(2,(()=>{const a=0;a=0})()),this)
									}
								}.f
							])(),
							b=Object,
							c=b.assign(
								b.create(
									b.defineProperties(
										{},
										{
											x:{
												set:{"set x"(a){this.y=a}}["set x"],
												enumerable:true,
												configurable:true
											}
										}
									)
								),
								{f:a[1]}
							);
						a[0](c);
						return[c,(a=>()=>a)(1)]
					})()`,
					validate([obj, getExt]) {
						expect(obj).toBeObject();
						expect(obj.y).toBeUndefined();
						expect(() => obj.f()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(obj.y).toBeUndefined(); // `x` setter not called
						expect(getExt()).toBe(1); // `ext` not set
					}
				});

				itSerializes('const violation in `super` property key', {
					in() {
						const ext = 'x';
						return [
							Object.setPrototypeOf(
								{
									f() {
										super[ext = 1] = 2; // eslint-disable-line no-const-assign
									}
								},
								{
									set x(v) {
										this.y = v;
									}
								}
							),
							() => ext
						];
					},
					out: `(()=>{
						const a=(b=>[
								a=>b=a,
								{
									f(){
										Reflect.set(Object.getPrototypeOf(b),(1,(()=>{const a=0;a=0})()),2,this)
									}
								}.f
							])(),
							b=Object,
							c=b.assign(
								b.create(
									b.defineProperties(
										{},
										{
											x:{
												set:{"set x"(a){this.y=a}}["set x"],
												enumerable:true,
												configurable:true
											}
										}
									)
								),
								{f:a[1]}
							);
						a[0](c);
						return[c,(a=>()=>a)("x")]
					})()`,
					validate([obj, getExt]) {
						expect(obj).toBeObject();
						expect(obj.y).toBeUndefined();
						expect(() => obj.f()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(obj.y).toBeUndefined(); // `x` setter not called
						expect(getExt()).toBe('x'); // `ext` not set
					}
				});
			});

			describe('`super` prop call', () => {
				itSerializes('const set as `super` prop call', {
					in() {
						const ext = 1;
						return [
							Object.setPrototypeOf(
								{
									f() {
										ext = super.x(2); // eslint-disable-line no-const-assign
									}
								},
								{
									x(v) {
										this.y = v;
									}
								}
							),
							() => ext
						];
					},
					out: `(()=>{
						const a=(b=>[
								a=>b=a,
								{
									f(){
										Reflect.get(Object.getPrototypeOf(b),"x",this).call(this,2),(()=>{const a=0;a=0})()
									}
								}.f
							])(),
							b=Object,
							c=b.assign(
								b.create({
									x(a){this.y=a}
								}),
								{
									f:a[1]
								}
							);
						a[0](c);
						return[c,(a=>()=>a)(1)]
					})()`,
					validate([obj, getExt]) {
						expect(obj).toBeObject();
						expect(obj.y).toBeUndefined();
						expect(() => obj.f()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(obj.y).toBe(2); // `x()` called
						expect(getExt()).toBe(1); // `ext` not set
					}
				});

				itSerializes('`super` prop call with const violation argument', {
					in() {
						const ext = 1;
						return [
							Object.setPrototypeOf(
								{
									f() {
										super.x(ext = 2); // eslint-disable-line no-const-assign
									}
								},
								{
									x(v) {
										this.y = v;
									}
								}
							),
							() => ext
						];
					},
					out: `(()=>{
						const a=(b=>[
								a=>b=a,
								{
									f(){
										Reflect.get(Object.getPrototypeOf(b),"x",this).call(this,(2,(()=>{const a=0;a=0})()))
									}
								}.f
							])(),
							b=Object,
							c=b.assign(
								b.create({
									x(a){this.y=a}
								}),
								{
									f:a[1]
								}
							);
						a[0](c);
						return[c,(a=>()=>a)(1)]
					})()`,
					validate([obj, getExt]) {
						expect(obj).toBeObject();
						expect(obj.y).toBeUndefined();
						expect(() => obj.f()).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
						expect(obj.y).toBeUndefined(); // `x()` not called
						expect(getExt()).toBe(1); // `ext` not set
					}
				});
			});
		});

		describe('inside serialized function are not altered', () => {
			describe('const var', () => {
				itSerializes('directly within function', {
					in() {
						return () => {
							const x = 1;
							x = 2; // eslint-disable-line no-const-assign, no-unused-vars
						};
					},
					out: '()=>{const a=1;a=2}',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('within nested function 1 deep', {
					in() {
						return () => {
							const x = 1; // eslint-disable-line no-unused-vars
							return () => { x = 2; }; // eslint-disable-line no-const-assign
						};
					},
					out: '()=>{const a=1;return()=>{a=2}}',
					validate(fn) {
						expect(fn).toBeFunction();
						const innerFn = fn();
						expect(innerFn).toBeFunction();
						expect(innerFn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('within nested function 2 deep', {
					in() {
						return () => {
							const x = 1; // eslint-disable-line no-unused-vars
							return () => () => { x = 2; }; // eslint-disable-line no-const-assign
						};
					},
					out: '()=>{const a=1;return()=>()=>{a=2}}',
					validate(fn) {
						expect(fn).toBeFunction();
						const innerFn = fn();
						expect(innerFn).toBeFunction();
						const innerFn2 = innerFn();
						expect(innerFn2).toBeFunction();
						expect(innerFn2).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});
			});

			describe('function expression name', () => {
				itSerializes('directly within function', {
					in() {
						return () => function f() {
							f = 1; // eslint-disable-line no-func-assign
						};
					},
					out: '()=>function f(){f=1}',
					validate(getFn) {
						expect(getFn).toBeFunction();
						const fn = getFn();
						expect(fn).toBeFunction();
						expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('within nested function 1 deep', {
					in() {
						return () => function f() {
							return () => { f = 1; }; // eslint-disable-line no-func-assign
						};
					},
					out: '()=>function f(){return()=>{f=1}}',
					validate(getFn) {
						expect(getFn).toBeFunction();
						const fn = getFn();
						expect(fn).toBeFunction();
						const innerFn = fn();
						expect(innerFn).toBeFunction();
						expect(innerFn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('within nested function 2 deep', {
					in() {
						return () => function f() {
							return () => () => { f = 1; }; // eslint-disable-line no-func-assign
						};
					},
					out: '()=>function f(){return()=>()=>{f=1}}',
					validate(getFn) {
						expect(getFn).toBeFunction();
						const fn = getFn();
						expect(fn).toBeFunction();
						const innerFn = fn();
						expect(innerFn).toBeFunction();
						const innerFn2 = innerFn();
						expect(innerFn2).toBeFunction();
						expect(innerFn2).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});
			});

			describe('class name', () => {
				itSerializes('directly within class method', {
					in() {
						return () => class X {
							foo() { // eslint-disable-line class-methods-use-this
								X = 1; // eslint-disable-line no-class-assign
							}
						};
					},
					out: '()=>class X{foo(){X=1}}',
					validate(getKlass) {
						expect(getKlass).toBeFunction();
						const Klass = getKlass();
						expect(Klass).toBeFunction();
						const fn = new Klass().foo;
						expect(fn).toBeFunction();
						expect(fn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('within nested function 1 deep', {
					in() {
						return () => class X {
							foo() { // eslint-disable-line class-methods-use-this
								return () => { X = 1; }; // eslint-disable-line no-class-assign
							}
						};
					},
					out: '()=>class X{foo(){return()=>{X=1}}}',
					validate(getKlass) {
						expect(getKlass).toBeFunction();
						const Klass = getKlass();
						expect(Klass).toBeFunction();
						const fn = new Klass().foo;
						expect(fn).toBeFunction();
						const innerFn = fn();
						expect(innerFn).toBeFunction();
						expect(innerFn).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});

				itSerializes('within nested function 2 deep', {
					in() {
						return () => class X {
							foo() { // eslint-disable-line class-methods-use-this
								return () => () => { X = 1; }; // eslint-disable-line no-class-assign
							}
						};
					},
					out: '()=>class X{foo(){return()=>()=>{X=1}}}',
					validate(getKlass) {
						expect(getKlass).toBeFunction();
						const Klass = getKlass();
						expect(Klass).toBeFunction();
						const fn = new Klass().foo;
						expect(fn).toBeFunction();
						const innerFn = fn();
						expect(innerFn).toBeFunction();
						const innerFn2 = innerFn();
						expect(innerFn2).toBeFunction();
						expect(innerFn2).toThrowWithMessage(TypeError, 'Assignment to constant variable.');
					}
				});
			});
		});
	});

	describe('directives retained', () => {
		/* eslint-disable lines-around-directive */
		describe('in exported', () => {
			describe('function expression', () => {
				itSerializes('with 1 directive', {
					in() {
						return function() {
							'use fake';
							return 1;
						};
					},
					out: 'function(){"use fake";return 1}',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(1);
					}
				});

				itSerializes('with multiple directives', {
					in() {
						return function() {
							'use fake';
							"use bogus"; // eslint-disable-line quotes
							'use phoney';
							return 1;
						};
					},
					out: 'function(){"use fake";"use bogus";"use phoney";return 1}',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(1);
					}
				});
			});

			describe('arrow function', () => {
				itSerializes('with 1 directive', {
					in() {
						return () => {
							'use fake';
							return 1;
						};
					},
					out: '()=>{"use fake";return 1}',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(1);
					}
				});

				itSerializes('with multiple directives', {
					in() {
						return () => {
							'use fake';
							"use bogus"; // eslint-disable-line quotes
							'use phoney';
							return 1;
						};
					},
					out: '()=>{"use fake";"use bogus";"use phoney";return 1}',
					validate(fn) {
						expect(fn).toBeFunction();
						expect(fn()).toBe(1);
					}
				});
			});
		});

		describe('in nested', () => {
			describe('function expression', () => {
				itSerializes('with 1 directive', {
					in() {
						return function() {
							return function() {
								'use fake';
								return 1;
							};
						};
					},
					out: 'function(){return function(){"use fake";return 1}}',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn();
						expect(fnInner).toBeFunction();
						expect(fnInner()).toBe(1);
					}
				});

				itSerializes('with multiple directives', {
					in() {
						return function() {
							return function() {
								'use fake';
								"use bogus"; // eslint-disable-line quotes
								'use phoney';
								return 1;
							};
						};
					},
					out: 'function(){return function(){"use fake";"use bogus";"use phoney";return 1}}',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn();
						expect(fnInner).toBeFunction();
						expect(fnInner()).toBe(1);
					}
				});
			});

			describe('arrow function', () => {
				itSerializes('with 1 directive', {
					in() {
						return () => () => {
							'use fake';
							return 1;
						};
					},
					out: '()=>()=>{"use fake";return 1}',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn();
						expect(fnInner).toBeFunction();
						expect(fnInner()).toBe(1);
					}
				});

				itSerializes('with multiple directives', {
					in() {
						return () => () => {
							'use fake';
							"use bogus"; // eslint-disable-line quotes
							'use phoney';
							return 1;
						};
					},
					out: '()=>()=>{"use fake";"use bogus";"use phoney";return 1}',
					validate(fn) {
						expect(fn).toBeFunction();
						const fnInner = fn();
						expect(fnInner).toBeFunction();
						expect(fnInner()).toBe(1);
					}
				});
			});
		});
		/* eslint-enable lines-around-directive */
	});

	itSerializes('strings in function rendered with double quotes', {
		in() {
			// eslint-disable-next-line prefer-template, quotes, no-useless-concat
			return () => 'w' + "x" + {'z z': "y"}['z z'];
		},
		out: '()=>"w"+"x"+{"z z":"y"}["z z"]',
		validate(fn) {
			expect(fn).toBeFunction();
			expect(fn()).toBe('wxy');
		}
	});

	describe('placement of tracker does not disrupt normal functioning', () => {
		itSerializes.each(
			[
				// Simple parameters
				['() => []', 0, [], []],
				['x => [x]', 1, [1], [1]],
				['(x, y, z) => [x, y, z]', 3, [1, 2, 3], [1, 2, 3]],

				// Object deconstruction
				['({x}) => [x]', 1, [{x: 1}], [1]],
				[
					'({x = 1}) => [x]',
					1,
					[{}], [1],
					[{x: 2}], [2]
				],
				['({["a" + ""]: x}) => [x]', 1, [{a: 1}], [1]],
				['({}) => []', 1, [{}], []],

				// Array deconstruction
				['([x]) => [x]', 1, [[1]], [1]],
				['([[[x]]]) => [x]', 1, [[[[1]]]], [1]],
				['([{x}]) => [x]', 1, [[{x: 1}]], [1]],
				['([]) => []', 1, [[]], []],
				['([[]]) => []', 1, [[[]]], []],
				['([{}]) => []', 1, [[{}]], []],

				// Defaults
				[
					'(x = 1) => [x]',
					0,
					[], [1],
					[2], [2]
				],
				[
					'({x} = {x: 1}) => [x]',
					0,
					[], [1],
					[{x: 2}], [2]
				],

				// Rest parameter
				['(...x) => [x]', 0, [1, 2, 3], [[1, 2, 3]]],
				['(x, y, ...z) => [x, y, z]', 2, [1, 2, 3, 4, 5], [1, 2, [3, 4, 5]]],
				[
					'(x = 10, y, ...z) => [x, y, z]',
					0,
					[1, 2, 3, 4, 5], [1, 2, [3, 4, 5]],
					[undefined, 2, 3, 4, 5], [10, 2, [3, 4, 5]]
				],
				[
					'(x = 10, y, ...z) => { return [x, y, z] }',
					0,
					[1, 2, 3, 4, 5], [1, 2, [3, 4, 5]],
					[undefined, 2, 3, 4, 5], [10, 2, [3, 4, 5]]
				],
				['(...[x]) => [x]', 0, [1, 2, 3], [1]],
				[
					'(...[x = 1]) => [x]',
					0,
					[], [1],
					[2], [2]
				],
				['(...[, , x, , y]) => [x, y]', 0, [1, 2, 3, 4, 5], [3, 5]],
				['(...{1: x, length: y}) => [x, y]', 0, [1, 2, 33], [2, 3]],
				['(...{...x}) => [x]', 0, [1, 2, 3], [{0: 1, 1: 2, 2: 3}]],

				// Array rest
				['([...x]) => [x]', 1, [[1, 2, 3], 4], [[1, 2, 3]]],
				['([[[...x]]]) => [x]', 1, [[[[1, 2, 3], 4], 5]], [[1, 2, 3]]],
				['([...[...[...x]]]) => [x]', 1, [[1, 2, 3]], [[1, 2, 3]]],
				['([...x], [...y]) => [x, y]', 2, [[1, 2, 3], [4, 5, 6], 7], [[1, 2, 3], [4, 5, 6]]],
				['([...{length}]) => [length]', 1, [[1, 2, 33]], [3]],
				['([...{length: x}]) => [x]', 1, [[1, 2, 33]], [3]],
				['([...[...[...{length}]]]) => [length]', 1, [[1, 2, 33]], [3]],

				// Object rest
				['({...x}) => [x]', 1, [{a: 1, b: 2}], [{a: 1, b: 2}]],
				['({...x}, y) => [x, y]', 2, [{a: 1, b: 2}, 3], [{a: 1, b: 2}, 3]],
				['({...x}, {y}) => [x, y]', 2, [{a: 1, b: 2}, {y: 3}], [{a: 1, b: 2}, 3]],
				['({...x}, {...y}) => [x, y]', 2, [{a: 1, b: 2}, {c: 3, d: 4}], [{a: 1, b: 2}, {c: 3, d: 4}]]
			],
			'%s',
			(fnStr, len, ...callAndReturns) => {
				// Add reference to external var `ext` return value to ensure function is called when serializing
				// `x => [x]` -> `ext => x => (ext, [x])`
				const fnStrWithExtAdded = `ext => ${fnStr.replace(
					/=> (.+?)$/,
					(_, ret) => (ret[0] === '{' ? `=> {ext; ${ret.slice(1)}` : `=> (ext, ${ret})`)
				)}`;

				return {
					in: () => (0, eval)(fnStrWithExtAdded), // eslint-disable-line no-eval
					strictEnv: false,
					validate(wrapperFn, {isOutput, outputJs, minify, mangle, inline}) {
						const fn = wrapperFn();
						expect(fn).toBeFunction();
						expect(fn).toHaveLength(len);

						for (let i = 0; i < callAndReturns.length; i += 2) {
							const callArgs = callAndReturns[i],
								expectedRes = callAndReturns[i + 1];
							expect(fn(...callArgs)).toEqual(expectedRes);
						}

						if (isOutput && minify && !mangle && inline) {
							expect(stripLineBreaks(outputJs)).toBe(fnStrWithExtAdded.replace(/ /g, ''));
						}
					}
				};
			}
		);
	});

	describe('instrumentation preserves temporal dead zone violations in function params in', () => {
		describe('param default', () => {
			it('no external var', () => {
				const fn = (x = y, y) => [x, y]; // eslint-disable-line no-use-before-define, default-param-last
				expect(fn).toThrowWithMessage(ReferenceError, "Cannot access 'y' before initialization");
			});

			it('with external var', () => {
				const y = 1; // eslint-disable-line no-unused-vars
				// eslint-disable-next-line no-use-before-define, no-shadow, default-param-last
				const fn = (x = y, y) => [x, y];
				expect(fn).toThrowWithMessage(ReferenceError, "Cannot access 'y' before initialization");
			});
		});

		describe('deconstruction object key', () => {
			it('no external var', () => {
				const fn = ({[y]: x}, y) => [x, y]; // eslint-disable-line no-use-before-define
				expect(() => fn({})).toThrowWithMessage(
					ReferenceError, "Cannot access 'y' before initialization"
				);
			});

			it('with external var', () => {
				const y = 1; // eslint-disable-line no-unused-vars
				const fn = ({[y]: x}, y) => [x, y]; // eslint-disable-line no-use-before-define, no-shadow
				expect(() => fn({})).toThrowWithMessage(
					ReferenceError, "Cannot access 'y' before initialization"
				);
			});
		});
	});

	describe('serializing function does not cause side effects', () => {
		itSerializes.each(
			[
				// Defaults
				'(x = mutate()) => x',
				'(x, y = mutate()) => [x, y]',
				'(y = mutate()) => [x, y]',
				'([x = mutate()]) => x',
				'([[x = mutate()]]) => x',
				'({x = mutate()}) => x',
				'({x, y = mutate()}) => [x, y]',
				'({x: y = mutate()}) => y',
				'([...[x = mutate()]]) => x',
				'([...[x, y = mutate()]]) => [x, y]',
				'([...[...[x = mutate()]]]) => x',
				'({...x}, y = mutate()) => [x, y]',
				'(...[x = mutate()]) => x',
				'(...[x, y = mutate()]) => [x, y]',
				'(...{x = mutate()}) => x',
				'(...{x: y = mutate()}) => y',
				'(...{x, y = mutate()}) => [x, y]',

				// Computed object keys
				'({[mutate()]: x}) => x',
				'(x, {[mutate()]: y}) => [x, y]',
				'({x, [mutate()]: y}) => [x, y]',
				'({a: {[mutate()]: x}}) => x',
				'([{[mutate()]: x}]) => x',
				'([...{[mutate()]: x}]) => x',
				'(...{[mutate()]: x}) => x',
				'(...[...{[mutate()]: x}]) => x'
			].map(fnStr => [fnStr]),
			'%s',
			fnStr => ({
				in() {
					return (0, eval)(`mutate => ${fnStr}`); // eslint-disable-line no-eval
				},
				validate(wrapperFn) {
					const mutate = spy();
					const fn = wrapperFn(mutate);
					expect(fn).toBeFunction();
					expect(mutate).not.toHaveBeenCalled();
				}
			})
		);
	});

	describe('generator functions evaluate complex params when called', () => {
		// These tests are to make sure changes made to functions with complex params in instrumentation
		// does not alter behavior
		itSerializes('generator function', {
			in() {
				return function*(x, y = x()) {}; // eslint-disable-line no-unused-vars, no-empty-function
			},
			out: 'function*(a,b=a()){}',
			validate(fn) {
				expect(fn).toBeFunction();
				const s = spy();
				fn(s);
				expect(s).toHaveBeenCalledTimes(1);
			}
		});

		itSerializes('async generator function', {
			in() {
				return async function*(x, y = x()) {}; // eslint-disable-line no-unused-vars, no-empty-function
			},
			out: 'async function*(a,b=a()){}',
			async validate(fn) {
				expect(fn).toBeFunction();
				const s = spy();
				const p = fn(s);
				expect(s).toHaveBeenCalledTimes(1);
				await p;
			}
		});
	});

	itSerializes('`*/` in filename does not disrupt functioning', {
		in: {
			'foo*/index.js': 'const ext = 1; module.exports = () => ext;'
		},
		out: '(a=>()=>a)(1)',
		strictEnv: false,
		validate(fn, {fixturePath}) {
			expect(fn).toBeFunction();
			expect(fn()).toBe(1);

			expect(fixturePath).toInclude('*/');
		}
	});
});
