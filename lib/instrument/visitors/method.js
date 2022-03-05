/* --------------------
 * livepack module
 * Code instrumentation visitor for functions
 * ------------------*/

'use strict';

// Export
module.exports = {
	visitMethod,
	getMethodName
};

// Imports
const {visitFunctionOrMethod, getFunctionType, insertTrackerComment} = require('./function.js');

// Exports

/**
 * Visit method.
 * Does not visit computed key. This must be done by the caller.
 * Caller must also set `state.isStrict`, `state.currentBlock`, `state.currentSuperBlock`
 * and `state.currentSuperIsProto` before calling.
 *
 * @param {Object} node - Method AST node
 * @param {Array} parent - Parent class body / object expression properties container
 * @param {number} key - Index of parent container
 * @param {string} [fnName] - Function name
 * @param {boolean} isStrict - `true` if method is strict mode
 * @param {boolean} isEnteringStrict - `true` if method transitions into strict mode with a 'use strict'
 *   directive in its body
 * @param {boolean} keyIsComputed - `true` if method has computed key
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitMethod(node, parent, key, fnName, isStrict, isEnteringStrict, keyIsComputed, state) {
	// Visit function
	const fn = visitFunctionOrMethod(
		node, parent, key, fnName, isStrict, isEnteringStrict, true, true, state
	);

	// Insert tracker comment before key if computed key, or after key otherwise
	insertTrackerComment(
		fn.id, getFunctionType(node),
		node.key, keyIsComputed ? 'leading' : 'trailing', state
	);
}

/**
 * Get method name.
 * @param {Object} node - Method AST node
 * @returns {string|undefined} - Method name, or `undefined` if cannot determine name
 */
function getMethodName(node) {
	const keyNode = node.key,
		{type} = keyNode;
	if (type === 'Identifier') return keyNode.name;
	if (type === 'StringLiteral') return keyNode.value;
	if (type === 'NumericLiteral') return `${keyNode.value}`;
	return undefined;
}
