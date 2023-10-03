/* --------------------
 * livepack module
 * Serialize boxed primitives
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types'),
	upperFirst = require('lodash/upperFirst'),
	{isNumber} = require('is-it-type');

// Imports
const {
	BOXED_STRING_TYPE, BOXED_BOOLEAN_TYPE, BOXED_NUMBER_TYPE, BOXED_BIGINT_TYPE, BOXED_SYMBOL_TYPE,
	registerSerializer
} = require('./types.js');

// Exports

const stringToString = String.prototype.toString,
	booleanValueOf = Boolean.prototype.valueOf,
	numberValueOf = Number.prototype.valueOf,
	bigIntValueOf = BigInt.prototype.valueOf,
	symbolToPrimitive = Symbol.prototype[Symbol.toPrimitive];

module.exports = {
	/**
	 * Trace boxed String.
	 * @param {Object} str - Boxed String
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceBoxedString(str, record) {
		const val = stringToString.call(str),
			len = val.length;
		// Skip `length` property and integer-keyed properties representing characters of the string.
		// These properties are all non-writable and non-configurable, so cannot be changed.
		this.traceProperties(str, record, key => key === 'length' || (isNumber(key) && key < len));
		record.extra = {valRecord: this.traceValue(val, null, null), len};
		record.name = `boxed${upperFirst(val)}`;
		return BOXED_STRING_TYPE;
	},

	/**
	 * Trace boxed Boolean.
	 * @param {Object} bool - Boxed Boolean
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceBoxedBoolean(bool, record) {
		const val = booleanValueOf.call(bool);
		this.traceProperties(bool, record, null);
		record.extra = {val};
		record.name = `boxed${upperFirst(`${val}`)}`;
		return BOXED_BOOLEAN_TYPE;
	},

	/**
	 * Trace boxed Number.
	 * @param {Object} num - Boxed Number
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceBoxedNumber(num, record) {
		const val = numberValueOf.call(num);
		this.traceProperties(num, record, null);
		record.extra = {val};
		record.name = `boxed${val < 0 || Object.is(val, -0) ? 'Minus' : ''}${val}`;
		return BOXED_NUMBER_TYPE;
	},

	/**
	 * Trace boxed BigInt.
	 * @param {Object} bigInt - Boxed BigInt
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceBoxedBigInt(bigInt, record) {
		const val = bigIntValueOf.call(bigInt),
			valRecord = this.traceValue(val, null, null);
		this.traceProperties(bigInt, record, null);
		record.extra = {valRecord};
		record.name = `boxed${upperFirst(valRecord.name)}`;
		return BOXED_BIGINT_TYPE;
	},

	/**
	 * Trace boxed Symbol.
	 * @param {Object} symbol - Boxed Symbol
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceBoxedSymbol(symbol, record) {
		const val = symbolToPrimitive.call(symbol),
			valRecord = this.traceDependency(val, `${record.name}Unboxed`, '<unboxed>', record);
		this.traceProperties(symbol, record, null);
		record.extra = {valRecord};
		record.name = `boxed${upperFirst(valRecord.name)}`;
		return BOXED_SYMBOL_TYPE;
	}
};

/**
 * Serialize boxed String.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {Object} record.extra.valRecord - Record for boxed value
 * @param {number} record.extra.len - String length
 * @returns {Object} - AST node
 */
function serializeBoxedString(record) {
	// `new String('xyz')` or `new String` (for empty string)
	const node = t.newExpression(
		this.traceAndSerializeGlobal(String),
		record.extra.len > 0 ? [this.serializeValue(record.extra.valRecord)] : []
	);
	return this.wrapWithProperties(node, record, this.stringPrototypeRecord, null);
}
registerSerializer(BOXED_STRING_TYPE, serializeBoxedString);

/**
 * Serialize boxed Boolean.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {boolean} record.extra.val - `true` or `false`
 * @returns {Object} - AST node
 */
function serializeBoxedBoolean(record) {
	// `new Boolean` (for false) or `new Boolean(1)` (for true)
	const node = t.newExpression(
		this.traceAndSerializeGlobal(Boolean),
		record.extra.val ? [this.traceAndSerializeGlobal(1)] : []
	);
	return this.wrapWithProperties(node, record, this.booleanPrototypeRecord, null);
}
registerSerializer(BOXED_BOOLEAN_TYPE, serializeBoxedBoolean);

/**
 * Serialize boxed Number.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {number} record.extra.val - Value
 * @returns {Object} - AST node
 */
function serializeBoxedNumber(record) {
	// `new Number(123)` or `new Number` (for 0)
	const {val} = record.extra,
		node = t.newExpression(
			this.traceAndSerializeGlobal(Number),
			Object.is(val, 0) ? [] : [this.traceAndSerializeGlobal(val)]
		);
	return this.wrapWithProperties(node, record, this.numberPrototypeRecord, null);
}
registerSerializer(BOXED_NUMBER_TYPE, serializeBoxedNumber);

/**
 * Serialize boxed BigInt.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {Object} record.extra.valRecord - Record for boxed value
 * @returns {Object} - AST node
 */
function serializeBoxedBigInt(record) {
	// `Object(123n)`
	const node = t.callExpression(
		this.traceAndSerializeGlobal(Object),
		[this.serializeValue(record.extra.valRecord)]
	);
	return this.wrapWithProperties(node, record, this.bigIntPrototypeRecord, null);
}
registerSerializer(BOXED_BIGINT_TYPE, serializeBoxedBigInt);

/**
 * Serialize boxed Symbol.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {Object} record.extra.valRecord - Record for boxed value
 * @returns {Object} - AST node
 */
function serializeBoxedSymbol(record) {
	// `Object(Symbol('x'))`
	const node = t.callExpression(
		this.traceAndSerializeGlobal(Object),
		[this.serializeValue(record.extra.valRecord)]
	);
	return this.wrapWithProperties(node, record, this.symbolPrototypeRecord, null);
}
registerSerializer(BOXED_SYMBOL_TYPE, serializeBoxedSymbol);
