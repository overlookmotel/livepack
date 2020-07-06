/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const {parseExpression} = require('@babel/parser'),
	{isFunction, isSymbol, isArguments} = require('is-it-type'),
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const {serializePrimitive} = require('./primitives.js'),
	{createRecord, createDependency} = require('./records.js'),
	{isPrimitive, GeneratorFunction, AsyncGeneratorFunction} = require('../shared.js'),
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
			return this.serializePlainObject(val, record);
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
		return this.serializeProtoObject(val, record, proto);
	},

	serializeGlobal(val, {parent, key}) {
		if (!parent) {
			let node;
			if (key) {
				// Top level global e.g. `Object`
				node = t.identifier(key);
				this.globalVarNames.push(key);
			} else if (val === GeneratorFunction) {
				key = 'GeneratorFunction';
				node = parseExpression('(function*() {}).prototype.constructor');
			} else if (val === AsyncGeneratorFunction) {
				key = 'AsyncGeneratorFunction';
				node = parseExpression('(async function*() {}).prototype.constructor');
			} else {
				throw new Error(`Unexpected special global: ${val}`);
			}

			const record = createRecord(key);
			record.node = node;
			return record;
		}

		// Lower level global e.g. `Object.assign`
		const parentRecord = this.serializeValue(parent);
		const parentVarNode = parentRecord.varNode;
		const record = createRecord(`${parentVarNode.name}${upperFirst(key)}`);
		const node = t.memberExpression(parentVarNode, t.identifier(key));
		record.node = node;
		createDependency(record, parentRecord, node, 'object');
		return record;
	}
};
