/* --------------------
 * livepack module
 * Code instrumentation visitor for block statements
 * ------------------*/

'use strict';

// Export
module.exports = BlockStatement;

// Imports
const Statement = require('./statement.js'),
	{createAndEnterBlock} = require('../blocks.js'),
	{visitKeyContainer} = require('../visit.js');

// Exports

/**
 * Visitor for block statement.
 * Block statements which are function bodies or loop bodies do not use this visitor.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function BlockStatement(node, state) {
	const parentBlock = state.currentBlock;
	createAndEnterBlock(undefined, false, state);

	visitKeyContainer(node, 'body', Statement, state);

	state.currentBlock = parentBlock;
}
