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
	serializeValue(val) {
		if (isPrimitive(val)) return serializePrimitive(val);

		const {records} = this;
		let record = records.get(val);
		let varNode;
		if (record) {
			varNode = record.varNode;

			// If circular reference, return `Circular` object
			if (record.dependencies === undefined) return new Circular(varNode);
		} else {
			// Create record and serialize value
			varNode = t.identifier('x');
			record = this.createRecord(val, varNode);
			Object.assign(record, this.serializeThing(val, varNode));

			// Set dependents for all dependencies
			const {dependencies} = record;
			if (dependencies) {
				for (const dependency of dependencies) {
					records.get(dependency.val).dependents.push({...dependency, val});
				}
			} else {
				record.dependencies = [];
			}
		}

		return varNode;
	},

	serializeThing(val, varNode) {
		if (isFunction(val)) return this.serializeFunction(val);
		if (isObject(val)) return this.serializeObject(val, varNode);
		if (isArray(val)) return this.serializeArray(val, varNode);
		throw new Error(`Cannot serialize ${val}`);
	},

	createRecord(val, varNode) {
		const record = {
			varNode,
			node: undefined,
			dependencies: undefined,
			dependents: [],
			assignments: undefined
		};

		this.records.set(val, record);

		return record;
	}
};