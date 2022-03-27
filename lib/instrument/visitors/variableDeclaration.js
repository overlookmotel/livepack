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

// Create declarator visitors
const ConstDeclarator = createVariableDeclaratorVisitor(AssigneeConst),
	LetDeclarator = createVariableDeclaratorVisitor(AssigneeLet),
	VarDeclarator = createVariableDeclaratorVisitor(AssigneeVar);

/**
 * Visitor for variable declaration.
 * @param {Object} node - Variable declaration statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 * @throws {Error} - If unexpected declaration kind
 */
function VariableDeclaration(node, state) {
	switch (node.kind) {
		case 'const': return visitKeyContainer(node, 'declarations', ConstDeclarator, state);
		case 'let': return visitKeyContainer(node, 'declarations', LetDeclarator, state);
		case 'var': return visitKeyContainer(node, 'declarations', VarDeclarator, state);
		default: throw new Error(`Unexpected variable declaration kind '${node.kind}'`);
	}
}

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
