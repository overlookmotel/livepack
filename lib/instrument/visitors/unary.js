/* --------------------
 * livepack module
 * Code instrumentation visitor for unary expressions
 * ------------------*/

'use strict';

// Export
module.exports = UnaryExpressionOrStatement;

// Imports
const Expression = require('./expression.js'),
	{visitKey} = require('../visit.js');

// Exports

/**
 * Visitor for unary expression.
 * Used for `UnaryExpression`, `SpreadElement`, `AwaitExpression`, `ThrowStatement`.
 * @param {Object} node - Unary expression AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function UnaryExpressionOrStatement(node, state) {
	visitKey(node, 'argument', Expression, state);
}
