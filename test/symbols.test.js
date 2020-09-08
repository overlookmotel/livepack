/* --------------------
 * livepack module
 * Tests for symbols
 * ------------------*/

'use strict';

// Imports
const {describeWithAllOptions, stripSourceMapComment} = require('./support/index.js');

// Tests

describeWithAllOptions('Symbols', ({run, serialize, minify, mangle, inline}) => {
	it('named symbol', () => {
		const output = run(Symbol('foo'), 'Symbol("foo")');
		expect(typeof output).toBe('symbol');
	});

	it('unnamed symbol', () => {
		const output = run(Symbol(), 'Symbol()'); // eslint-disable-line symbol-description
		expect(typeof output).toBe('symbol');
	});

	it('symbol with empty string description', () => {
		const output = run(Symbol(''), 'Symbol("")');
		expect(typeof output).toBe('symbol');
	});

	it('global symbol', () => {
		const output = run(Symbol.for('bar'), 'Symbol.for("bar")');
		expect(typeof output).toBe('symbol');
	});

	if (minify && inline && !mangle) {
		it('name var after symbol description', () => {
			const s = Symbol('foo bar');
			const input = [s, s];
			const js = serialize(input);

			expect(stripSourceMapComment(js))
				.toBe('(()=>{const foo_bar=Symbol("foo bar");return[foo_bar,foo_bar]})()');
		});
	}
});
