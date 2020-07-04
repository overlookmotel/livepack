/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const {isObject, isFunction, isArray, isSymbol, isArguments} = require('is-it-type');

// Imports
const {isPrimitive, serializePrimitive} = require('./primitives.js'),
	{createRecord} = require('./records.js'),
	serializeSymbol = require('./symbols.js');

// Exports

module.exports = {
	serializeValue(val, name) {
		if (isPrimitive(val)) return {varNode: serializePrimitive(val), node: null};

		const {records} = this;
		let record = records.get(val);
		if (!record) {
			// Create record and serialize value
			record = createRecord(name);
			records.set(val, record);
			record.node = this.serializeThing(val, record, name);
		}

		return record;
	},

	serializeThing(val, record, name) {
		if (isSymbol(val)) return serializeSymbol(val);
		if (isFunction(val)) return this.serializeFunction(val, record);
		if (isObject(val)) return this.serializeObject(val, record, name);
		if (isArray(val)) return this.serializeArray(val, record, name);
		if (isArguments(val)) return this.serializeArguments(val, record);
		throw new Error(`Cannot serialize ${val}`);
	}
};
