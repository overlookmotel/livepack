/* --------------------
 * livepack module
 * Serialize globals
 * ------------------*/

'use strict';

// Exports
module.exports = {traceGlobal, createImportOrRequireNode};

// Modules
const {isObject, isSymbol, isNumber} = require('is-it-type'),
	upperFirst = require('lodash/upperFirst'),
	t = require('@babel/types');

// Imports
const {
		GLOBAL, MODULE, VALUE, GETTER, SETTER, PROTO, EVAL, COMMON_JS
	} = require('../shared/constants.js'),
	{isJsIdentifier} = require('./utils.js'),
	{
		GLOBAL_TOP_LEVEL_TYPE, GLOBAL_MODULE_TYPE, GLOBAL_PROPERTY_TYPE, GLOBAL_PROTOTYPE_TYPE,
		GLOBAL_GETTER_TYPE, GLOBAL_SETTER_TYPE, GLOBAL_MINUS_INFINITY_TYPE, registerSerializer
	} = require('./types.js');

// Exports

// eslint-disable-next-line jsdoc/require-throws
/**
 * Trace global / special value.
 * Records key to access the global as `record.extra.key`.
 * Also records value as `record.extra.val`. This is used when determining any setters
 * on prototype chain for when objects which are serialized have this global in their prototype chain.
 *
 * @this {Object} Serializer
 * @param {Object} val - Global value
 * @param {Object} globalProps - Global props object
 * @param {number} globalProps.type - Type
 * @param {Object} [globalProps.parent] - Parent
 * @param {string|symbol} globalProps.key - Key
 * @param {Object} record - Record
 * @returns {number} - Type ID
 */
function traceGlobal(val, {type, parent, key}, record) {
	// Replace `eval` shim created by instrumentation with global `eval`
	if (type === EVAL) return this.traceValueInner(eval, 'eval'); // eslint-disable-line no-eval

	if (type === GLOBAL) {
		// Top level global e.g. `Object`
		record.name = key;
		record.extra = {val, key};
		return GLOBAL_TOP_LEVEL_TYPE;
	}

	if (type === MODULE) {
		// Built-in module e.g. `require('path')`
		record.name = key;
		record.extra = {val, key};
		return GLOBAL_MODULE_TYPE;
	}

	if (type === VALUE) {
		// Lower level global e.g. `Object.assign`
		const parentRecord = this.traceValue(parent, null, null);

		let {name} = parentRecord;
		if (isSymbol(key)) {
			name += upperFirst(key.description);
			key = this.traceValue(key, null, null);
		} else {
			name += upperFirst(key);
		}

		record.name = name;
		record.extra = {val, key, parentRecord};
		return GLOBAL_PROPERTY_TYPE;
	}

	if (type === PROTO) {
		// PrototypeOf
		const parentRecord = this.traceValue(parent, null, null);
		record.name = `${parentRecord.name}Prototype`;
		record.extra = {val, parentRecord};
		return GLOBAL_PROTOTYPE_TYPE;
	}

	if (type === GETTER || type === SETTER) {
		// Getter/setter
		const isGetter = type === GETTER,
			typeName = isGetter ? 'getter' : 'setter';

		const parentRecord = this.traceValue(parent, null, null);

		let {name} = parentRecord;
		if (isSymbol(key)) {
			name += upperFirst(key.description);
			key = this.traceValue(key, null, null);
		} else {
			name += upperFirst(key);
		}
		name += upperFirst(typeName);

		record.name = name;
		record.extra = {val, key, parentRecord};
		return isGetter ? GLOBAL_GETTER_TYPE : GLOBAL_SETTER_TYPE;
	}

	if (type === COMMON_JS) {
		// CommonJS var
		// TODO
		throw new Error('CommonJS vars not supported');
	}

	// Special values
	if (key === 'minusInfinity') {
		const parentRecord = this.traceValue(Infinity, null, null);
		record.name = 'minusInfinity';
		record.extra = {val, parentRecord};
		return GLOBAL_MINUS_INFINITY_TYPE;
	}

	// TODO: Add other special values
	throw new Error('Special types not supported');
}

/**
 * Serialize top-level global value e.g. `Object`.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string} record.extra.key - Name of global
 * @returns {Object} - AST node
 */
function serializeGlobalTopLevel(record) {
	const {key} = record.extra;
	this.globalVarNames.push(key);
	return t.identifier(key);
}
registerSerializer(GLOBAL_TOP_LEVEL_TYPE, serializeGlobalTopLevel);

/**
 * Serialize built-in module e.g. `require('path')`.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string} record.extra.key - Name of built-in module
 * @returns {Object} - AST node
 */
function serializeBuiltInModule(record) {
	return this.createImportOrRequireNode(t.stringLiteral(record.extra.key), record.varNode);
}
registerSerializer(GLOBAL_MODULE_TYPE, serializeBuiltInModule);

/**
 * Create an `import` statement or `require()` expression to import a module.
 * @this {Object} Serializer
 * @param {Object} filePathStrNode - String literal node for file path
 * @param {Object} varNode - Identifier
 * @returns {Object} - AST node
 */
function createImportOrRequireNode(filePathStrNode, varNode) {
	if (this.options.format === 'esm') {
		// TODO: Fix
		return t.importDeclaration([t.importDefaultSpecifier(varNode)], filePathStrNode);
	}
	return t.callExpression(t.identifier('require'), [filePathStrNode]);
}

/**
 * Serialize global property (e.g. `Object.create`, `Object.prototype.toString`)
 * or property of a built-in module (e.g. `require('path').join`).
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string|number|Object} record.extra.key - Property key (record object if key is a Symbol)
 * @param {Object} record.extra.parentRecord - Record for parent global
 * @returns {Object} - AST node
 */
function serializeGlobalProperty(record) {
	return createMemberNode.call(this, this.serializeValue(record.extra.parentRecord), record.extra.key);
}
registerSerializer(GLOBAL_PROPERTY_TYPE, serializeGlobalProperty);

/**
 * Serialize global prototype (e.g. `Object.getPrototypeOf(function*() {})`).
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {Object} record.extra.parentRecord - Record for parent global
 * @returns {Object} - AST node
 */
function serializeGlobalPrototype(record) {
	return t.callExpression(
		this.traceAndSerializeGlobal(Object.getPrototypeOf),
		[this.serializeValue(record.extra.parentRecord)]
	);
}
registerSerializer(GLOBAL_PROTOTYPE_TYPE, serializeGlobalPrototype);

/**
 * Serialize global getter.
 * e.g. `Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').get`.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string|number|Object} record.extra.key - Property key (record object if key is a Symbol)
 * @param {Object} record.extra.parentRecord - Record for parent global
 * @returns {Object} - AST node
 */
function serializeGlobalGetter(record) {
	return serializeGlobalGetterOrSetter.call(this, record, 'get');
}
registerSerializer(GLOBAL_GETTER_TYPE, serializeGlobalGetter);

/**
 * Serialize global setter.
 * e.g. `Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').set`.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string|number|Object} record.extra.key - Property key (record object if key is a Symbol)
 * @param {Object} record.extra.parentRecord - Record for parent global
 * @returns {Object} - AST node
 */
function serializeGlobalSetter(record) {
	return serializeGlobalGetterOrSetter.call(this, record, 'set');
}
registerSerializer(GLOBAL_SETTER_TYPE, serializeGlobalSetter);

/**
 * Serialize global getter/setter
 * e.g. `Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').get`.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {string|number|Object} record.extra.key - Property key (record object if it's a Symbol)
 * @param {Object} record.extra.parentRecord - Record for parent global
 * @param {string} descriptorKey - 'get' or 'set'
 * @returns {Object} - AST node
 */
function serializeGlobalGetterOrSetter(record, descriptorKey) {
	const {key} = record.extra,
		keyNode = isObject(key)
			? this.serializeValue(key)
			: isNumber(key)
				? t.numericLiteral(key)
				: t.stringLiteral(key);
	return t.memberExpression(
		t.callExpression(
			this.traceAndSerializeGlobal(Object.getOwnPropertyDescriptor, record),
			[this.serializeValue(record.extra.parentRecord), keyNode]
		),
		t.identifier(descriptorKey)
	);
}

/**
 * Serialize minus infinity.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {Object} record.extra.parentRecord - Record for `Infinity`
 * @returns {Object} - AST node
 */
function serializeMinusInfinity(record) {
	return t.unaryExpression('-', this.serializeValue(record.extra.parentRecord));
}
registerSerializer(GLOBAL_MINUS_INFINITY_TYPE, serializeMinusInfinity);

/**
 * Create member AST node.
 * @this {Object} Serializer
 * @param {Object} parentNode - Object AST node
 * @param {string|number|Object} key - Property key (record object if key is a Symbol)
 * @returns {Object} - AST node
 */
function createMemberNode(parentNode, key) {
	let keyNode, isComputed;
	if (isObject(key)) {
		keyNode = this.serializeValue(key);
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
