/* --------------------
 * livepack module
 * Serialize symbols
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {SYMBOL_TYPE, SYMBOL_FOR_TYPE, registerSerializer} = require('./types.js');

// Exports

module.exports = {
	/**
	 * Trace Symbol.
	 * @param {symbol} symbol - Symbol
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceSymbol(symbol, record) {
		// Handle global symbols - `Symbol.for(...)`
		const globalDescription = Symbol.keyFor(symbol);
		if (globalDescription !== undefined) {
			record.name = globalDescription;
			record.extra = {description: globalDescription};
			return SYMBOL_FOR_TYPE;
		}

		// Handle normal symbol - `Symbol()` / `Symbol('...')
		const {description} = symbol;
		if (description) record.name = description;
		record.extra = {description};
		return SYMBOL_TYPE;
	}
};

/**
 * Serialize global Symbol.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string} record.extra.description - Symbol description
 * @returns {Object} - AST node
 */
function serializeGlobalSymbol(record) {
	return t.callExpression(
		this.traceAndSerializeGlobal(Symbol.for),
		[t.stringLiteral(record.extra.description)]
	);
}
registerSerializer(SYMBOL_FOR_TYPE, serializeGlobalSymbol);

/**
 * Serialize Symbol.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string} [record.extra.description] - Symbol description, or `undefined` if no description
 * @returns {Object} - AST node
 */
function serializeSymbol(record) {
	const {description} = record.extra;
	return t.callExpression(
		this.traceAndSerializeGlobal(Symbol),
		description === undefined ? [] : [t.stringLiteral(description)]
	);
}
registerSerializer(SYMBOL_TYPE, serializeSymbol);
