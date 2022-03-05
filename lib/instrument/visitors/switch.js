/* --------------------
 * livepack module
 * Code instrumentation visitor for switch statements
 * ------------------*/

'use strict';

// Export
module.exports = SwitchStatement;

// Imports
const Statement = require('./statement.js'),
	Expression = require('./expression.js'),
	{createAndEnterBlock} = require('../blocks.js'),
	{visitKey, visitKeyMaybe, visitKeyContainer} = require('../visit.js');

// Exports

/**
 * Visitor for `switch` statement.
 * @param {Object} node - `switch` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function SwitchStatement(node, state) {
	visitKey(node, 'discriminant', Expression, state);

	const parentBlock = state.currentBlock;
	createAndEnterBlock('switch', false, state);

	visitKeyContainer(node, 'cases', SwitchCase, state);

	state.currentBlock = parentBlock;
}

/**
 * Visitor for `switch` case.
 * @param {Object} node - `switch` case AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function SwitchCase(node, state) {
	visitKeyMaybe(node, 'test', Expression, state);
	visitKeyContainer(node, 'consequent', Statement, state);
}
