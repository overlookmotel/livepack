/* --------------------
 * livepack module
 * Serialize globals
 * ------------------*/

'use strict';

// Exports
module.exports = {traceGlobal};

// Modules
const {isSymbol, isNumber} = require('is-it-type'),
	upperFirst = require('lodash/upperFirst'),
	t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{GLOBAL, MODULE, VALUE, GETTER, SETTER, PROTO, EVAL, COMMON_JS} = require('../shared/constants.js'),
	{isJsIdentifier, firstMapKey} = require('./utils.js'),
	{
		GLOBAL_TOP_LEVEL_TYPE,
		GLOBAL_MODULE_TYPE,
		GLOBAL_PROPERTY_TYPE,
		GLOBAL_PROTOTYPE_TYPE,
		GLOBAL_GETTER_SETTER_TYPE,
		registerSerializer
	} = require('./types.js');

// Exports

// eslint-disable-next-line jsdoc/require-throws
/**
 * Trace global / special value.
 * @this {Object} Serializer
 * @param {Object} globalProps - Global props object
 * @param {number} globalProps.type - Type
 * @param {Object} [globalProps.parent] - Parent
 * @param {string|symbol} globalProps.key - Key
 * @param {Object} record - Record
 * @returns {number} - Type ID for globals
 */
function traceGlobal({type, parent, key}, record) {
	// Replace `eval` shim created by Babel plugin with global `eval`
	if (type === EVAL) return this.traceValueInner(eval, 'eval'); // eslint-disable-line no-eval

	if (type === GLOBAL) {
		// Top level global e.g. `Object`
		record.name = key;
		record.extra = {name: key};
		return GLOBAL_TOP_LEVEL_TYPE;
	}

	if (type === MODULE) {
		// Built-in module e.g. `require('path')`
		record.name = key;
		record.extra = {name: key};
		return GLOBAL_MODULE_TYPE;
	}

	if (type === VALUE) {
		// Lower level global e.g. `Object.assign`
		const parentRecord = this.traceValue(parent, null, `<parent global ${key}>`);
		createDependency(record, parentRecord);

		let {name} = parentRecord,
			keyRecord;
		if (isSymbol(key)) {
			keyRecord = this.traceValue(key, null);
			createDependency(record, keyRecord);
			name += upperFirst(key.description);
		} else {
			name += upperFirst(key);
		}

		record.name = name;
		record.extra = {key, keyRecord};
		return GLOBAL_PROPERTY_TYPE;
	}

	if (type === PROTO) {
		// PrototypeOf
		const parentRecord = this.traceValue(parent, null, '<parent global prototypeOf>');
		createDependency(record, parentRecord);
		createDependency(record, this.traceValue(Object.getPrototypeOf, null));

		record.name = `${parentRecord.name}Prototype`;
		return GLOBAL_PROTOTYPE_TYPE;
	}

	if (type === GETTER || type === SETTER) {
		// Getter/setter
		const isGetter = type === GETTER,
			typeName = isGetter ? 'getter' : 'setter';

		const parentRecord = this.traceValue(parent, null, `<parent global ${typeName} ${key}>`);
		createDependency(record, parentRecord);
		createDependency(record, this.traceValue(Object.getOwnPropertyDescriptor, null));

		let {name} = parentRecord,
			keyRecord;
		if (isSymbol(key)) {
			keyRecord = this.traceValue(key, null);
			createDependency(record, keyRecord);
			name += upperFirst(key.description);
		} else {
			name += upperFirst(key);
		}
		name += upperFirst(typeName);

		record.name = name;
		record.extra = {key, keyRecord, isGetter};
		return GLOBAL_GETTER_SETTER_TYPE;
	}

	if (type === COMMON_JS) {
		// CommonJS var
		// TODO
		throw new Error('CommonJS vars not supported');
	}

	// Special values
	// TODO: Remove this - can be a primitive
	/*
	if (key === 'minusInfinity') {
		createDependency(record, this.traceValue(Infinity));
		return GLOBAL_MINUS_INFINITY_TYPE;
	}
	*/

	// TODO: Add other special values
	throw new Error('Special types not supported');
}

/**
 * Serialize top-level global value e.g. `Object`.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string} record.extra.name - Name of global
 * @returns {Object} - AST node
 */
function serializeGlobalTopLevel(record) {
	const {name} = record.extra;
	this.globalVarNames.push(name);
	return t.identifier(name);
}
registerSerializer(GLOBAL_TOP_LEVEL_TYPE, serializeGlobalTopLevel);

// eslint-disable-next-line jsdoc/require-throws, jsdoc/require-returns-check
/**
 * Serialize built-in module e.g. `require('path')`.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string} record.extra.name - Name of global
 * @returns {Object} - AST node
 */
function serializeBuiltInModule(record) { // eslint-disable-line no-unused-vars
	// TODO
	throw new Error('Built-in modules not supported');
}
registerSerializer(GLOBAL_MODULE_TYPE, serializeBuiltInModule);

/**
 * Serialize global property (e.g. `Object.create`, `Object.prototype.toString`)
 * or property of a built-in module (e.g. `require('path').join`).
 * Parent will be first dependency.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string|number|symbol} record.extra.key - Property key
 * @param {Object} [record.extra.keyRecord] - Record for key if it's a symbol
 * @returns {Object} - AST node
 */
function serializeGlobalProperty(record) {
	const parentNode = this.serializeValue(firstMapKey(record.dependencies));
	const {extra} = record;
	return createMemberNode.call(this, parentNode, extra.key, extra.keyRecord);
}
registerSerializer(GLOBAL_PROPERTY_TYPE, serializeGlobalProperty);

/**
 * Serialize global prototype (e.g. `Object.getPrototypeOf(function*() {})`).
 * Parent will be first dependency.
 * `Object.getPrototypeOf` will be 2nd dependency.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeGlobalPrototype(record) {
	const [parentRecord, getPrototypeRecord] = [...record.dependencies.keys()];
	return t.callExpression(
		this.serializeValue(getPrototypeRecord),
		[this.serializeValue(parentRecord)]
	);
}
registerSerializer(GLOBAL_PROTOTYPE_TYPE, serializeGlobalPrototype);

/**
 * Serialize global getter/setter
 * (e.g. `Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').get`).
 * Parent will be first dependency.
 * `Object.getOwnPropertyDescriptor` will be 2nd dependency.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string|number|symbol} record.extra.key - Property key
 * @param {Object} [record.extra.keyRecord] - Record for key if it's a symbol
 * @param {boolean} record.extra.isGetter - `true` if getter, `false` if setter
 * @returns {Object} - AST node
 */
function serializeGlobalGetterSetter(record) {
	const [parentRecord, getOwnPropertyRecord] = [...record.dependencies.values()];
	const {extra} = record,
		{key, keyRecord} = extra;
	const keyNode = keyRecord ? this.serializeValue(keyRecord)
		: isNumber(key) ? t.numericLiteral(key)
			: t.stringLiteral(key);
	return t.memberExpression(
		t.callExpression(
			this.serializeValue(getOwnPropertyRecord),
			[this.serializeValue(parentRecord), keyNode]
		),
		t.identifier(extra.isGetter ? 'get' : 'set')
	);
}
registerSerializer(GLOBAL_GETTER_SETTER_TYPE, serializeGlobalGetterSetter);

/**
 * Serialize minus infinity.
 * `Infinity` will be first dependency.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
// TODO: Remove this - can be a primitive
/*
function serializeMinusInfinity(record) {
	const infinityNode = this.serializeValue(firstMapKey(record.dependencies));
	return t.unaryExpression('-', infinityNode);
}
*/

/**
 * Create member AST node.
 * @this {Object} Serializer
 * @param {Object} parentNode - Object AST node
 * @param {string|number|symbol} key - Property key
 * @param {Object} [keyRecord] - Record for key if it's a symbol
 * @returns {Object} - AST node
 */
function createMemberNode(parentNode, key, keyRecord) {
	let keyNode, isComputed;
	if (keyRecord) {
		keyNode = this.serializeValue(keyRecord);
		isComputed = true;
	} else if (isNumber(key)) {
		keyNode = t.numericLiteral(key);
		isComputed = true;
	} else if (isJsIdentifier(key)) {
		keyNode = t.identifier(key);
		isComputed = false;
	} else {
		keyNode = t.stringLiteral(key);
		isComputed = true;
	}

	return t.memberExpression(parentNode, keyNode, isComputed);
}
