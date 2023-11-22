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
const visitEval = require('./eval.js'),
	{getOrCreateExternalVar, activateBlock, activateBinding} = require('../blocks.js'),
	{checkInternalVarNameClash} = require('../internalVars.js'),
	{
		CONST_VIOLATION_NEEDS_VAR, CONST_VIOLATION_NEEDS_NO_VAR, CONST_VIOLATION_SILENT
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
	const varName = node.name;
	visitIdentifier(node, varName, true, false, state);

	// Handle `eval`
	if (varName === 'eval') visitEval(node, parent, key, state);
}

/**
 * Visitor for identifier where only assigned to e.g. `x = 1`.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function IdentifierAssignOnly(node, state) {
	visitIdentifier(node, node.name, false, true, state);
}

/**
 * Visitor for identifier where both read from and assigned to e.g. `x += 2`.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function IdentifierReadAndAssign(node, state) {
	visitIdentifier(node, node.name, true, true, state);
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
	// of class with super class (where `this` will be substituted when `super()` is transpiled).
	if (block.id < fn.id) {
		recordExternalVar(binding, block, 'this', fn, [...state.trail], true, false, state);
	} else if (fn.hasSuperClass) {
		binding.trails.push([...state.trail]);
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
	// NB: No need to check if binding exists, because if it doesn't,
	// parser will have already rejected the code as syntax error.
	const block = state.currentThisBlock;
	if (block.id < fn.id) {
		recordExternalVar(
			block.bindings['new.target'], block, 'new.target', fn, [...state.trail], true, false, state
		);
	}
}

/**
 * Visit identifier.
 * If identifier is inside a function, schedule resolving the binding var refers to
 * and recording it's usage in parent function in 2nd pass.
 * @param {Object} node - Identifier AST node
 * @param {string} varName - Var name
 * @param {boolean} isReadFrom - `true` if variable is read from e.g. `x + 1`, `x++`
 * @param {boolean} isAssignedTo - `true` if variable is assigned to e.g. `x = 1`, `x++`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitIdentifier(node, varName, isReadFrom, isAssignedTo, state) {
	const fn = state.currentFunction;
	if (fn) {
		// Resolve the binding var refers to in 2nd pass
		state.secondPass(
			resolveIdentifier,
			node, state.currentBlock, varName, fn, [...state.trail],
			isReadFrom, isAssignedTo, state.isStrict, state
		);
	} else {
		// Not inside a function, so identifier won't be resolved and therefore misses out
		// on the check in `resolveIdentifier()` if it's a global. So check it here.
		checkInternalVarNameClash(varName, state);
	}
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
		// Vars which are local bindings have var name checked for internal var name clashes
		// when the binding is created. But here there's no binding, so need to do the check.
		checkInternalVarNameClash(varName, state);
		fn.globalVarNames.add(varName);
		return;
	}

	// Record if internal var
	if (block.id >= fn.id) {
		if (!binding.isFrozenName && !binding.argNames) binding.trails.push(trail);
		return;
	}

	// Record external var
	if (isAssignedTo && binding.isConst) {
		// Record const violation.
		// `CONST_VIOLATION_NEEDS_VAR` violation type is for if this const violation is output
		// in a parent function where the const binding is internal to the function,
		// it will need to be added to `internalVars`.
		// This is not the case if var is being read from, as an external var is created below,
		// which will be converted to an internal var.
		// It's also not needed if binding is frozen, as they're not treated as internal vars.
		fn.amendments.push({
			type: binding.isSilentConst && !isStrict
				? CONST_VIOLATION_SILENT
				: isReadFrom || binding.isFrozenName
					? CONST_VIOLATION_NEEDS_NO_VAR
					: CONST_VIOLATION_NEEDS_VAR,
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
	activateBinding(binding, varName);
	const externalVar = getOrCreateExternalVar(fn.externalVars, block, varName, binding);
	if (isReadFrom) externalVar.isReadFrom = true;
	if (isAssignedTo) externalVar.isAssignedTo = true;
	externalVar.trails.push(trail);
}
