/* --------------------
 * livepack module
 * Code instrumentation visitor for member expressions
 * ------------------*/

'use strict';

// Export
module.exports = MemberExpression;

// Imports
const Expression = require('./expression.js'),
	{visitKey} = require('../visit.js');

// Exports

/**
 * Visitor for member expression.
 * @param {Object} node - Menber expression AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function MemberExpression(node, state) {
	visitKey(node, 'object', Expression, state);
	if (node.computed) visitKey(node, 'property', Expression, state);
}
