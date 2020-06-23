/* --------------------
 * livepack module
 * Tests for symbols
 * ------------------*/

'use strict';

// Modules
const parseNodeVersion = require('parse-node-version');

// Imports
const {describeWithAllOptions} = require('./support/index.js');

// Tests

const itIfNode12Plus = parseNodeVersion(process.version).major >= 12 ? it : it.skip;

describeWithAllOptions('symbols', ({run}) => {
	it('named symbol', () => {
		const output = run(Symbol('foo'), 'Symbol("foo")');
		expect(typeof output).toBe('symbol');
	});

	it('unnamed symbol', () => {
		const output = run(Symbol(), 'Symbol()'); // eslint-disable-line symbol-description
		expect(typeof output).toBe('symbol');
	});

	// Skip this test on Node v10 - cannot tell difference on Node v10 between `Symbol()` and `Symbol('')`
	itIfNode12Plus('symbol with empty string description', () => {
		const output = run(Symbol(''), 'Symbol("")');
		expect(typeof output).toBe('symbol'); // eslint-disable-line jest/no-standalone-expect
	});

	it('global symbol', () => {
		const output = run(Symbol.for('bar'), 'Symbol.for("bar")');
		expect(typeof output).toBe('symbol');
	});
});
