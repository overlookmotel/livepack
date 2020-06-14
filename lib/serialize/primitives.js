/* --------------------
 * livepack module
 * Serialize primitives
 * ------------------*/

'use strict';

// Modules
const {isSymbol} = require('is-it-type'),
	t = require('@babel/types');

// Exports

module.exports = {
	isPrimitive,
	serializePrimitive
};

function isPrimitive(val) {
	// Symbols are not considered primitives as they need to be uniquely referenced
	return !isSymbol(val) && Object(val) !== val;
}

function serializePrimitive(val) {
	const type = typeof val;
	if (val === undefined) return t.identifier('undefined');
	if (val === null) return t.nullLiteral();
	if (type === 'string') return t.stringLiteral(val);
	if (type === 'boolean') return t.booleanLiteral(val);
	if (type === 'number') return serializeNumber(val);
	// TODO
	throw new Error(`Serializing primitive type '${type}' is not supported`);
}

function serializeNumber(num) {
	const node = t.numericLiteral(num);
	if (Object.is(num, -0)) return t.unaryExpression('-', node);
	return node;
}
