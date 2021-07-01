/* --------------------
 * livepack module
 * Serialize globals
 * ------------------*/

'use strict';

// Modules
const {isSymbol, isNumber} = require('is-it-type'),
	upperFirst = require('lodash/upperFirst'),
	t = require('@babel/types');

// Imports
const {createRecord, createDependency} = require('./records.js'),
	{GLOBAL, MODULE, VALUE, GETTER, SETTER, PROTO, EVAL, COMMON_JS} = require('../shared/constants.js'),
	{isJsIdentifier, firstMapKey} = require('./utils.js'),
	{GLOBAL_TYPE} = require('./types.js');

// Exports

module.exports = {
	/**
	 * Trace global / special value.
	 * @param {*} val - Value
	 * @param {Object} globalProps - Global props object
	 * @param {number} globalProps.type - Type
	 * @param {Object} [globalProps.parent] - Parent
	 * @param {string|symbol} globalProps.key - Key
	 * @returns {Object} - Record
	 */
	traceGlobal(val, {type, parent, key}) {
		// Replace `eval` shim created by Babel plugin with global `eval`
		if (type === EVAL) return this.traceValueInner(eval, 'eval'); // eslint-disable-line no-eval

		const record = createRecord(key || '', val);
		this.records.set(val, record);
		record.serializer = this.traceGlobalInner(record, type, parent, key);
		return record;
	},

	traceGlobalInner(record, type, parent, key) {
		if (type === GLOBAL) {
			// Top level global e.g. `Object`
			record.type = GLOBAL_TYPE;
			record.extra = {name: key};
			this.globalVarNames.push(key);
			return this.serializeGlobalTopLevel;
		}

		if (type === MODULE) {
			// Built-in module e.g. `require('path')`
			record.type = GLOBAL_TYPE;
			record.extra = {name: key};
			return this.serializeBuiltInModule;
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

			record.type = GLOBAL_TYPE;
			record.name = name;
			record.extra = {key, keyRecord};
			return this.serializeGlobalProperty;
		}

		if (type === PROTO) {
			// PrototypeOf
			const parentRecord = this.traceValue(parent, null, '<parent global prototypeOf>');
			createDependency(record, parentRecord);
			createDependency(record, this.traceValue(Object.getPrototypeOf, null));

			record.type = GLOBAL_TYPE;
			record.name = `${parentRecord.name}Prototype`;
			return this.serializeGlobalPrototype;
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

			record.type = GLOBAL_TYPE;
			record.name = name;
			record.extra = {key, keyRecord, isGetter};
			return this.serializeGlobalGetterSetter;
		}

		if (type === COMMON_JS) {
			// CommonJS var
			// TODO
			throw new Error('CommonJS vars not supported');
		}

		// TODO Add other special values
		throw new Error('Special types not supported');
	},

	/**
	 * Serialize top-level global value e.g. `Object`.
	 * @param {Object} record - Record
	 * @param {string} record.extra.name - Name of global
	 * @returns {Object} - AST node
	 */
	serializeGlobalTopLevel(record) {
		return t.identifier(record.extra.name);
	},

	// eslint-disable-next-line jsdoc/require-throws, jsdoc/require-returns-check
	/**
	 * Serialize built-in module e.g. `require('path')`.
	 * @param {Object} record - Record
	 * @param {string} record.extra.name - Name of global
	 * @returns {Object} - AST node
	 */
	serializeBuiltInModule(record) { // eslint-disable-line no-unused-vars
		// TODO
		throw new Error('Built-in modules not supported');
	},

	/**
	 * Serialize global property (e.g. `Object.create`, `Object.prototype.toString`)
	 * or property of a built-in module (e.g. `require('path').join`).
	 * Parent will be first dependency.
	 * @param {Object} record - Record
	 * @param {string|number|symbol} record.extra.key - Property key
	 * @param {Object} [record.extra.keyRecord] - Record for key if it's a symbol
	 * @returns {Object} - AST node
	 */
	serializeGlobalProperty(record) {
		const parentNode = this.serializeValue(firstMapKey(record.dependencies));
		const {extra} = record;
		return this.createMemberNode(parentNode, extra.key, extra.keyRecord);
	},

	/**
	 * Serialize global prototype (e.g. `Object.getPrototypeOf(function*() {})`).
	 * Parent will be first dependency.
	 * @param {Object} record - Record
	 * @returns {Object} - AST node
	 */
	serializeGlobalPrototype(record) {
		return t.callExpression(
			this.serializeGlobalVal(Object.getPrototypeOf),
			[this.serializeValue(firstMapKey(record.dependencies))]
		);
	},

	/**
	 * Serialize global getter/setter
	 * (e.g. `Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').get`).
	 * Parent will be first dependency.
	 * @param {Object} record - Record
	 * @param {string|number|symbol} record.extra.key - Property key
	 * @param {Object} [record.extra.keyRecord] - Record for key if it's a symbol
	 * @param {boolean} record.extra.isGetter - `true` if getter, `false` if setter
	 * @returns {Object} - AST node
	 */
	serializeGlobalGetterSetter(record) {
		const parentNode = this.serializeValue(firstMapKey(record.dependencies));
		const {extra} = record,
			{key, keyRecord} = extra;
		const keyNode = keyRecord ? this.serializeValue(keyRecord)
			: isNumber(key) ? t.numericLiteral(key)
				: t.stringLiteral(key);
		return t.memberExpression(
			t.callExpression(
				this.serializeGlobalVal(Object.getOwnPropertyDescriptor),
				[parentNode, keyNode]
			),
			t.identifier(extra.isGetter ? 'get' : 'set')
		);
	},

	/**
	 * Trace and serialize a global value.
	 * Only used for globals used in code created by Livepack e.g. `Object.defineProperties()`.
	 * Must only be used if value was already traced.
	 * @param {*} val - Value
	 * @returns {Object} - AST node
	 */
	serializeGlobalVal(val) {
		return this.serializeValue(this.records.get(val));
	},

	/**
	 * Create member AST node.
	 * @param {Object} parentNode - Object AST node
	 * @param {string|number|symbol} key - Property key
	 * @param {Object} [keyRecord] - Record for key if it's a symbol
	 * @returns {Object} - AST node
	 */
	createMemberNode(parentNode, key, keyRecord) {
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
};
