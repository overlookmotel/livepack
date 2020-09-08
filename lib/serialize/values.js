/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const typeOf = require('native-type-of'),
	{isFunction, isSymbol} = require('is-it-type'),
	assert = require('simple-invariant'),
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const {serializePrimitive} = require('./primitives.js'),
	{createRecord, createDependency} = require('./records.js'),
	{
		isPrimitive,
		GeneratorPrototype, AsyncFunctionPrototype, AsyncGeneratorPrototype,
		TypedArrayPrototype, URLSymbols, URLContextSymbol, URLContext
	} = require('../shared.js'),
	{createKeyNode} = require('./utils.js'),
	{globals, commonJsVars} = require('../internal.js');

// Exports

const exampleURL = new URL('http://x/'),
	typedArrayRegex = /^(?:Ui|I)nt(?:\d+)Array$/;

module.exports = {
	serializeValue(val, name) {
		if (isPrimitive(val)) return {varNode: serializePrimitive(val), node: null};

		const {records} = this;
		let record = records.get(val);
		if (record) return record;

		// Handle globals
		const globalProps = globals.get(val);
		if (globalProps) return this.serializeGlobal(val, globalProps);

		// Handle CommonJS vars (`module`, `require`)
		const commonJsProps = commonJsVars.get(val);
		if (commonJsProps) return this.serializeCommonJsVar(val, commonJsProps);

		// Create record and serialize value
		record = createRecord(name, val);
		records.set(val, record);
		record.node = this.serializeThing(val, record);
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
			prototypes.delete(val);
			if (ctorRecord) return this.serializePrototype(record, ctorRecord);
		}

		// Serialize
		assert(typeof val === 'object');

		const type = typeOf(val);
		if (type === 'Object') {
			// `URL` and `URLSearchParams` are implemented in Javascript in Node internals
			// and so cannot be detected with a type check
			if (val instanceof URL) return this.serializeURL(val, record);
			if (val instanceof URLSearchParams) return this.serializeURLSearchParams(val, record);
			return this.serializeObject(val, record);
		}
		if (type === 'Array') return this.serializeArray(val, record);
		if (type === 'RegExp') return this.serializeRegex(val, record);
		if (type === 'Date') return this.serializeDate(val, record);
		if (type === 'Set') return this.serializeSet(val, record);
		if (type === 'Map') return this.serializeMap(val, record);
		if (type === 'WeakSet') return this.serializeWeakSet(val, record);
		if (type === 'WeakMap') return this.serializeWeakMap(val, record);
		if (type === 'WeakRef') return this.serializeWeakRef(val, record);
		if (type === 'FinalizationRegistry') return this.serializeFinalizationRegistry(val, record);
		if (typedArrayRegex.test(type)) return this.serializeBuffer(val, type, record);
		if (type === 'ArrayBuffer') return this.serializeArrayBuffer(val, record);
		if (type === 'SharedArrayBuffer') return this.serializeSharedArrayBuffer(val, record);
		if (type === 'String') return this.serializeBoxedString(val, record);
		if (type === 'Boolean') return this.serializeBoxedBoolean(val, record);
		if (type === 'Number') return this.serializeBoxedNumber(val, record);
		if (type === 'BigInt') return this.serializeBoxedBigInt(val, record);
		if (type === 'Arguments') return this.serializeArguments(val, record);
		throw new Error(`Cannot serialize ${type}s`);
	},

	serializeGlobal(val, {parent, key, isModule}) {
		const record = createRecord(key || 'x', val),
			{varNode} = record;
		let node, dependentRecord, dependentKey;
		if (parent) {
			// Lower level global e.g. `Object.assign`
			dependentRecord = this.serializeValue(parent);
			const parentVarNode = dependentRecord.varNode;
			const keyNode = createKeyNode(key);
			node = t.memberExpression(parentVarNode, keyNode, !t.isIdentifier(keyNode));
			varNode.name = `${parentVarNode.name}${upperFirst(key)}`;
			dependentKey = 'object';
		} else if (key) {
			// Top level global/built-in module e.g. `Object`, `require('path')`
			if (!isModule) {
				// Global e.g. `Object`
				node = t.identifier(key);
				this.globalVarNames.push(key);
			} else {
				// Built-in module e.g. `require('path')`
				if (this.options.format === 'esm') { // eslint-disable-line no-lonely-if
					node = t.importDeclaration([t.importDefaultSpecifier(varNode)], t.stringLiteral(key));
				} else {
					node = t.callExpression(t.identifier('require'), [t.stringLiteral(key)]);
				}
			}
		} else if (val === undefined) {
			varNode.name = 'undefined';
			node = t.unaryExpression('void', t.numericLiteral(0));
		} else if (
			val === GeneratorPrototype || val === AsyncFunctionPrototype || val === AsyncGeneratorPrototype
		) {
			// `Object.getPrototypeOf(function*() {})` or
			// `Object.getPrototypeOf(async function() {})` or
			// `Object.getPrototypeOf(async function*() {})`
			const isGenerator = val !== AsyncFunctionPrototype,
				isAsync = val !== GeneratorPrototype;
			varNode.name = isGenerator // eslint-disable-line no-nested-ternary
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
		} else if (val === TypedArrayPrototype) {
			// `TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype)`
			varNode.name = 'TypedArrayPrototype';
			dependentRecord = this.serializeValue(Object.getPrototypeOf);
			dependentKey = 'callee';
			const Uint8ArrayRecord = this.serializeValue(Uint8Array);
			node = t.callExpression(
				dependentRecord.varNode,
				[t.memberExpression(Uint8ArrayRecord.varNode, t.identifier('prototype'))]
			);
			createDependency(record, Uint8ArrayRecord, node.arguments[0], 'object');
		} else if (val === -Infinity) {
			// `-Infinity`
			varNode.name = 'minusInfinity';
			dependentRecord = this.serializeValue(Infinity);
			dependentKey = 'argument';
			node = t.unaryExpression('-', dependentRecord.varNode);
		} else if (val === URLSymbols) {
			// URLSymbols = Object.getOwnPropertySymbols(exampleURL)
			varNode.name = 'URLSymbols';
			dependentRecord = this.serializeValue(Object.getOwnPropertySymbols);
			dependentKey = 'callee';
			const exampleURLRecord = this.serializeValue(exampleURL, 'url');
			node = t.callExpression(dependentRecord.varNode, [exampleURLRecord.varNode]);
			createDependency(record, exampleURLRecord, node.arguments, 0);
		} else if (val === URLContext) {
			// URLContext = exampleURL[URLContextSymbol].constructor
			varNode.name = 'URLContext';
			const exampleURLRecord = this.serializeValue(exampleURL, 'url');
			const URLContextSymbolRecord = this.serializeValue(URLContextSymbol);
			node = t.memberExpression(
				t.memberExpression(exampleURLRecord.varNode, URLContextSymbolRecord.varNode, true),
				t.identifier('constructor')
			);
			createDependency(record, exampleURLRecord, node.object, 'object');
			createDependency(record, URLContextSymbolRecord, node.object, 'property');
		} else {
			throw new Error(`Unexpected global: ${val}`);
		}

		record.node = node;
		if (dependentRecord) createDependency(record, dependentRecord, node, dependentKey);
		this.records.set(val, record);
		return record;
	},

	serializeCommonJsVar(val, {name, path}) {
		if (name === 'require') throw new Error(`Cannot serialize \`require\` (in ${path})`);

		// Reference to `module` - substitute `{exports}`
		const record = createRecord('module', val);
		this.records.set(val, record);
		record.node = this.serializeObject({exports: val.exports}, record);
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
