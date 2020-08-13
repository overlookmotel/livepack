/* --------------------
 * livepack module
 * Serialize symbols
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{emptyStringSymbols} = require('../internal.js');

// Exports

module.exports = {
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

		// Get symbol description.
		// In Node v10, `.description` is not supported - get description from `.toString()` instead.
		// Distinguish between `Symbol()` and `Symbol('')` by reference to `emptyStringSymbols`.
		// NB `emptyStringSymbols` is undefined if Symbol descriptions is supported.
		let {description} = symbol;
		if (description === undefined && emptyStringSymbols) {
			if (emptyStringSymbols.has(symbol)) {
				description = '';
			} else {
				description = symbol.toString().slice(7, -1) || undefined;
			}
		}

		// Name var by symbol description
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
