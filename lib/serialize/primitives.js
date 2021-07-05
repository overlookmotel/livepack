/* --------------------
 * livepack module
 * Serialize primitives
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const assertBug = require('../shared/assertBug.js');

// Exports

module.exports = {
	serializePrimitive,
	serializeBigInt
};

function serializePrimitive(val) { // eslint-disable-line consistent-return
	const type = typeof val;
	if (val === null) return t.nullLiteral();
	if (type === 'string') return t.stringLiteral(val);
	if (type === 'boolean') return t.booleanLiteral(val);
	if (type === 'number') return serializeNumber(val);
	if (type === 'bigint') return serializeBigInt(val);
	assertBug(`Unexpected primitive type '${type}'`);
}

function serializeNumber(num) {
	// `Object.is()` required to differentiate between 0 and -0
	if (num > 0 || Object.is(num, 0)) return t.numericLiteral(num);
	return t.unaryExpression('-', t.numericLiteral(-num));
}

const bigIntToString = BigInt.prototype.toString;

function serializeBigInt(bigInt) {
	return t.bigIntLiteral(bigIntToString.call(bigInt));
}
