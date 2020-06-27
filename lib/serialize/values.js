/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const {isObject, isFunction, isArray, isSymbol, isArguments} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {isPrimitive, serializePrimitive} = require('./primitives.js'),
	serializeSymbol = require('./symbols.js');

// Exports

module.exports = {
	serializeValue(val, name) {
		if (isPrimitive(val)) return {node: serializePrimitive(val)};

		let record = this.records.get(val);
		if (!record) {
			// Create record and serialize value
			record = this.createRecord(val, t.identifier(name));
			record.node = this.serializeThing(val, record, name);
		}

		return record;
	},

	serializeThing(val, record, name) {
		if (isSymbol(val)) return serializeSymbol(val);
		if (isFunction(val)) return this.serializeFunction(val, record);
		if (isObject(val)) return this.serializeObject(val, record);
		if (isArray(val)) return this.serializeArray(val, record, name);
		if (isArguments(val)) return this.serializeArguments(val, record);
		throw new Error(`Cannot serialize ${val}`);
	},

	// TODO Create `varNode` from name here rather than in every caller
	// TODO Don't add to `this.records` if `val` === null + avoid creation of uneccesary
	// placeholder objects in callers?
	createRecord(val, varNode) {
		const record = {
			varNode,
			node: undefined,
			dependencies: [],
			dependents: [],
			assignments: undefined
		};

		this.records.set(val, record);

		return record;
	}
};
