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
	{ForStatement, ForXStatement, WhileStatement, DoWhileStatement} = require('./loop.js'),
	SwitchStatement = require('./switch.js'),
	TryStatement = require('./try.js'),
	ThrowStatement = require('./unary.js'),
	{visitKey, visitKeyMaybe} = require('../visit.js');

// Exports

/**
 * Visitor for statement.
 * @param {Object} node - Statement AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 * @throws {Error} - If unexpected AST node type
 */
function Statement(node, state, parent, key) {
	/* eslint-disable consistent-return */
	switch (node.type) {
		case 'VariableDeclaration': return VariableDeclaration(node, state);
		case 'FunctionDeclaration': return FunctionDeclaration(node, state, parent, key);
		case 'ClassDeclaration': return ClassDeclaration(node, state, parent, key);
		case 'ExpressionStatement': return ExpressionStatement(node, state);
		// `BlockStatement` called with 4 params even though it only receives 2 for consistency
		// with other places where it's passed to `visitKey()` and therefore called with 4 params
		case 'BlockStatement': return BlockStatement(node, state, parent, key);
		case 'ReturnStatement': return ReturnStatement(node, state);
		case 'IfStatement': return IfStatement(node, state);
		case 'ForStatement': return ForStatement(node, state);
		case 'ForOfStatement':
		case 'ForInStatement': return ForXStatement(node, state);
		case 'WhileStatement': return WhileStatement(node, state);
		case 'DoWhileStatement': return DoWhileStatement(node, state);
		case 'SwitchStatement': return SwitchStatement(node, state);
		case 'WithStatement': return WithStatement(node, state);
		case 'TryStatement': return TryStatement(node, state);
		case 'ThrowStatement': return ThrowStatement(node, state);
		case 'LabeledStatement': return LabeledStatement(node, state);
		case 'BreakStatement':
		case 'ContinueStatement':
		case 'EmptyStatement':
		case 'DebuggerStatement': return;
		default: throw new Error(`Unexpected statement type '${node.type}'`);
	}
	/* eslint-enable consistent-return */
}

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
