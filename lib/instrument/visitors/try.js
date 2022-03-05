/* --------------------
 * livepack module
 * Code instrumentation visitor for `try` / `catch` statements
 * ------------------*/

'use strict';

// Export
module.exports = TryStatement;

// Imports
const BlockStatement = require('./block.js'),
	{AssigneeLet} = require('./assignee.js'),
	{createAndEnterBlock} = require('../blocks.js'),
	{visitKey, visitKeyMaybe} = require('../visit.js');

// Exports

/**
 * Visitor for `try` statement.
 * @param {Object} node - `try` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function TryStatement(node, state) {
	visitKey(node, 'block', BlockStatement, state);
	visitKeyMaybe(node, 'handler', CatchClause, state);
	visitKeyMaybe(node, 'finalizer', BlockStatement, state);
}

/**
 * Visitor for `catch` clause.
 * @param {Object} node - `catch` clause AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function CatchClause(node, state) {
	const parentBlock = state.currentBlock;
	createAndEnterBlock('catch', false, state);

	visitKey(node, 'param', AssigneeLet, state);
	visitKey(node, 'body', BlockStatement, state);

	state.currentBlock = parentBlock;
}
