/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const typeOf = require('native-type-of'),
	{isFunction, isSymbol} = require('is-it-type'),
	upperFirst = require('lodash/upperFirst'),
	t = require('@babel/types');

// Imports
const {serializePrimitive} = require('./primitives.js'),
	{createRecord, createDependency} = require('./records.js'),
	{isPrimitive} = require('../shared/functions.js'),
	{URLContextSymbol} = require('../shared/globals.js'),
	{
		GLOBAL, MODULE, VALUE, GETTER, SETTER, PROTO, COMMON_JS_MODULE, EVAL_PLACEHOLDER
	} = require('../shared/constants.js'),
	{createKeyNode, isNumberKey} = require('./utils.js'),
	{globals} = require('../shared/internal.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

const exampleURLSearchParams = new URLSearchParams(''),
	typedArrayRegex = /^(?:Ui|I)nt(?:\d+)Array$/;

module.exports = {
	serializeValue(val, name, trace) {
		return this.withTrace(() => this.serializeValueInner(val, name), trace);
	},

	serializeValueInner(val, name) {
		if (isPrimitive(val)) {
			return {
				varNode: serializePrimitive(val),
				node: null,
				dependencies: undefined,
				dependents: undefined
			};
		}

		const {records} = this;
		let record = records.get(val);
		if (record) return record;

		// Handle globals
		const globalProps = globals.get(val);
		if (globalProps) return this.serializeGlobal(val, globalProps);

		// Create record and serialize value
		record = createRecord(name, val);
		records.set(val, record);
		const node = this.serializeThing(val, record);
		if (node === EVAL_PLACEHOLDER) return this.evalRecord;
		record.node = node;
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
				this.serializeValue(ctor, 'constructor', '.constructor');
				ctorRecord = prototypes.get(val);
			}
		}

		if (ctorRecord !== undefined) {
			prototypes.delete(val);
			if (ctorRecord) return this.serializePrototype(record, ctorRecord);
		}

		// Serialize
		assertBug(typeof val === 'object');

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
		if (type === 'Symbol') return this.serializeBoxedSymbol(val, record);
		if (type === 'Arguments') return this.serializeArguments(val, record);
		throw new Error(`Cannot serialize ${type}s`);
	},

	serializeGlobal(val, {type, parent, key}) {
		const record = createRecord(key || 'x', val),
			{varNode} = record;
		this.records.set(val, record);
		let node, dependentRecord, dependentKey;
		if (type === VALUE) {
			// Lower level global e.g. `Object.assign`
			dependentRecord = this.serializeValue(parent, null, `<parent global ${key}>`);
			const parentVarNode = dependentRecord.varNode;
			const keyNode = createKeyNode(key);
			node = t.memberExpression(parentVarNode, keyNode, !t.isIdentifier(keyNode));
			varNode.name = `${parentVarNode.name}${upperFirst(key)}`;
			dependentKey = 'object';
		} else if (type === PROTO) {
			// PrototypeOf
			const parentRecord = this.serializeValue(parent, null, '<parent global prototypeOf>');
			const parentVarNode = parentRecord.varNode;
			dependentRecord = this.serializeValue(Object.getPrototypeOf);
			node = t.callExpression(dependentRecord.varNode, [parentVarNode]);
			createDependency(record, parentRecord, node.arguments, 0);
			varNode.name = `${parentVarNode.name}Proto`;
			dependentKey = 'callee';
		} else if (type === GETTER || type === SETTER) {
			// Getter/setter
			const isGetter = type === GETTER;
			const typeName = isGetter ? 'getter' : 'setter';
			const parentRecord = this.serializeValue(parent, null, `<parent global ${typeName} ${key}>`);
			const parentVarNode = parentRecord.varNode;
			const keyNode = isNumberKey(key) ? t.numericLiteral(key * 1) : t.stringLiteral(key);
			const getDescriptorRecord = this.serializeValue(Object.getOwnPropertyDescriptor);
			node = t.memberExpression(
				t.callExpression(
					getDescriptorRecord.varNode,
					[parentVarNode, keyNode]
				),
				t.identifier(isGetter ? 'get' : 'set')
			);
			createDependency(record, getDescriptorRecord, node.object, 'callee');
			createDependency(record, parentRecord, node.object.arguments, 0);
			varNode.name = `${parentVarNode.name}${upperFirst(key)}${upperFirst(typeName)}`;
		} else if (type === GLOBAL) {
			// Top level global e.g. `Object`
			node = t.identifier(key);
			this.globalVarNames.push(key);
		} else if (type === MODULE) {
			// Built-in module e.g. `require('path')`
			node = this.createImportOrRequireNode(t.stringLiteral(key), varNode);
		} else if (type === COMMON_JS_MODULE) {
			node = this.serializeCommonJsModuleObject(val, record);
		} else if (key === 'undefined') {
			node = t.unaryExpression('void', t.numericLiteral(0));
		} else if (['generatorFunction', 'asyncFunction', 'asyncGeneratorFunction'].includes(key)) {
			// `function*() {}` / `async function() {}` / `async function*() {}`
			// These are used to access their prototypes
			const isGenerator = key !== 'asyncFunction',
				isAsync = key !== 'generatorFunction';
			node = t.functionExpression(null, [], t.blockStatement([]), isGenerator, isAsync);
		} else if (key === 'minusInfinity') {
			// `-Infinity`
			dependentRecord = this.serializeValue(Infinity);
			dependentKey = 'argument';
			node = t.unaryExpression('-', dependentRecord.varNode);
		} else if (key === 'URLSymbols') {
			// NB: Does not exist in Node v20.0.0+
			// `URLSymbols = Object.getOwnPropertySymbols(exampleURLSearchParams)`
			dependentRecord = this.serializeValue(Object.getOwnPropertySymbols);
			dependentKey = 'callee';
			const exampleURLSearchParamsRecord = this.serializeValue(
				exampleURLSearchParams, 'urlSearchParams', '<example URLSearchParams>'
			);
			node = t.callExpression(dependentRecord.varNode, [exampleURLSearchParamsRecord.varNode]);
			createDependency(record, exampleURLSearchParamsRecord, node.arguments, 0);
		} else if (key === 'URLContext') {
			// NB: Does not exist in Node v20.0.0+
			// `URLContext = exampleURLSearchParams[URLContextSymbol].constructor`
			const exampleURLSearchParamsRecord = this.serializeValue(
				exampleURLSearchParams, 'urlSearchParams', '<example URLSearchParams>'
			);
			const URLContextSymbolRecord = this.serializeValue(URLContextSymbol);
			node = t.memberExpression(
				t.memberExpression(exampleURLSearchParamsRecord.varNode, URLContextSymbolRecord.varNode, true),
				t.identifier('constructor')
			);
			createDependency(record, exampleURLSearchParamsRecord, node.object, 'object');
			createDependency(record, URLContextSymbolRecord, node.object, 'property');
		} else if (key === 'CallSite') {
			dependentRecord = this.serializeRuntime('getCallSite');
			node = t.callExpression(dependentRecord.varNode, []);
			dependentKey = 'callee';
		} else {
			assertBug(
				false, `Unexpected global: '${key}' type ${type} - ${isSymbol(val) ? val.toString() : val}`
			);
		}

		record.node = node;
		if (dependentRecord) createDependency(record, dependentRecord, node, dependentKey);
		return record;
	},

	serializeCommonJsModuleObject(val, record) {
		// Reference to `module` - substitute `{exports}`
		return this.serializeObject({exports: val.exports}, record);
	},

	createImportOrRequireNode(filePathStrNode, varNode) {
		if (this.options.format === 'esm') {
			return t.importDeclaration([t.importDefaultSpecifier(varNode)], filePathStrNode);
		}
		return t.callExpression(t.identifier('require'), [filePathStrNode]);
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
