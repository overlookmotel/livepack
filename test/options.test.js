/* --------------------
 * livepack module
 * Tests for options
 * ------------------*/

'use strict';

// Modules
const serialize = require('livepack');

// Tests

describe('Options', () => {
	describe('format', () => {
		it('default', () => {
			expect(serialize(1)).toBe('1');
		});

		it('js', () => {
			expect(serialize(1)).toBe('1');
		});

		it('cjs', () => {
			expect(serialize(1, {format: 'cjs'})).toBe('module.exports=1');
		});

		it('esm', () => {
			expect(serialize(1, {format: 'esm'})).toBe('export default 1');
		});
	});

	describe('minify', () => {
		it('default', () => {
			expect(serialize({a: 1})).toBe('({a:1})');
		});

		it('true', () => {
			expect(serialize({a: 1}, {minify: true})).toBe('({a:1})');
		});

		it('false', () => {
			expect(serialize({a: 1}, {minify: false, inline: true})).toBe('({\n  a: 1\n})\n');
		});
	});

	describe('inline', () => {
		it('default', () => {
			expect(serialize({a: {b: 1}})).toBe('({a:{b:1}})');
		});

		it('true', () => {
			expect(serialize({a: {b: 1}}, {inline: true})).toBe('({a:{b:1}})');
		});

		it('false', () => {
			expect(serialize({a: {b: 1}}, {inline: false})).toBe('(()=>{const a={b:1},b={a};return b})()');
		});
	});

	describe('mangle', () => {
		let input;
		beforeEach(() => {
			const foo = {};
			input = {foo, foo2: foo};
		});

		it('default', () => {
			expect(serialize(input)).toBe('(()=>{const a={};return{foo:a,foo2:a}})()');
		});

		it('true', () => {
			expect(serialize(input, {mangle: true})).toBe('(()=>{const a={};return{foo:a,foo2:a}})()');
		});

		it('false', () => {
			expect(serialize(input, {mangle: false})).toBe('(()=>{const foo={};return{foo,foo2:foo}})()');
		});
	});

	describe('comments', () => {
		const input = (0, () => { /* foobar */ });

		it('default', () => {
			expect(serialize(input)).toBe('()=>{}');
		});

		it('false', () => {
			expect(serialize(input, {comments: false})).toBe('()=>{}');
		});

		it('true', () => {
			expect(serialize(input, {comments: true})).toBe('()=>{/* foobar */}');
		});
	});
});
