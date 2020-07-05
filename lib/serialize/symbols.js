/* --------------------
 * livepack module
 * Serialize symbols
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js');

// Constants
const SYMBOL_DESCRIPTIONS_NOT_SUPPORTED = !Symbol('x').description;

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
		// Impossible to distinguish between `Symbol()` and `Symbol('')` in this case - assume `Symbol()`.
		let {description} = symbol;
		if (description === undefined && SYMBOL_DESCRIPTIONS_NOT_SUPPORTED) {
			description = symbol.toString().slice(7, -1) || undefined;
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
