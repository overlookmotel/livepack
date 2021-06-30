/* --------------------
 * livepack module
 * Serialize primitives
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createRecord} = require('./records.js'),
	{PRIMITIVE_TYPE} = require('./types.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

const bigIntToString = BigInt.prototype.toString;

const SERIALIZERS = {
	string: serializeString,
	boolean: serializeBoolean,
	number: serializeNumber,
	bigint: serializeBigInt,
	null: serializeNull
};

module.exports = {
	/**
	 * Trace primitive value.
	 * Primitives are never de-duplicated. A new record is created each time.
	 * @param {*} val - Value
	 * @param {string} type - `typeof val` or 'null'
	 * @returns {Object} - Record
	 */
	tracePrimitive(val, type) {
		const record = createRecord(type, val);
		record.type = PRIMITIVE_TYPE;

		const serializer = SERIALIZERS[type];
		assertBug(serializer, `Unexpected primitive type '${type}'`);
		record.serializer = serializer;

		return record;
	},

	/**
	 * Trace `undefined`.
	 * `undefined` is different from all other primitives as it's treated as a non-primitive value
	 * and will be de-duplicated.
	 * @returns {Function} - Serializer function
	 */
	traceUndefined() {
		return this.serializeUndefined;
	},

	/**
	 * Serialize `undefined`.
	 * @returns {Object} - AST node for `void 0`
	 */
	serializeUndefined() {
		return t.unaryExpression('void', t.numericLiteral(0));
	}
};

/**
 * Serialize `null`.
 * @returns {Object} - AST node
 */
function serializeNull() {
	return t.nullLiteral();
}

/**
 * Serialize string.
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeString(record) {
	return t.stringLiteral(record.val);
}

/**
 * Serialize boolean.
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeBoolean(record) {
	return t.booleanLiteral(record.val);
}

/**
 * Serialize number.
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeNumber(record) {
	const {val} = record;
	// `Object.is()` required to differentiate between 0 and -0
	if (val > 0 || Object.is(val, 0)) return t.numericLiteral(val);
	return t.unaryExpression('-', t.numericLiteral(-val));
}

/**
 * Serialize bigint.
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeBigInt(record) {
	const {val} = record;
	if (val >= 0) return t.bigIntLiteral(bigIntToString.call(val));
	return t.unaryExpression('-', t.bigIntLiteral(bigIntToString.call(-val)));
}
