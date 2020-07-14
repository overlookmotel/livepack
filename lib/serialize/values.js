/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const {isFunction, isSymbol, isArguments} = require('is-it-type'),
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const {serializePrimitive} = require('./primitives.js'),
	{createRecord, createDependency} = require('./records.js'),
	{isPrimitive, GeneratorPrototype, AsyncGeneratorPrototype} = require('../shared.js'),
	{globals} = require('../init.js');

// Exports

module.exports = {
	serializeValue(val, name) {
		if (isPrimitive(val)) return {varNode: serializePrimitive(val), node: null};

		const {records} = this;
		let record = records.get(val);
		if (!record) {
			const globalProps = globals.get(val);
			if (globalProps) {
				// Global var
				record = this.serializeGlobal(val, globalProps);
				records.set(val, record);
			} else {
				// Create record and serialize value
				record = createRecord(name);
				records.set(val, record);
				record.node = this.serializeThing(val, record);
			}
		}

		return record;
	},

	serializeThing(val, record) {
		if (isSymbol(val)) return this.serializeSymbol(val, record);
		if (isFunction(val)) return this.serializeFunction(val, record);

		const proto = Object.getPrototypeOf(val);
		if (proto === Object.prototype) {
			if (isArguments(val)) return this.serializeArguments(val, record);
			return this.serializeObject(val, record, proto);
		}
		if (proto === null) return this.serializeNullObject(val, record);
		if (proto === Array.prototype) return this.serializeArray(val, record);
		if (proto === RegExp.prototype) return this.serializeRegex(val, record);
		if (proto === Date.prototype) return this.serializeDate(val, record);
		if (proto === Buffer.prototype) return this.serializeBuffer(val, record);
		if (proto === Set.prototype) return this.serializeSet(val, record);
		if (proto === Map.prototype) return this.serializeMap(val, record);
		if (proto === WeakSet.prototype) return this.serializeWeakSet(val, record);
		if (proto === WeakMap.prototype) return this.serializeWeakMap(val, record);
		return this.serializeObject(val, record, proto);
	},

	serializeGlobal(val, {parent, key}) {
		let node, dependentRecord, dependentKey;
		if (parent) {
			// Lower level global e.g. `Object.assign`
			dependentRecord = this.serializeValue(parent);
			const parentVarNode = dependentRecord.varNode;
			node = t.memberExpression(parentVarNode, t.identifier(key));
			key = `${parentVarNode.name}${upperFirst(key)}`;
			dependentKey = 'object';
		} else if (key) {
			// Top level global e.g. `Object`
			node = t.identifier(key);
			this.globalVarNames.push(key);
		} else if (val === GeneratorPrototype || val === AsyncGeneratorPrototype) {
			// `Object.getPrototypeOf(function*() {}.prototype)` or
			// `Object.getPrototypeOf(async function*() {}.prototype)`
			const isAsync = val === AsyncGeneratorPrototype;
			key = isAsync ? 'AsyncGeneratorPrototype' : 'GeneratorPrototype';
			dependentRecord = this.serializeValue(Object.getPrototypeOf);
			dependentKey = 'callee';
			node = t.callExpression(
				dependentRecord.varNode,
				[t.memberExpression(
					t.functionExpression(null, [], t.blockStatement([]), true, isAsync),
					t.identifier('prototype')
				)]
			);
		} else if (val === -Infinity) {
			// `-Infinity`
			key = 'minusInfinity';
			dependentRecord = this.serializeValue(Infinity);
			dependentKey = 'argument';
			node = t.unaryExpression('-', dependentRecord.varNode);
		} else {
			throw new Error(`Unexpected global: ${val}`);
		}

		const record = createRecord(key);
		record.node = node;
		if (dependentRecord) createDependency(record, dependentRecord, node, dependentKey);
		return record;
	}
};
