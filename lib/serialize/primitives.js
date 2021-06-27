/* --------------------
 * livepack module
 * Serialize primitives
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createRecord} = require('./records.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

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
	 * Primitives are never de-duplicated.
	 * @param {*} val - Value
	 * @param {string} type - `typeof val` or 'null'
	 * @returns {Object} - Record
	 */
	tracePrimitive(val, type) {
		const record = createRecord(type, val);

		const serializer = SERIALIZERS[type];
		assertBug(serializer, `Unexpected primitive type '${type}'`);
		record.serializer = serializer;

		return record;
	},

	/**
	 * Trace `undefined`.
	 * `undefined` is different from all other primitives as it's treated as a non-primitive value
	 * and will be de-duplicated.
	 * @returns {Function} - Serializer
	 */
	traceUndefined() {
		return serializeUndefined;
	}
};

/*
 * Serializers
 */

function serializeString(record) {
	return t.stringLiteral(record.val);
}

function serializeBoolean(record) {
	return t.booleanLiteral(record.val);
}

function serializeNumber(record) {
	const {val} = record;
	// `Object.is()` required to differentiate between 0 and -0
	if (val > 0 || Object.is(val, 0)) return t.numericLiteral(val);
	return t.unaryExpression('-', t.numericLiteral(-val));
}

const bigIntToString = BigInt.prototype.toString;

function serializeBigInt(record) {
	const {val} = record;
	if (val >= 0) return t.bigIntLiteral(bigIntToString.call(val));
	return t.unaryExpression('-', t.bigIntLiteral(bigIntToString.call(-val)));
}

function serializeNull() {
	return t.nullLiteral();
}

function serializeUndefined() {
	return t.unaryExpression('void', t.numericLiteral(0));
}
