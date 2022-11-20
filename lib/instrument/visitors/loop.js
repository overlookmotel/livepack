/* --------------------
 * livepack module
 * Code instrumentation visitor for `for` / `while` statements
 * ------------------*/

'use strict';

// Export

module.exports = {
	ForStatement,
	ForXStatement,
	WhileStatement,
	DoWhileStatement
};

// Modules
const t = require('@babel/types');

// Import
const Statement = require('./statement.js'),
	Expression = require('./expression.js'),
	VariableDeclaration = require('./variableDeclaration.js'),
	{AssigneeAssignOnly} = require('./assignee.js'),
	{createBlock, createAndEnterBlock, createBindingWithoutNameCheck} = require('../blocks.js'),
	{insertBlockVarsIntoBlockStatement} = require('../tracking.js'),
	{visitKey, visitKeyMaybe, visitKeyContainer} = require('../visit.js');

// Exports

/**
 * Visitor for `for` statement.
 * @param {Object} node - `for` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ForStatement(node, state) {
	// Create blocks for init clause and body.
	// NB Init block is required even if no `const` / `let` declaration,
	// if initializer contains a class/object expression with method using `super`.
	// TODO Add scope ID var and temp vars to init `const` / `let` initializer, rather than in block
	// TODO Actually it's more complicated than this:
	// e.g. `for (let i = 0, getI = () => i; i < 3; i++) {}`
	// Initial vars declaration is only evaluated once, and `getI()` returns `0` in every turn of the loop,
	// whereas `i` evaluates to a different value of `i` in each turn of loop.
	// So `i` within the var declaration and `i` within the test + update clauses and body
	// are essentially separate vars.
	const initBlock = createAndEnterBlock('for', false, state);
	const bodyBlock = createBlock('for', true, state);
	initBlock.varsBlock = bodyBlock;

	visitKeyMaybe(node, 'init', ForInitializer, state);
	visitKeyMaybe(node, 'test', Expression, state);
	visitKeyMaybe(node, 'update', Expression, state);

	state.currentBlock = bodyBlock;
	visitKey(node, 'body', LoopBody, state);
	state.currentBlock = initBlock.parent;
}

/**
 * Visitor for `for` statement initializer.
 * @param {Object} node - `for` statement initializer AST node
 * @param {Object} state - State object
 * @param {Object} parent - `for` statement AST node
 * @returns {undefined}
 */
function ForInitializer(node, state, parent) {
	if (node.type === 'VariableDeclaration') {
		VariableDeclaration(node, state);
	} else {
		Expression(node, state, parent, 'init');
	}
}

/**
 * Visitor for `for in` or `for of` statement.
 * @param {Object} node - `for in` / `for of` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ForXStatement(node, state) {
	// TODO Move init clause into body if contains functions which reference init vars
	// e.g. `for ( const [ x, getX = () => x ] of [ [1], [2] ] ) { ... }`

	// Create blocks.
	// NB Init block is required even if no `const` / `let` declaration,
	// if initializer contains a class/object expression with method using `super`.
	const parentBlock = state.currentBlock;
	const initBlock = createAndEnterBlock('for', false, state);
	const bodyBlock = createBlock('for', true, state);
	initBlock.varsBlock = bodyBlock;

	// Visit initializer
	visitKey(node, 'left', ForXInitializer, state);

	// Create block for right-hand side (i.e. expression after `in` or `of`)
	// with all same bindings as init block. Accessing these vars from within right-hand side
	// is temporal dead zone violation.
	// https://github.com/overlookmotel/livepack/issues/323
	state.currentBlock = parentBlock;
	const initBindingNames = Object.keys(initBlock.bindings);
	if (initBindingNames.length !== 0) {
		const rightBlock = createAndEnterBlock('for', false, state);
		for (const varName of initBindingNames) {
			createBindingWithoutNameCheck(rightBlock, varName, {isConst: true});
		}
	}

	// Visit right-hand side
	visitKey(node, 'right', Expression, state);

	// Visit body
	state.currentBlock = bodyBlock;
	visitKey(node, 'body', LoopBody, state);
	state.currentBlock = parentBlock;
}

/**
 * Visitor for `for in` / `for of` statement initializer.
 * @param {Object} node - `for in` / `for of` statement initializer AST node
 * @param {Object} state - State object
 * @param {Object} parent - `for in` /  `for of` statement AST node
 * @returns {undefined}
 */
function ForXInitializer(node, state, parent) {
	if (node.type === 'VariableDeclaration') {
		VariableDeclaration(node, state);
	} else {
		AssigneeAssignOnly(node, state, parent, 'left');
	}
}

/**
 * Visitor for `while` statement.
 * @param {Object} node - `while` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function WhileStatement(node, state) {
	// Init block is required to hold scope ID and temp vars if test clause contains
	// a class/object expression with method using `super`
	// TODO Convert to a `for (...; ...; ...)` loop if init block is used for `super` temp vars
	const initBlock = createAndEnterBlock('while', false, state);
	const bodyBlock = createBlock('while', true, state);
	initBlock.varsBlock = bodyBlock;

	visitKey(node, 'test', Expression, state);

	state.currentBlock = bodyBlock;
	visitKey(node, 'body', LoopBody, state);
	state.currentBlock = initBlock.parent;
}

/**
 * Visitor for `do while` statement.
 * @param {Object} node - `do while` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function DoWhileStatement(node, state) {
	// Init block is required to hold scope ID and temp vars if test clause contains
	// a class/object expression with method using `super`
	// TODO Convert to a `for (...; ...; ...)` loop if init block is used for `super` temp vars
	const initBlock = createAndEnterBlock('doWhile', false, state);
	const bodyBlock = createAndEnterBlock('doWhile', true, state);
	initBlock.varsBlock = bodyBlock;

	visitKey(node, 'body', LoopBody, state);

	state.currentBlock = initBlock;
	visitKey(node, 'test', Expression, state);
	state.currentBlock = initBlock.parent;
}

/**
 * Visitor for `for` / `for in` / `for of` / `while` / `do while` statement body.
 * @param {Object} node - Loop statement body AST node
 * @param {Object} state - State object
 * @param {Object} statementNode - Loop statement AST node
 * @returns {undefined}
 */
function LoopBody(node, state, statementNode) {
	const hasBodyBlock = node.type === 'BlockStatement';
	if (hasBodyBlock) {
		visitKeyContainer(node, 'body', Statement, state);
	} else {
		Statement(node, state, statementNode, 'body');
	}

	state.secondPass(instrumentLoopBody, node, statementNode, state.currentBlock, hasBodyBlock, state);
}

/**
 * Instrument loop body.
 * Convert body to statement block if needs scope ID or temp vars.
 * Insert block vars.
 * @param {Object} bodyNode - Loop statement body AST node
 * @param {Object} statementNode - Loop statement AST node
 * @param {Object} bodyBlock - Body block object
 * @param {boolean} hasBodyBlock - `true` if body is a statement block
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentLoopBody(bodyNode, statementNode, bodyBlock, hasBodyBlock, state) {
	if (!bodyBlock.scopeIdVarNode && !bodyBlock.tempVarNodes) return;

	// Convert body to block statement, so can have scope ID and temp vars added
	if (!hasBodyBlock) {
		bodyNode = t.blockStatement([bodyNode]);
		statementNode.body = bodyNode;
	}

	insertBlockVarsIntoBlockStatement(bodyBlock, bodyNode, state);
}
