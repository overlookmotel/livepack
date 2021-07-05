/* --------------------
 * livepack module
 * Tests for symbols
 * ------------------*/

'use strict';

// Imports
const {itSerializes, stripSourceMapComment} = require('./support/index.js');

// Tests

describe('Symbols', () => {
	itSerializes('named symbol', {
		in: () => Symbol('foo'),
		out: 'Symbol("foo")',
		validate: sym => expect(typeof sym).toBe('symbol')
	});

	itSerializes('unnamed symbol', {
		in: () => Symbol(), // eslint-disable-line symbol-description
		out: 'Symbol()',
		validate: sym => expect(typeof sym).toBe('symbol')
	});

	itSerializes('symbol with empty string description', {
		in: () => Symbol(''),
		out: 'Symbol("")',
		validate: sym => expect(typeof sym).toBe('symbol')
	});

	itSerializes('global symbol', {
		in: () => Symbol.for('bar'),
		out: 'Symbol.for("bar")',
		validate(sym, {isOutput, input}) {
			expect(typeof sym).toBe('symbol');
			expect(Symbol.keyFor(sym)).toBe('bar');
			if (isOutput) expect(sym).toBe(input);
		}
	});

	itSerializes('name var after symbol description', {
		minify: true,
		inline: true,
		mangle: false,
		in() {
			const s = Symbol('foo bar');
			return [s, s];
		},
		validateOutput(arr, {outputJs}) {
			expect(stripSourceMapComment(outputJs))
				.toBe('(()=>{const foo_bar=Symbol("foo bar");return[foo_bar,foo_bar]})()');
		}
	});
});
