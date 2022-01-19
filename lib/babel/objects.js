/* --------------------
 * livepack module
 * Babel plugin objects visitors
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createBlockProps} = require('./blocks.js'),
	{replaceWith} = require('./utils.js'),
	{SUPER_BLOCK, SUPER_VAR_NODE, SUPER_VARS} = require('./symbols.js'),
	{createArrayOrPush} = require('../shared/functions.js');

// Exports

module.exports = {
	objectExpressionEnterVisitor,
	objectExpressionExitVisitor
};

/**
 * Visitor to create block for object expression.
 * May be used if object contains method including `super`.
 * @param {Object} objPath - Babel path object for object expression
 * @param {Object} state - State object
 * @returns {undefined}
 */
function objectExpressionEnterVisitor(objPath, state) {
	// Create block for `super` target, but don't enter it
	objPath[SUPER_BLOCK] = createBlockProps(undefined, false, state);

	// Init props for tracking `super` target var
	objPath[SUPER_VAR_NODE] = undefined;
	objPath[SUPER_VARS] = undefined;
}

/**
 * Visitor to assign object expression to temp var if required for `super`.
 * @param {Object} objPath - Babel path object for object expression
 * @param {Object} state - State object
 * @returns {undefined}
 */
function objectExpressionExitVisitor(objPath, state) {
	const superVarNode = objPath[SUPER_VAR_NODE];
	if (superVarNode) {
		replaceWith(objPath, t.assignmentExpression('=', superVarNode, objPath.node));

		// Create temp var at start of enclosing block (will be inserted in `blockStatementExitVisitor()`)
		createArrayOrPush(state.currentBlock.varsBlock, 'tempVarNodes', superVarNode);
	}
}
