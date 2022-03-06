/* --------------------
 * livepack module
 * Code instrumentation visitor for variable declarations
 * ------------------*/

'use strict';

// Export
module.exports = VariableDeclaration;

// Imports
const Expression = require('./expression.js'),
	{AssigneeConst, AssigneeLet, AssigneeVar} = require('./assignee.js'),
	{visitKey, visitKeyMaybe, visitKeyContainer} = require('../visit.js');

// Exports

/**
 * Visitor for variable declaration.
 * @param {Object} node - Variable declaration statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function VariableDeclaration(node, state) {
	const {kind} = node;
	// eslint-disable-next-line no-use-before-define
	visitKeyContainer(node, 'declarations', variableDeclaratorVisitors[kind], state);
}

const variableDeclaratorVisitors = {
	const: createVariableDeclaratorVisitor(AssigneeConst),
	let: createVariableDeclaratorVisitor(AssigneeLet),
	var: createVariableDeclaratorVisitor(AssigneeVar)
};

/**
 * Create `VariableDeclarator` visitor.
 * Different `VariableDeclarator` visitors are used depending on declaration kind.
 * Each uses the appropriate `Assignee` visitor for `id` clause.
 * These in turn create the correct binding type.
 * @param {Function} Assignee - Assignee visitor
 * @returns {Function} - VariableDeclarator visitor
 */
function createVariableDeclaratorVisitor(Assignee) {
	return function VariableDeclarator(node, state) {
		visitKey(node, 'id', Assignee, state);
		visitKeyMaybe(node, 'init', Expression, state);
	};
}
