/* --------------------
 * livepack module
 * Serialize symbols
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Constants
const SYMBOL_DESCRIPTIONS_NOT_SUPPORTED = !Symbol('x').description;

// Exports

module.exports = function serializeSymbol(symbol) {
	const node = serializeSymbolToNode(symbol);
	return {node};
};

function serializeSymbolToNode(symbol) {
	// Handle global symbols - `Symbol.for(...)`
	const globalDescription = Symbol.keyFor(symbol);
	if (globalDescription !== undefined) {
		return t.callExpression(
			t.memberExpression(
				t.identifier('Symbol'),
				t.identifier('for')
			),
			[t.stringLiteral(globalDescription)]
		);
	}

	// Get symbol description.
	// In Node v10, `.description` is not supported - get description from `.toString()` instead.
	// Impossible to distinguish between `Symbol()` and `Symbol('')` in this case - assume `Symbol()`.
	let {description} = symbol;
	if (description === undefined && SYMBOL_DESCRIPTIONS_NOT_SUPPORTED) {
		description = symbol.toString().slice(7, -1) || undefined;
	}

	// Output `Symbol(...)`
	return t.callExpression(
		t.identifier('Symbol'),
		description === undefined ? [] : [t.stringLiteral(description)]
	);
}
