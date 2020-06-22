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
	serializeSymbol = require('./symbols.js'),
	Circular = require('./circular.js');

// Exports

module.exports = {
	serializeValue(val, name) {
		if (isPrimitive(val)) return serializePrimitive(val);

		const {records} = this;
		let record = records.get(val);
		let varNode;
		if (record) {
			varNode = record.varNode;

			// If circular reference, return `Circular` object
			if (record.node === undefined) return new Circular(varNode);
		} else {
			// Create record and serialize value
			varNode = t.identifier(name);
			record = this.createRecord(val, varNode);
			const props = this.serializeThing(val, varNode, name);
			Object.assign(record, props);

			// Set dependents for all dependencies
			const {dependencies} = props;
			if (dependencies) {
				record.dependencies = dependencies.map((dependency) => {
					const dependencyVal = dependency.val;
					dependency.val = val;
					records.get(dependencyVal).dependents.push(dependency);
					return {val: dependencyVal};
				});
			}
		}

		return varNode;
	},

	serializeThing(val, varNode, name) {
		if (isSymbol(val)) return serializeSymbol(val);
		if (isFunction(val)) return this.serializeFunction(val);
		if (isObject(val)) return this.serializeObject(val, varNode);
		if (isArray(val)) return this.serializeArray(val, varNode, name);
		if (isArguments(val)) return this.serializeArguments(val, varNode);
		throw new Error(`Cannot serialize ${val}`);
	},

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
