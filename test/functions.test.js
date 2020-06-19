/* --------------------
 * livepack module
 * Tests for functions
 * ------------------*/

'use strict';

// Imports
const {run} = require('./support/index.js');

// Tests

describe('functions', () => {
	describe('without scope', () => {
		describe('single instantiation of function', () => {
			it('arrow function', () => {
				const input = (x, y) => [x, y];
				const out = run(input, '(x,y)=>[x,y]');

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
				const out = run(input, '(function input(x,y){return[x,y,this];})');

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
				const out = run(input, '(function input(x,y){return[x,y,this];})');

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
		});

		it('multiple instantiations of function', () => {
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
		});

		it('multiple instantiations of function', () => {
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

			const resABs = out.map((item) => {
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

	describe('with vars from above scope', () => {
		it('single instantiation of scope', () => {
			const extA = {extA: 1};
			function outer(b, c) {
				return function(x, y) {
					return [x, y, this, extA, b, c]; // eslint-disable-line no-invalid-this
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
			function outer(b, c) {
				return function(x, y) {
					return [x, y, this, extA, b, c]; // eslint-disable-line no-invalid-this
				};
			}
			const exts = [
				{b: {extB1: 11}, c: {extC1: 12}},
				{b: {extB2: 21}, c: {extC2: 22}},
				{b: {extB3: 31}, c: {extC3: 32}}
			];
			const input = exts.map(({b: extB, c: extC}) => outer(extB, extC));
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
				expect(res[4]).toEqual(exts[index].b);
				expect(res[5]).toEqual(exts[index].c);
				return res[3];
			});

			expect(resAs[0]).toBe(resAs[1]);
			expect(resAs[0]).toBe(resAs[2]);
		});
	});

	describe('with vars from above nested scopes', () => {
		it('single instantiation of scope', () => {
			const extA = {extA: 1};
			function outer(b) {
				return function inner(c) {
					return function(x, y) {
						return [x, y, this, extA, b, c]; // eslint-disable-line no-invalid-this
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
			function outer(b) {
				return function inner(c) {
					return function(x, y) {
						return [x, y, this, extA, b, c]; // eslint-disable-line no-invalid-this
					};
				};
			}
			const exts = [
				{b: {extB1: 11}, c: {extC1: 12}},
				{b: {extB2: 21}, c: {extC2: 22}},
				{b: {extB3: 31}, c: {extC3: 32}}
			];
			const input = exts.map(({b: extB, c: extC}) => outer(extB)(extC));
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
				expect(res[3]).toEqual(exts[index].b);
				expect(res[4]).toEqual(exts[index].c);
			});

			expect(resAs[0]).toBe(resAs[1]);
			expect(resAs[0]).toBe(resAs[2]);
		});

		it('multiple instantiations of scope with shared upper scope', () => {
			const extA = {extA: 1};
			function outer(b) {
				return function inner(c) {
					return function(x, y) {
						return [x, y, this, extA, b, c]; // eslint-disable-line no-invalid-this
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
