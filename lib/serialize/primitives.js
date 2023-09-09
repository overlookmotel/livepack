/* --------------------
 * livepack module
 * Serialize primitives
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {
	STRING_TYPE,
	BOOLEAN_TYPE,
	NUMBER_TYPE,
	BIGINT_TYPE,
	NULL_TYPE,
	UNDEFINED_TYPE,
	NEGATIVE_TYPE,
	registerSerializer
} = require('./types.js');

// Exports

const bigIntToString = BigInt.prototype.toString;

module.exports = {tracePrimitive, traceNumber, traceBigInt, serializeNumber, serializeBigInt};

/**
 * Trace primitive value.
 * Primitives are never de-duplicated. A new record is created each time.
 * Value is recorded as `record.extra.val`.
 * @this Serializer
 * @param {*} val - Value
 * @param {string} type - `typeof val` or 'null'
 * @param {Object} record - Record
 * @returns {number} - Type ID
 * @throws {Error} - If `type` is not valid
 */
function tracePrimitive(val, type, record) {
	switch (type) { // eslint-disable-line default-case
		case 'null': return traceNull(record);
		case 'undefined': return traceUndefined(record);
		case 'string': return traceString(val, record);
		case 'boolean': return traceBoolean(val, record);
		case 'number': return this.traceNumber(val, record);
		case 'bigint': return this.traceBigInt(val, record);
	}

	// TODO: Remove this in production build. Should not be reachable.
	throw new Error('Unrecognised primitive type');
}

function traceNull(record) {
	record.name = 'null';
	return NULL_TYPE;
}

function traceUndefined(record) {
	record.name = 'undefined';
	return UNDEFINED_TYPE;
}

function traceString(val, record) {
	record.extra = {val};
	record.name = val;
	return STRING_TYPE;
}

function traceBoolean(val, record) {
	record.extra = {val};
	record.name = `${val}`;
	return BOOLEAN_TYPE;
}

/**
 * Trace number.
 * @this Serializer
 * @param {number} val - Number
 * @param {Object} record - Record
 * @returns {number} - Type ID
 */
function traceNumber(val, record) {
	// `Object.is()` required to differentiate between 0 and -0
	if (val < 0 || Object.is(val, -0)) {
		record.name = `minus${-val}`;
		record.extra = {positive: this.traceDependency(-val, record)};
		return NEGATIVE_TYPE;
	}

	record.extra = {val};
	record.name = `n${val}`;
	return NUMBER_TYPE;
}

/**
 * Trace `BigInt`.
 * @this Serializer
 * @param {number} val - BigInt
 * @param {Object} record - Record
 * @returns {number} - Type ID
 */
function traceBigInt(val, record) {
	if (val < 0) {
		record.name = `minusb${-val}`;
		record.extra = {positive: this.traceDependency(-val, record)};
		return NEGATIVE_TYPE;
	}

	record.extra = {val};
	record.name = `b${val}`;
	return BIGINT_TYPE;
}

/**
 * Serialize `null`.
 * @returns {Object} - AST node
 */
function serializeNull() {
	return t.nullLiteral();
}
registerSerializer(NULL_TYPE, serializeNull);

/**
 * Serialize `undefined`.
 * @returns {Object} - AST node for `void 0`
 */
function serializeUndefined() {
	return t.unaryExpression('void', t.numericLiteral(0));
}
registerSerializer(UNDEFINED_TYPE, serializeUndefined);

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
registerSerializer(STRING_TYPE, serializeString);

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
registerSerializer(BOOLEAN_TYPE, serializeBoolean);

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
registerSerializer(NUMBER_TYPE, serializeNumber);

/**
 * Serialize `BigInt`.
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
registerSerializer(BIGINT_TYPE, serializeBigInt);

/**
 * Serialize negative number / `BigInt`.
 * @this Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {bigint} record.extra.positive - Number / BigInt
 * @returns {Object} - AST node
 */
function serializeNegative(record) {
	return t.unaryExpression('-', this.serializeValue(record.extra.positive));
}
registerSerializer(NEGATIVE_TYPE, serializeNegative);
