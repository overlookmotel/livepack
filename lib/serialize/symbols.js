/* --------------------
 * livepack module
 * Serialize symbols
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{firstMapKey} = require('./utils.js');

// Exports

module.exports = {
	/**
	 * Trace Symbol.
	 * @param {symbol} symbol - Symbol
	 * @param {Object} record - Record
	 * @returns {Function} - Serializer function
	 */
	traceSymbol(symbol, record) {
		// Handle global symbols - `Symbol.for(...)`
		const globalDescription = Symbol.keyFor(symbol);
		if (globalDescription !== undefined) {
			const symbolForRecord = this.traceValue(Symbol.for);
			createDependency(record, symbolForRecord);

			record.name = globalDescription;
			record.extra = {description: globalDescription};
			return this.serializeGlobalSymbol;
		}

		// Handle normal symbol - `Symbol()` / `Symbol('...')
		const {description} = symbol;
		if (description) record.name = description;
		record.extra = {description};

		const symbolCtorRecord = this.traceValue(Symbol);
		createDependency(record, symbolCtorRecord);
		return this.serializeSymbol;
	},

	/**
	 * Serialize global Symbol.
	 * `Symbol.for` will be first dependency.
	 * @param {Object} record - Record
	 * @param {Object} record.extra - Extra props object
	 * @param {string} record.extra.description - Symbol description
	 * @returns {Object} - AST node
	 */
	serializeGlobalSymbol(record) {
		const symbolForNode = this.serializeValue(firstMapKey(record.dependencies));
		return t.callExpression(
			symbolForNode,
			[t.stringLiteral(record.extra.description)]
		);
	},

	/**
	 * Serialize Symbol.
	 * `Symbol` will be first dependency.
	 * @param {Object} record - Record
	 * @param {Object} record.extra - Extra props object
	 * @param {string} [record.extra.description] - Symbol description, or `undefined` if no description
	 * @returns {Object} - AST node
	 */
	serializeSymbol(record) {
		const symbolCtorNode = this.serializeValue(firstMapKey(record.dependencies));
		const {description} = record.extra;
		return t.callExpression(
			symbolCtorNode,
			description === undefined ? [] : [t.stringLiteral(description)]
		);
	}
};
