/* --------------------
 * livepack module
 * Code instrumentation visitors for identifiers
 * ------------------*/

'use strict';

// Export
module.exports = {
	IdentifierReadOnly,
	IdentifierAssignOnly,
	IdentifierReadAndAssign,
	ThisExpression,
	NewTargetExpression
};

// Imports
const {visitEvalIdentifier} = require('./eval.js'),
	{getOrCreateExternalVar, activateBlock, activateBinding} = require('../blocks.js'),
	{checkInternalVarNameClash} = require('../internalVars.js'),
	{createArrayOrPush} = require('../../shared/functions.js'),
	{
		CONST_VIOLATION_CONST, CONST_VIOLATION_FUNCTION_THROWING, CONST_VIOLATION_FUNCTION_SILENT
	} = require('../../shared/constants.js');

// Exports

/**
 * Visitor for identifier where only read from e.g. `x + 1`.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function IdentifierReadOnly(node, state, parent, key) {
	visitIdentifier(node, true, false, parent, key, state);
}

/**
 * Visitor for identifier where only assigned to e.g. `x = 1`.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function IdentifierAssignOnly(node, state, parent, key) {
	visitIdentifier(node, false, true, parent, key, state);
}

/**
 * Visitor for identifier where both read from and assigned to e.g. `x += 2`.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function IdentifierReadAndAssign(node, state, parent, key) {
	visitIdentifier(node, true, true, parent, key, state);
}

/**
 * Visitor for `this` expression.
 * Record use immediately. No need to wait until 2nd pass as no ambiguity as to where `this` is bound.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ThisExpression(node, state) {
	const fn = state.currentFunction;
	if (!fn) return;

	// Ignore if `this` is global
	const block = state.currentThisBlock,
		binding = block.bindings.this;
	if (!binding) return;

	// Record as internal/external var use in function.
	// Ignore if internal to function, unless in class constructor or prototype class property
	// of class with super class.
	if (block.id < fn.id) {
		state.secondPass(
			recordExternalThisOrNewTarget, node, 'this', binding, block, fn, [...state.trail], state
		);
	} else if (fn.hasSuperClass) {
		createArrayOrPush(fn.internalVars, 'this', [...state.trail]);
	}
}

/**
 * Visitor for `new.target` expression.
 * Record use immediately. No need to wait until 2nd pass as no ambiguity as to where it's bound.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function NewTargetExpression(node, state) {
	// `new.target` can appear outside functions in CommonJS code.
	const fn = state.currentFunction;
	if (!fn) return;

	// Record as external var use in function.
	// NB No need to check if binding exists, because if it doesn't,
	// parser will have already rejected the code as syntax error.
	const block = state.currentThisBlock;
	if (block.id < fn.id) {
		state.secondPass(
			recordExternalThisOrNewTarget,
			node, 'new.target', block.bindings['new.target'], block, fn, [...state.trail], state
		);
	}
}

/**
 * Record use of `this` or `new.target` on function it's used within.
 * @param {Object} node - `this` / `new.target` AST node (not needed but passed for debug reasons)
 * @param {string} varName - 'this' or 'new.target'
 * @param {Object} binding - Binding object
 * @param {Object} block - Block object
 * @param {Object} fn - Function object
 * @param {Array<string|number>} trail - Trail
 * @param {Object} state - State object
 * @returns {undefined}
 */
function recordExternalThisOrNewTarget(node, varName, binding, block, fn, trail, state) {
	recordExternalVar(binding, block, varName, fn, trail, true, false, state);
}

/**
 * Visit identifier.
 * If identifier is inside a function, schedule resolving the binding var refers to
 * and recording it's usage in parent function in 2nd pass.
 * @param {Object} node - Identifier AST node
 * @param {boolean} isReadFrom - `true` if variable is read from e.g. `x + 1`, `x++`
 * @param {boolean} isAssignedTo - `true` if variable is assigned to e.g. `x = 1`, `x++`
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitIdentifier(node, isReadFrom, isAssignedTo, parent, key, state) {
	const varName = node.name;
	checkInternalVarNameClash(varName, state);

	const fn = state.currentFunction;
	if (fn) {
		resolveIdentifierInSecondPass(
			node, state.currentBlock, varName, fn, isReadFrom, isAssignedTo, state
		);
	}

	// Handle `eval`
	if (varName === 'eval') visitEvalIdentifier(node, parent, key, state);
}

/**
 * Schedule resolving the binding var refers to and recording it's usage in parent function in 2nd pass.
 * @param {Object} node - Identifier or `this` expression AST node
 * @param {Object} block - Block object
 * @param {string} varName - Var name
 * @param {Object} fn - Function object for function identifier is within
 * @param {boolean} isReadFrom - `true` if variable is read from e.g. `x + 1`, `x++`
 * @param {boolean} isAssignedTo - `true` if variable is assigned to e.g. `x = 1`, `x++`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function resolveIdentifierInSecondPass(node, block, varName, fn, isReadFrom, isAssignedTo, state) {
	state.secondPass(
		resolveIdentifier,
		node, block, varName, fn, [...state.trail], isReadFrom, isAssignedTo, state.isStrict, state
	);
}

/**
 * Resolve binding an identifier refers to and record its usage on function it's used within.
 * @param {Object} node - Identifier AST node (not needed but passed for debug reasons)
 * @param {Object} block - Block object
 * @param {string} varName - Variable name
 * @param {Object} fn - Function object
 * @param {Array<string|number>} trail - Trail
 * @param {boolean} isReadFrom - `true` if variable is read from
 * @param {boolean} isAssignedTo - `true` if variable is assigned to
 * @param {boolean} isStrict - `true` if variable used in strict mode
 * @param {Object} state - State object
 * @returns {undefined}
 */
function resolveIdentifier(node, block, varName, fn, trail, isReadFrom, isAssignedTo, isStrict, state) {
	// Find binding
	let binding;
	do {
		binding = block.bindings[varName];
	} while (!binding && (block = block.parent)); // eslint-disable-line no-cond-assign

	// Record if global var
	if (!binding) {
		fn.globalVarNames.add(varName);
		return;
	}

	// Record if internal var
	if (block.id >= fn.id) {
		if (!binding.isFunction && !binding.argNames) createArrayOrPush(fn.internalVars, varName, trail);
		return;
	}

	// Record external var
	if (isAssignedTo && binding.isConst) {
		// Record const violation
		fn.amendments.push({
			type: binding.isSilentConst && !isStrict
				? CONST_VIOLATION_FUNCTION_SILENT
				: binding.isFunction
					? CONST_VIOLATION_FUNCTION_THROWING
					: CONST_VIOLATION_CONST,
			blockId: block.id,
			trail
		});

		if (!isReadFrom) return;
		isAssignedTo = false;
	}

	recordExternalVar(binding, block, varName, fn, trail, isReadFrom, isAssignedTo, state);
}

/**
 * Record an external var's usage within a function.
 * @param {Object} binding - Binding object
 * @param {Object} block - Block object
 * @param {string} varName - Variable name
 * @param {Object} fn - Function object
 * @param {Array<string|number>} trail - Trail
 * @param {boolean} isReadFrom - `true` if variable is read from
 * @param {boolean} isAssignedTo - `true` if variable is assigned to
 * @param {Object} state - State object
 * @returns {undefined}
 */
function recordExternalVar(binding, block, varName, fn, trail, isReadFrom, isAssignedTo, state) {
	activateBlock(block, state);
	activateBinding(block, binding, varName, state);
	const externalVar = getOrCreateExternalVar(fn.externalVars, block, varName, binding);
	if (isReadFrom) externalVar.isReadFrom = true;
	if (isAssignedTo) externalVar.isAssignedTo = true;
	externalVar.trails.push(trail);
}
