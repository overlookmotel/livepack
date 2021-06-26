/* --------------------
 * livepack module
 * Serialize symbols
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js');

// Exports

module.exports = {
	traceSymbol(val, record) { // eslint-disable-line no-unused-vars
		// TODO
		throw new Error('Symbols not supported');
	},

	serializeSymbol(symbol, record) {
		// Handle global symbols - `Symbol.for(...)`
		const globalDescription = Symbol.keyFor(symbol);
		if (globalDescription !== undefined) {
			const symbolForRecord = this.serializeValue(Symbol.for);
			const node = t.callExpression(
				symbolForRecord.varNode,
				[t.stringLiteral(globalDescription)]
			);
			createDependency(record, symbolForRecord, node, 'callee');
			return node;
		}

		// Name var by symbol description
		const {description} = symbol;
		if (description) record.varNode.name = description;

		// Output `Symbol(...)`
		const symbolCtorRecord = this.serializeValue(Symbol);
		const node = t.callExpression(
			symbolCtorRecord.varNode,
			description === undefined ? [] : [t.stringLiteral(description)]
		);
		createDependency(record, symbolCtorRecord, node, 'callee');
		return node;
	}
};
