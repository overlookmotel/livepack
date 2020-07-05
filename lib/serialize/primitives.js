/* --------------------
 * livepack module
 * Serialize primitives
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Exports

module.exports = {
	serializePrimitive,
	serializeUndefined
};

function serializePrimitive(val) {
	const type = typeof val;
	if (val === undefined) return serializeUndefined();
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

function serializeUndefined() {
	return t.unaryExpression('void', t.numericLiteral(0));
}
