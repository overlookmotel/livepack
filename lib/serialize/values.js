/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const {isObject, isFunction, isArray} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {isPrimitive, serializePrimitive} = require('./primitives.js'),
	Circular = require('./circular.js');

// Exports

module.exports = {
	serializeValue(val, parentNode, key) {
		if (isPrimitive(val)) return serializePrimitive(val);

		const {records} = this;
		let record = records.get(val);
		let uses;
		let varNode;
		if (record) {
			uses = record.uses;
			varNode = record.varNode;
		} else {
			// If circular reference, return `Circular` object
			const {current} = this;
			varNode = current.get(val);
			if (varNode) return new Circular(varNode);

			// Add to list of values currently being processed
			varNode = t.identifier('x');
			current.set(val, varNode);

			// Serialize value and create record
			const props = this.serializeThing(val);
			record = this.createRecord(val, varNode);
			Object.assign(record, props);

			uses = record.uses;
			if (props.uses) {
				// Self-references
				for (const use of uses) {
					use.parentNode[use.key] = varNode;
				}
			}

			// Remove from list of values currently being processed
			current.delete(val);
		}

		if (parentNode) uses.push({parentNode, key});

		return varNode;
	},

	serializeThing(val) {
		if (isFunction(val)) return this.serializeFunction(val);
		if (isObject(val)) return this.serializeObject(val);
		if (isArray(val)) return this.serializeArray(val);
		throw new Error(`Cannot serialize ${val}`);
	},

	createRecord(val, varNode) {
		const record = {varNode, node: undefined, uses: [], assignments: undefined};
		this.records.set(val, record);
		return record;
	}
};
