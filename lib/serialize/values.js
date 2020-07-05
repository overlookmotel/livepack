/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const {isFunction, isSymbol, isArguments} = require('is-it-type');

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
			record.node = this.serializeThing(val, record);
		}

		return record;
	},

	serializeThing(val, record) {
		if (isSymbol(val)) return serializeSymbol(val, record);
		if (isFunction(val)) return this.serializeFunction(val, record);

		const proto = Object.getPrototypeOf(val);
		if (proto === Object.prototype) {
			if (isArguments(val)) return this.serializeArguments(val, record);
			return this.serializeObject(val, record);
		}
		if (proto === Array.prototype) return this.serializeArray(val, record);

		throw new Error(`Cannot serialize ${val}`);
	}
};
