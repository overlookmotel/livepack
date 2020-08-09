/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const isArguments = require('is-arguments'),
	{isFunction, isSymbol} = require('is-it-type'),
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const {serializePrimitive} = require('./primitives.js'),
	{createRecord, createDependency} = require('./records.js'),
	{
		isPrimitive, GeneratorPrototype, AsyncFunctionPrototype, AsyncGeneratorPrototype
	} = require('../shared.js'),
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
				record = createRecord(name, val);
				records.set(val, record);
				record.node = this.serializeThing(val, record);
			}
		}

		return record;
	},

	serializeThing(val, record) {
		if (isSymbol(val)) return this.serializeSymbol(val, record);
		if (isFunction(val)) return this.serializeFunction(val, record);

		// Check if is a prototype + define as `fn.prototype` if so
		const {prototypes} = this;
		let ctorRecord = prototypes.get(val);
		if (ctorRecord === undefined) {
			// If this is a new prototype, serialize function
			const ctor = getConstructor(val);
			if (ctor) {
				this.serializeValue(ctor, 'constructor');
				ctorRecord = prototypes.get(val);
			}
		}

		if (ctorRecord !== undefined) {
			// TODO Is this differentiation between `null` and `undefined` required?
			prototypes.delete(val);
			if (ctorRecord) return this.serializePrototype(record, ctorRecord);
		}

		// Serialize
		if (val instanceof Array) return this.serializeArray(val, record);
		if (val instanceof RegExp) return this.serializeRegex(val, record);
		if (val instanceof Date) return this.serializeDate(val, record);
		if (val instanceof Buffer) return this.serializeBuffer(val, record);
		if (val instanceof Set) return this.serializeSet(val, record);
		if (val instanceof Map) return this.serializeMap(val, record);
		if (val instanceof WeakSet) return this.serializeWeakSet(val, record);
		if (val instanceof WeakMap) return this.serializeWeakMap(val, record);
		if (val instanceof String) return this.serializeBoxedString(val, record);
		if (val instanceof Boolean) return this.serializeBoxedBoolean(val, record);
		if (val instanceof Number) return this.serializeBoxedNumber(val, record);
		if (isArguments(val)) return this.serializeArguments(val, record);
		return this.serializeObject(val, record);
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
		} else if (
			val === GeneratorPrototype || val === AsyncFunctionPrototype || val === AsyncGeneratorPrototype
		) {
			// `Object.getPrototypeOf(function*() {})` or
			// `Object.getPrototypeOf(async function() {})` or
			// `Object.getPrototypeOf(async function*() {})`
			const isGenerator = val !== AsyncFunctionPrototype,
				isAsync = val !== GeneratorPrototype;
			key = isGenerator // eslint-disable-line no-nested-ternary
				? isAsync
					? 'AsyncGeneratorPrototype'
					: 'GeneratorPrototype'
				: 'AsyncFunctionPrototype';
			dependentRecord = this.serializeValue(Object.getPrototypeOf);
			dependentKey = 'callee';
			node = t.callExpression(
				dependentRecord.varNode,
				[t.functionExpression(null, [], t.blockStatement([]), isGenerator, isAsync)]
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

		const record = createRecord(key, val);
		record.node = node;
		if (dependentRecord) createDependency(record, dependentRecord, node, dependentKey);
		return record;
	}
};

function getConstructor(obj) {
	const ctorDescriptor = Object.getOwnPropertyDescriptor(obj, 'constructor');
	if (!ctorDescriptor) return undefined;

	const ctor = ctorDescriptor.value;
	if (!isFunction(ctor)) return undefined;

	const protoDescriptor = Object.getOwnPropertyDescriptor(ctor, 'prototype');
	if (!protoDescriptor) return undefined;

	if (protoDescriptor.value !== obj) return undefined;

	return ctor;
}
