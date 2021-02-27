/* --------------------
 * livepack module
 * Serialize boxed primitives
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{serializeBigInt} = require('./primitives.js'),
	{isNumberKey} = require('./utils.js');

// Exports

const booleanValueOf = Boolean.prototype.valueOf;

module.exports = {
	serializeBoxedString(str, record) {
		const StringRecord = this.serializeValue(String),
			len = str.length;
		const node = t.newExpression(
			StringRecord.varNode,
			len > 0 ? [t.stringLiteral(String(str))] : []
		);
		createDependency(record, StringRecord, node, 'callee');

		return this.wrapWithProperties(
			str, record, node, String.prototype, undefined,
			(key) => {
				if (key === 'length') return true;
				if (!isNumberKey(key)) return false;
				return key * 1 < len;
			}
		);
	},

	serializeBoxedBoolean(bool, record) {
		const BooleanRecord = this.serializeValue(Boolean);
		const node = t.newExpression(
			BooleanRecord.varNode,
			booleanValueOf.call(bool) ? [t.numericLiteral(1)] : []
		);
		createDependency(record, BooleanRecord, node, 'callee');
		return this.wrapWithProperties(bool, record, node, Boolean.prototype);
	},

	serializeBoxedNumber(num, record) {
		const NumberRecord = this.serializeValue(Number),
			unwrappedNum = Number(num),
			numRecord = this.serializeValue(unwrappedNum);
		const node = t.newExpression(
			NumberRecord.varNode,
			!Object.is(unwrappedNum, 0) ? [numRecord.varNode] : []
		);
		createDependency(record, NumberRecord, node, 'callee');
		if (numRecord.node) createDependency(record, numRecord, node.arguments, 0);
		return this.wrapWithProperties(num, record, node, Number.prototype);
	},

	serializeBoxedBigInt(bigInt, record) {
		const ObjectRecord = this.serializeValue(Object);
		const node = t.callExpression(ObjectRecord.varNode, [serializeBigInt(bigInt)]);
		createDependency(record, ObjectRecord, node, 'callee');
		return this.wrapWithProperties(bigInt, record, node, BigInt.prototype);
	}
};
