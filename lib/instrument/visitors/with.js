/* --------------------
 * livepack module
 * Code instrumentation visitor for `with` statements
 * ------------------*/

'use strict';

// Export
module.exports = {
	WithStatement,
	activateWithBinding
};

// Modules
const t = require('@babel/types');

// Imports
const Expression = require('./expression.js'),
	Statement = require('./statement.js'),
	{
		createAndEnterBlock, createBindingWithoutNameCheck, activateBlock, createBlockTempVar
	} = require('../blocks.js'),
	{createTrackerVarNode, createTempVarNode} = require('../internalVars.js'),
	{visitKey} = require('../visit.js');

// Exports

/**
 * Visitor for `with () {}` statement.
 * @param {Object} node - `with ()` statement AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function WithStatement(node, state) {
	// Visit object i.e. expression inside `with (...)`
	visitKey(node, 'object', Expression, state);

	// Create block for `with` object.
	// `isFrozenName: true` because it shouldn't have an an internal var created for it.
	const parentBlock = state.currentBlock,
		parentWithBlock = state.currentWithBlock;
	const block = createAndEnterBlock('with', false, state);
	const binding = createBindingWithoutNameCheck(
		block, 'with', {isConst: true, isFrozenName: true}, state
	);
	state.currentWithBlock = block;

	// Visit body
	visitKey(node, 'body', Statement, state);

	// Exit block
	state.currentBlock = parentBlock;
	state.currentWithBlock = parentWithBlock;

	// Queue action to wrap `with` object
	state.secondPass(instrumentWithObj, node, binding, state);
}

/**
 * Instrument `with ()` statement.
 * See explanation in `lib/init/with.js` for what this is doing.
 * @param {Object} node - `with ()` statement AST node
 * @param {Object} binding - Binding object for the `with ()` object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentWithObj(node, binding, state) {
	// `with (o) foo;`
	// ->
	// ```
	// with (
	//   livepack_tracker.wrapWith(
	//     livepack_temp2 = o,
	//     (eval, livepack_temp_3) => eval(livepack_temp_3),
	//     () => eval
	//   )
	// ) with ( {}.__defineSetter__() ) foo;
	// ```
	const tempVarNode = createTempVarNode(state),
		evalNode = t.identifier('eval');
	node.object = t.callExpression(
		// `livepack_tracker.wrapWith`
		t.memberExpression(createTrackerVarNode(state), t.identifier('wrapWith')),
		[
			// `livepack_temp2 = o` or `o`
			binding.varNode
				? t.assignmentExpression('=', binding.varNode, node.object)
				: node.object,
			// `(eval, livepack_temp_3) => eval(livepack_temp_3)`
			t.arrowFunctionExpression(
				[evalNode, tempVarNode],
				t.callExpression(evalNode, [tempVarNode])
			),
			// `() => eval`
			t.arrowFunctionExpression([], evalNode)
		]
	);

	// `foo;` -> `with ( {}.__defineSetter__() ) foo;`
	node.body = t.withStatement(
		t.callExpression(t.memberExpression(t.objectExpression([]), t.identifier('__defineSetter__')), []),
		node.body
	);
}

/**
 * Activate `with ()` object binding.
 * Create a temp var node to have `with` object assigned to it.
 * @param {Object} block - `with` object block object
 * @param {Object} state - State object
 * @returns {Object} - Binding
 */
function activateWithBinding(block, state) {
	activateBlock(block, state);
	const binding = block.bindings.get('with');
	if (!binding.varNode) binding.varNode = createBlockTempVar(block, state);
	return binding;
}
