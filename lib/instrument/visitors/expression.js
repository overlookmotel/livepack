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
	Noop = require('./noop.js'),
	{
		visitKey, visitKeyMaybe, visitKeyContainer, visitKeyContainerWithEmptyMembers, visitWith
	} = require('../visit.js');

// Exports

/**
 * Visitor for expression.
 * @param {Object} node - Expression AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function Expression(node, state, parent, key) {
	// eslint-disable-next-line no-use-before-define
	visitWith(node, expressionVisitors, 'expression', state, parent, key);
}

const expressionVisitors = {
	Identifier: IdentifierReadOnly,
	ThisExpression,
	Super,
	ArrowFunctionExpression,
	FunctionExpression,
	ClassExpression,
	AssignmentExpression,
	LogicalExpression: LogicalOrBinaryExpression,
	BinaryExpression: LogicalOrBinaryExpression,
	ConditionalExpression,
	UnaryExpression: UnaryOrSpreadOrAwaitExpression,
	SpreadElement: UnaryOrSpreadOrAwaitExpression,
	AwaitExpression: UnaryOrSpreadOrAwaitExpression,
	YieldExpression,
	UpdateExpression,
	SequenceExpression,
	MemberExpression,
	OptionalMemberExpression: MemberExpression,
	CallExpression,
	OptionalCallExpression: CallExpression,
	NewExpression: CallExpression,
	ArrayExpression,
	ObjectExpression,
	Import: ImportOrMetaProperty,
	MetaProperty: ImportOrMetaProperty,
	StringLiteral: Noop,
	NumericLiteral: Noop,
	BooleanLiteral: Noop,
	RegExpLiteral: Noop,
	BigIntLiteral: Noop,
	DecimalLiteral: Noop,
	NullLiteral: Noop,
	TaggedTemplateExpression,
	TemplateLiteral,
	ParenthesizedExpression,
	V8IntrinsicIdentifier: Noop
};

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
