/* --------------------
 * livepack module
 * Code instrumentation visitor for `if` statements
 * ------------------*/

'use strict';

// Export
module.exports = IfStatement;

// Imports
const Statement = require('./statement.js'),
	Expression = require('./expression.js'),
	{FunctionDeclaration} = require('./function.js'),
	{createAndEnterBlock} = require('../blocks.js'),
	{visitKey, visitKeyMaybe} = require('../visit.js');

// Exports

/**
 * Visitor for `if` statement.
 * @param {Object} node - If statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function IfStatement(node, state) {
	visitKey(node, 'test', Expression, state);
	visitKey(node, 'consequent', IfStatementConsequentOrAlternate, state);
	visitKeyMaybe(node, 'alternate', IfStatementConsequentOrAlternate, state);
}

/**
 * Visitor for `if` statement consequent or alternate.
 * Visit as statement, except if is function declaration, in which case create a block for the function.
 * @param {Object} node - `if` statement consequent or alternate AST node
 * @param {Object} state - State object
 * @param {Object} parent - `if` statement AST node
 * @param {string} key - 'consequent' or 'alternate'
 * @returns {undefined}
 */
function IfStatementConsequentOrAlternate(node, state, parent, key) {
	if (node.type === 'FunctionDeclaration') {
		// Sloppy mode function declaration (must be, this would be illegal in strict mode).
		// Block holds the function declaration binding, which is separate from the hoisted binding.
		// See https://github.com/babel/babel/pull/14203#issuecomment-1038187168
		const block = createAndEnterBlock(undefined, false, state);
		FunctionDeclaration(node, state, parent, key);
		state.currentBlock = block.parent;
	} else {
		Statement(node, state, parent, key);
	}
}
