/* --------------------
 * livepack module
 * Serialize primitives
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createRecord} = require('./records.js'),
	{PRIMITIVE_TYPE, UNDEFINED_TYPE} = require('./types.js');

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
	 * Value is recorded as `record.extra.val`.
	 * @param {*} val - Value
	 * @param {string} type - `typeof val` or 'null'
	 * @returns {Object} - Record
	 */
	tracePrimitive(val, type) {
		const record = createRecord(type);
		record.type = PRIMITIVE_TYPE;
		record.serializer = SERIALIZERS[type];
		record.extra = {val};
		return record;
	},

	/**
	 * Trace `undefined`.
	 * `undefined` is different from all other primitives as it's treated as a non-primitive value
	 * and will be de-duplicated.
	 * This is because it is used so often, it saves bytes to assign it to a var.
	 * @param {Object} record - Record
	 * @returns {Function} - Serializer function
	 */
	traceUndefined(record) {
		record.type = UNDEFINED_TYPE;
		record.name = 'undefined';
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
 * @param {Object} record.extra - Extra props object
 * @param {string} record.extra.val - String
 * @returns {Object} - AST node
 */
function serializeString(record) {
	return t.stringLiteral(record.extra.val);
}

/**
 * Serialize boolean.
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {boolean} record.extra.val - Boolean
 * @returns {Object} - AST node
 */
function serializeBoolean(record) {
	return t.booleanLiteral(record.extra.val);
}

/**
 * Serialize number.
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {number} record.extra.val - Number
 * @returns {Object} - AST node
 */
function serializeNumber(record) {
	const {val} = record.extra;
	// `Object.is()` required to differentiate between 0 and -0
	if (val > 0 || Object.is(val, 0)) return t.numericLiteral(val);
	return t.unaryExpression('-', t.numericLiteral(-val));
}

/**
 * Serialize bigint.
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {bigint} record.extra.val - BigInt
 * @returns {Object} - AST node
 */
function serializeBigInt(record) {
	const {val} = record.extra;
	if (val >= 0) return t.bigIntLiteral(bigIntToString.call(val));
	return t.unaryExpression('-', t.bigIntLiteral(bigIntToString.call(-val)));
}
