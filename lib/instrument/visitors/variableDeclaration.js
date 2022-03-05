/* --------------------
 * livepack module
 * Code instrumentation visitor for variable declarations
 * ------------------*/

'use strict';

// Export
module.exports = VariableDeclaration;

// Modules
const t = require('@babel/types');

// Imports
const Expression = require('./expression.js'),
	{AssigneeConst, AssigneeLet, AssigneeVar} = require('./assignee.js'),
	{isInFunctionWithComplexParams} = require('./params.js'),
	{visitKey, visitKeyMaybe, visitKeyContainer} = require('../visit.js'),
	{copyComments, copyCommentsToInnerComments, copyLocAndComments} = require('../utils.js');

// Exports

/**
 * Visitor for variable declaration.
 * @param {Object} node - Variable declaration statement AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function VariableDeclaration(node, state, parent, key) {
	const {kind} = node;
	// eslint-disable-next-line no-use-before-define
	visitKeyContainer(node, 'declarations', variableDeclaratorVisitors[kind], state);

	// If in a function with complex params, convert `var` declaration to assignment in 2nd pass.
	// The vars being assigned to will be created as `let` vars in `moveComplexParamsIntoFunctionBody()`.
	if (kind === 'var' && isInFunctionWithComplexParams(state)) {
		state.secondPass(convertVarDeclarationToAssignments, node, parent, key);
	}
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

/**
 * Convert `var` declaration to assignment.
 * @param {Object} declarationNode - Var declaration AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function convertVarDeclarationToAssignments(declarationNode, parent, key) {
	const declaratorNodes = declarationNode.declarations;
	if (key === 'left') {
		// `for (var x of arr) {}` -> `for (x of arr) {}`
		// `for (var x in obj) {}` -> `for (x in obj) {}`
		// `for (var {x} of arr) {}` -> `for ({x} of arr) {}`
		parent.left = copyLocAndComments(declaratorNodes[0].id, declarationNode);
	} else if (key === 'init') {
		// `for (var x = 1, y, z = 2;;) {}` => `for (x = 1, z = 2;;) {}`
		// `for (var x;;) {}` => `for (;;) {}`
		const expressionNode = declaratorsToExpression(declaratorNodes);
		parent.init = expressionNode;
		if (expressionNode) {
			copyComments(expressionNode, declarationNode);
		} else {
			copyCommentsToInnerComments(parent, declarationNode);
		}
	} else {
		// `var w = 1, x = 2, y, [z] = [3];` -> `w = 1, x = 2, [z] = [3];`
		// `var x, y, x;` -> `;` (empty statement)
		const expressionNode = declaratorsToExpression(declaratorNodes);
		parent[key] = copyLocAndComments(
			expressionNode ? t.expressionStatement(expressionNode) : t.emptyStatement(),
			declarationNode
		);
	}
}

/**
 * Convert var declarators to a single expression.
 * Any declarators which have no init clause (i.e. `var x` rather than `var x = 1`) are omitted.
 * If no declarators have an init clause, return `null`.
 * @param {Array<Object>} declaratorNodes - Array of `var` declarator AST nodes
 * @returns {Object|null} - Expression AST node
 */
function declaratorsToExpression(declaratorNodes) {
	const assignmentNodes = [];
	for (const declaratorNode of declaratorNodes) {
		if (declaratorNode.init) {
			assignmentNodes.push(copyLocAndComments(
				t.assignmentExpression('=', declaratorNode.id, declaratorNode.init),
				declaratorNode
			));
		}
	}

	const numAssignments = assignmentNodes.length;
	if (numAssignments === 0) return null;
	if (numAssignments === 1) return assignmentNodes[0];
	return t.sequenceExpression(assignmentNodes);
}
