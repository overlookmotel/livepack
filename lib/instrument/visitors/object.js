/* --------------------
 * livepack module
 * Code instrumentation visitor for object expressions
 * ------------------*/

'use strict';

// Export
module.exports = ObjectExpression;

// Modules
const t = require('@babel/types'),
	assert = require('simple-invariant');

// Imports
const Expression = require('./expression.js'),
	{withStrictModeState} = require('./function.js'),
	{visitMethod, getMethodName} = require('./method.js'),
	SpreadElement = require('./unary.js'),
	{getSuperVarNode} = require('./super.js'),
	{createAndEnterBlock} = require('../blocks.js'),
	{visitKey, visitContainer} = require('../visit.js');

// Exports

/**
 * Visitor for object expression.
 * @param {Object} node - Object expression AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function ObjectExpression(node, state, parent, key) {
	visitKey(
		node, 'properties',
		memberNodes => visitObjectMembers(node, memberNodes, parent, key, state),
		state
	);
}

/**
 * Visit object expression members.
 * Object properties and computed keys are visited first, then methods.
 * Creating block for `super` target etc is skipped if object has no methods (common case).
 * @param {Object} objectNode - Object expression AST node
 * @param {Array<Object>} memberNodes - Object expression member AST nodes
 * @param {Object|Array} parent - Parent of object expression AST node/container
 * @param {string|number} key - Object expression node's key on parent AST node/container
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitObjectMembers(objectNode, memberNodes, parent, key, state) {
	// Visit object properties, spread and computed property keys. Compile list of methods (if any).
	const methodIndexes = [];
	visitContainer(
		memberNodes,
		(memberNode, index) => visitObjectMember(memberNode, index, methodIndexes, state),
		state
	);

	// Visit methods
	if (methodIndexes.length === 0) return;

	// Create and enter `super` block
	const parentSuperBlock = state.currentSuperBlock,
		parentSuperIsProto = state.currentSuperIsProto;
	const superBlock = createAndEnterBlock(undefined, false, state);
	// NB: Binding for `super` target is created lazily when a use of `super` is encountered
	state.currentSuperBlock = superBlock;
	state.currentSuperIsProto = false;

	const computedMethodKeys = [];
	for (const index of methodIndexes) {
		visitKey(
			memberNodes, index,
			methodNode => visitObjectMethod(methodNode, memberNodes, index, computedMethodKeys, state),
			state
		);
	}

	// Exit `super` block
	state.currentBlock = superBlock.parent;
	state.currentSuperBlock = parentSuperBlock;
	state.currentSuperIsProto = parentSuperIsProto;

	// Visit computed method keys.
	// Skip iterating array if no methods have computed keys - fast path for common case.
	// Computed method keys must be visited after the methods, in case a method key contains a function.
	// Otherwise, when adding child functions back into AST when serializing function containing this
	// object, it attempts to add the function in the method key back in before the method itself,
	// which causes an error as the method key is part of the method's AST.
	if (computedMethodKeys.length !== 0) {
		const {trail} = state;
		for (const {methodNode, index} of computedMethodKeys) {
			trail.push(index, 'key');
			Expression(methodNode.key, state, methodNode, 'key');
			trail.length -= 2;
		}
	}

	// If `super` used in a method, queue function to add temp var for object as `super` target
	const superVarNode = getSuperVarNode(superBlock);
	if (superVarNode) state.secondPass(wrapWithSuperTargetVar, objectNode, parent, key, superVarNode);
}

/**
 * Visit object expression member.
 * @param {Object} memberNode - Object expression member AST node
 * @param {number} index - Index of member in members array
 * @param {Array} methodIndexes - Array of method indexes (to be added to)
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitObjectMember(memberNode, index, methodIndexes, state) {
	const {type} = memberNode;
	if (type === 'ObjectProperty') {
		ObjectProperty(memberNode, state);
	} else if (type === 'SpreadElement') {
		SpreadElement(memberNode, state);
	} else {
		assert(type === 'ObjectMethod', `Unexpected object expression member type '${type}'`);

		methodIndexes.push(index);
	}
}

/**
 * Visitor for object property.
 * @param {Object} node - Object property AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ObjectProperty(node, state) {
	if (node.computed) visitKey(node, 'key', Expression, state);
	visitKey(node, 'value', Expression, state);
}

/**
 * Visitor for object method.
 * @param {Object} node - Object method AST node
 * @param {Array} memberNodes - Object expression member AST nodes
 * @param {number} index - Index of method in object members array
 * @param {Array} computedMethodKeys - Array of computed method keys (to be added to)
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitObjectMethod(node, memberNodes, index, computedMethodKeys, state) {
	const keyIsComputed = node.computed;
	if (keyIsComputed) computedMethodKeys.push({methodNode: node, index});

	const fnName = keyIsComputed ? undefined : getMethodName(node);
	withStrictModeState(node, true, state, (isStrict, isEnteringStrict) => {
		visitMethod(node, memberNodes, index, fnName, isStrict, isEnteringStrict, keyIsComputed, state);
	});
}

/**
 * Wrap object expression to capture value of class in temp var,
 * which can be used in tracker functions to pass `super` target to serializer.
 * @param {Object} objectNode - Object expression AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} superVarNode - Temp var node for `super` target
 * @returns {undefined}
 */
function wrapWithSuperTargetVar(objectNode, parent, key, superVarNode) {
	parent[key] = t.assignmentExpression('=', superVarNode, objectNode);
}
