/* --------------------
 * livepack module
 * Shim `Symbol` to record Symbols with empty string description in Node v10
 * ------------------*/

'use strict';

// Exports

module.exports = function getEmptyStringSymbols() {
	if (Symbol('x').description) return undefined;

	const emptyStringSymbols = new Set();

	const SymbolOriginal = Symbol;
	Symbol = function Symbol(description) { // eslint-disable-line no-global-assign
		const symbol = SymbolOriginal(description);
		if (description === '') emptyStringSymbols.add(symbol);
		return symbol;
	};

	Object.defineProperties(Symbol, Object.getOwnPropertyDescriptors(SymbolOriginal));
	Symbol.prototype.constructor = Symbol; // eslint-disable-line no-extend-native

	return emptyStringSymbols;
};
