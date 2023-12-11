/* --------------------
 * livepack module
 * Code instrumentation visitor for `super`
 * ------------------*/

'use strict';

// Export
module.exports = {
	Super,
	activateSuperBinding,
	getSuperVarNode
};

// Imports
const {
		createBindingWithoutNameCheck, getOrCreateExternalVar, activateBlock, createBlockTempVar
	} = require('../blocks.js'),
	{SUPER_CALL, SUPER_EXPRESSION} = require('../../shared/constants.js');

// Exports

/**
 * Visitor for `super`.
 * @param {Object} node - `super` AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function Super(node, state, parent, key) {
	// Exit if not in a function. Must be inside `eval()` within class or object method.
	const fn = state.currentFunction;
	if (!fn) return;

	// No need to transpile `super()` or `super` expressions in class constructor or class properties
	const fnType = fn.node.type;
	if (fnType === 'ClassExpression' || fnType === 'ClassDeclaration') return;

	// Create external var for `super`
	const superBlock = state.currentSuperBlock,
		superBinding = activateSuperBinding(superBlock, state),
		superExternalVar = getOrCreateExternalVar(fn, superBlock, 'super', superBinding);
	superExternalVar.isReadFrom = true;

	// `super` expressions in arrow functions require `this`. Create external var for `this`.
	const isSuperCall = key === 'callee' && parent.type === 'CallExpression';
	if (!isSuperCall && fnType === 'ArrowFunctionExpression') {
		const thisBlock = state.currentThisBlock;
		activateBlock(thisBlock, state);
		const thisExternalVar = getOrCreateExternalVar(
			fn, thisBlock, 'this', thisBlock.bindings.get('this')
		);
		thisExternalVar.isReadFrom = true;
	}

	// Set `superIsProto` on all functions between this one and the `super` target
	if (state.currentSuperIsProto) setSuperIsProtoOnFunctions(superBlock, fn);

	// Schedule recording usage of `super` in 2nd pass
	state.secondPass(recordAmendmentForSuper, node, superBlock, isSuperCall, fn, [...state.trail]);
}

/**
 * Activate `super` target binding.
 * Create binding for `super` target + a temp var node to have `super` target assigned to it.
 * Binding is created lazily when `super` is encountered - most methods won't use `super`.
 * @param {Object} superBlock - `super` target block object
 * @param {Object} state - State object
 * @returns {Object} - Binding for `super` target
 */
function activateSuperBinding(superBlock, state) {
	activateBlock(superBlock, state);
	let binding = superBlock.bindings.get('super');
	if (!binding) {
		// No need to add this binding to function, as `super` is always an external var.
		// `isFrozenName: true` because it shouldn't be added to internal vars if a function
		// containing the class/object which creates `super` is serialized.
		binding = createBindingWithoutNameCheck(superBlock, 'super', {
			varNode: createBlockTempVar(superBlock, state),
			isConst: true,
			isFrozenName: true
		});
	}
	return binding;
}

/**
 * Set `superIsProto` on all functions between this one and the `super` target
 * @param {Object} superBlock - `super` target block object
 * @param {Object} fn - Function object
 * @returns {undefined}
 */
function setSuperIsProtoOnFunctions(superBlock, fn) {
	const superBlockId = superBlock.id;
	while (!fn.superIsProto) {
		fn.superIsProto = true;
		fn = fn.parent;
		if (!fn || fn.id < superBlockId) break;
	}
}

/**
 * Record amendment for `super`.
 * Used in serializer to transpile `super`.
 * Done in 2nd pass so the amendment that's recorded is in correct order relative to other amendments.
 * @param {Object} node - `super` AST node (not needed but passed for debug reasons)
 * @param {Object} superBlock - `super` block object
 * @param {boolean} isSuperCall - `true` if is a `super()` call
 * @param {Object} fn - Function object
 * @param {Array<string|number>} trail - Trail
 * @returns {undefined}
 */
function recordAmendmentForSuper(node, superBlock, isSuperCall, fn, trail) {
	// Record amendment for `super`
	fn.amendments.push({
		type: isSuperCall ? SUPER_CALL : SUPER_EXPRESSION,
		blockId: superBlock.id,
		trail,
		binding: undefined // Not used, but keeps same object shape for all amendments
	});
}

/**
 * Get temp var node for `super` target.
 * @param {Object} superBlock - `super` target block object
 * @returns {Object|undefined} - Temp var identifier AST node, or `undefined` if binding not used
 */
function getSuperVarNode(superBlock) {
	return superBlock.bindings.get('super')?.varNode;
}
