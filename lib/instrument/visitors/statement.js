/* --------------------
 * livepack module
 * Code instrumentation visitor for statements
 * ------------------*/

'use strict';

// Export
module.exports = Statement;

// Imports
const VariableDeclaration = require('./variableDeclaration.js'),
	{FunctionDeclaration} = require('./function.js'),
	{ClassDeclaration} = require('./class.js'),
	Expression = require('./expression.js'),
	BlockStatement = require('./block.js'),
	IfStatement = require('./if.js'),
	{
		ForStatement, ForOfStatement, ForInStatement, WhileStatement, DoWhileStatement
	} = require('./loop.js'),
	SwitchStatement = require('./switch.js'),
	TryStatement = require('./try.js'),
	ThrowStatement = require('./unary.js'),
	Noop = require('./noop.js'),
	{visitKey, visitKeyMaybe, visitWith} = require('../visit.js');

// Exports

/**
 * Visitor for statement.
 * @param {Object} node - Statement AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function Statement(node, state, parent, key) {
	// eslint-disable-next-line no-use-before-define
	visitWith(node, statementVisitors, 'statement', state, parent, key);
}

const statementVisitors = {
	VariableDeclaration,
	FunctionDeclaration,
	ClassDeclaration,
	ExpressionStatement,
	BlockStatement,
	ReturnStatement,
	IfStatement,
	ForStatement,
	ForOfStatement,
	ForInStatement,
	WhileStatement,
	DoWhileStatement,
	SwitchStatement,
	WithStatement,
	TryStatement,
	ThrowStatement,
	LabeledStatement,
	BreakStatement: Noop,
	ContinueStatement: Noop,
	EmptyStatement: Noop,
	DebuggerStatement: Noop
};

function ExpressionStatement(node, state) {
	visitKey(node, 'expression', Expression, state);
}

function ReturnStatement(node, state) {
	visitKeyMaybe(node, 'argument', Expression, state);
}

function WithStatement(node, state) {
	// TODO Maintain a state property `currentWithBlock` which can be used in `resolveBinding()`
	// to flag functions which access a var which would be affected by `with`
	visitKey(node, 'object', Expression, state);
	visitKey(node, 'body', Statement, state);
}

function LabeledStatement(node, state) {
	visitKey(node, 'body', Statement, state);
}
