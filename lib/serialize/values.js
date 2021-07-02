/* --------------------
 * livepack module
 * Serialize values
 * ------------------*/

'use strict';

// Modules
const typeOf = require('native-type-of'),
	{isFunction, isSymbol} = require('is-it-type'),
	assert = require('simple-invariant'),
	upperFirst = require('lodash/upperFirst'),
	t = require('@babel/types');

// Imports
const {createRecord, createDependency} = require('./records.js'),
	{isPrimitive} = require('../shared/functions.js'),
	{URLContextSymbol} = require('../shared/globals.js'),
	{GLOBAL, MODULE, VALUE, GETTER, SETTER, PROTO, EVAL, COMMON_JS} = require('../shared/constants.js'),
	{createKeyNode, isNumberKey} = require('./utils.js'),
	{globals} = require('../shared/internal.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

const exampleURL = new URL('http://x/'),
	typedArrayRegex = /^(?:Ui|I)nt(?:\d+)Array$/;

module.exports = {
	traceValue(val, name, traceStackEntry) {
		return this.withTrace(() => this.traceValueInner(val, name), traceStackEntry);
	},

	traceValueInner(val, name) {
		// Handle primitives
		if (val === null) return this.tracePrimitive(val, 'null');
		const type = typeof val;
		if (
			type === 'number'
				? val !== Infinity && val !== -Infinity && !Number.isNaN(val)
				: type !== 'object' && type !== 'function' && type !== 'symbol' && type !== 'undefined'
		) {
			return this.tracePrimitive(val, type);
		}

		// Use existing record
		const {records} = this;
		let record = records.get(val);
		if (record) return record;

		// Handle globals + special values
		const globalProps = globals.get(val);
		if (globalProps) return this.traceGlobal(val, globalProps);

		// Trace non-primitive value
		record = createRecord(name, val);
		records.set(val, record);
		record.serializer = this.traceNonPrimitive(val, type, record);
		return record;
	},

	traceNonPrimitive(val, type, record) {
		if (type === 'undefined') return this.traceUndefined(record);
		if (type === 'symbol') return this.traceSymbol(val, record);
		if (type === 'function') return this.traceFunction(val, record);

		// TODO Add other types
		return this.traceObject(val, record);
	},

	/*
	 * Everything below is old.
	 */

	serializeValueOld(val, name, trace) {
		return this.withTrace(() => this.serializeValueInner(val, name), trace);
	},

	serializeValueInner(val, name) {
		if (isPrimitive(val)) {
			return {
				varNode: serializePrimitive(val), // eslint-disable-line no-undef
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
		// Replace `eval` shim created by Babel plugin with global `eval`
		if (type === EVAL) return this.serializeValueInner(eval, 'eval'); // eslint-disable-line no-eval

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
			node = this.createImportOrRequireNode(key, varNode);
		} else if (type === COMMON_JS) {
			node = this.serializeCommonJsVar(val, key, parent, record);
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
			// URLSymbols = Object.getOwnPropertySymbols(exampleURL)
			dependentRecord = this.serializeValue(Object.getOwnPropertySymbols);
			dependentKey = 'callee';
			const exampleURLRecord = this.serializeValue(exampleURL, 'url', '<example URL>');
			node = t.callExpression(dependentRecord.varNode, [exampleURLRecord.varNode]);
			createDependency(record, exampleURLRecord, node.arguments, 0);
		} else if (key === 'URLContext') {
			// URLContext = exampleURL[URLContextSymbol].constructor
			const exampleURLRecord = this.serializeValue(exampleURL, 'url', '<example URL>');
			const URLContextSymbolRecord = this.serializeValue(URLContextSymbol);
			node = t.memberExpression(
				t.memberExpression(exampleURLRecord.varNode, URLContextSymbolRecord.varNode, true),
				t.identifier('constructor')
			);
			createDependency(record, exampleURLRecord, node.object, 'object');
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

	serializeCommonJsVar(val, name, path, record) {
		assert(name === 'module', `Cannot serialize \`require\` or \`import\` (in ${path})`);

		// Reference to `module` - substitute `{exports}`
		return this.serializeObject({exports: val.exports}, record);
	},

	createImportOrRequireNode(filePath, varNode) {
		if (this.options.format === 'esm') {
			return t.importDeclaration([t.importDefaultSpecifier(varNode)], t.stringLiteral(filePath));
		}
		return t.callExpression(t.identifier('require'), [t.stringLiteral(filePath)]);
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
