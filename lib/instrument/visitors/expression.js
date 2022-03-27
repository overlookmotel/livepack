/* --------------------
 * livepack module
 * Code instrumentation visitor for expressions
 * ------------------*/

'use strict';

// Export
module.exports = Expression;

// Imports
const {IdentifierReadOnly, ThisExpression} = require('./identifier.js'),
	{AssigneeAssignOnly, AssigneeReadAndAssign} = require('./assignee.js'),
	{Super} = require('./super.js'),
	{ArrowFunctionExpression, FunctionExpression} = require('./function.js'),
	{ClassExpression} = require('./class.js'),
	ObjectExpression = require('./object.js'),
	MemberExpression = require('./memberExpression.js'),
	UnaryOrSpreadOrAwaitExpression = require('./unary.js'),
	{ImportOrMetaProperty} = require('./module.js'),
	{
		visitKey, visitKeyMaybe, visitKeyContainer, visitKeyContainerWithEmptyMembers
	} = require('../visit.js');

// Exports

/**
 * Visitor for expression.
 * @param {Object} node - Expression AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 * @throws {Error} - If unexpected AST node type
 */
function Expression(node, state, parent, key) {
	/* eslint-disable consistent-return */
	switch (node.type) {
		case 'Identifier': return IdentifierReadOnly(node, state, parent, key);
		case 'ThisExpression': return ThisExpression(node, state);
		case 'Super': return Super(node, state, parent, key);
		case 'ArrowFunctionExpression': return ArrowFunctionExpression(node, state, parent, key);
		case 'FunctionExpression': return FunctionExpression(node, state, parent, key);
		case 'ClassExpression': return ClassExpression(node, state, parent, key);
		case 'AssignmentExpression': return AssignmentExpression(node, state);
		case 'LogicalExpression':
		case 'BinaryExpression': return LogicalOrBinaryExpression(node, state);
		case 'ConditionalExpression': return ConditionalExpression(node, state);
		case 'UnaryExpression':
		case 'SpreadElement':
		case 'AwaitExpression': return UnaryOrSpreadOrAwaitExpression(node, state); // Keep as 2 params
		case 'YieldExpression': return YieldExpression(node, state);
		case 'UpdateExpression': return UpdateExpression(node, state);
		case 'SequenceExpression': return SequenceExpression(node, state);
		case 'MemberExpression':
		case 'OptionalMemberExpression': return MemberExpression(node, state); // Keep as 2 params
		case 'CallExpression':
		case 'OptionalCallExpression':
		case 'NewExpression': return CallExpression(node, state);
		case 'ArrayExpression': return ArrayExpression(node, state);
		case 'ObjectExpression': return ObjectExpression(node, state, parent, key);
		case 'Import':
		case 'MetaProperty': return ImportOrMetaProperty(node, state); // Keep as 2 params
		case 'TaggedTemplateExpression': return TaggedTemplateExpression(node, state);
		case 'TemplateLiteral': return TemplateLiteral(node, state, parent, key);
		case 'ParenthesizedExpression': return ParenthesizedExpression(node, state);
		case 'StringLiteral':
		case 'NumericLiteral':
		case 'BooleanLiteral':
		case 'RegExpLiteral':
		case 'BigIntLiteral':
		case 'DecimalLiteral':
		case 'NullLiteral':
		case 'V8IntrinsicIdentifier': return;
		default: throw new Error(`Unexpected expression type '${node.type}'`);
	}
	/* eslint-enable consistent-return */
}

function AssignmentExpression(node, state) {
	visitKey(node, 'left', node.operator === '=' ? AssigneeAssignOnly : AssigneeReadAndAssign, state);
	visitKey(node, 'right', Expression, state);
}

function LogicalOrBinaryExpression(node, state) {
	visitKey(node, 'left', Expression, state);
	visitKey(node, 'right', Expression, state);
}

function ConditionalExpression(node, state) {
	visitKey(node, 'test', Expression, state);
	visitKey(node, 'consequent', Expression, state);
	visitKey(node, 'alternate', Expression, state);
}

function YieldExpression(node, state) {
	visitKeyMaybe(node, 'argument', Expression, state);
}

function UpdateExpression(node, state) {
	visitKey(node, 'argument', AssigneeReadAndAssign, state);
}

function SequenceExpression(node, state) {
	visitKeyContainer(node, 'expressions', Expression, state);
}

function CallExpression(node, state) {
	visitKey(node, 'callee', Expression, state);
	visitKeyContainer(node, 'arguments', Expression, state);
}

function ArrayExpression(node, state) {
	visitKeyContainerWithEmptyMembers(node, 'elements', Expression, state);
}

function TaggedTemplateExpression(node, state) {
	visitKey(node, 'tag', Expression, state);
	visitKey(node, 'quasi', TemplateLiteral, state);
}

function TemplateLiteral(node, state) {
	visitKeyContainer(node, 'expressions', Expression, state);
	// NB No need to visit `quasis`
}

function ParenthesizedExpression(node, state) {
	visitKey(node, 'expression', Expression, state);
}
