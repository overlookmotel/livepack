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
	ThisExpression
};

// Imports
const visitEval = require('./eval.js'),
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

	// NB Whether in strict mode is not relevant, so just pass `true` for `isStrict` argument
	recordBoundVarUse(binding, block, 'this', fn, [...state.trail], true, false, true, state);
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
		resolveIdentifierInSecondPass(
			node, state.currentBlock, varName, fn, isReadFrom, isAssignedTo, state
		);
	} else {
		// Not inside a function, so identifier won't be resolved and therefore misses out
		// on the check in `resolveIdentifier()` if it's a global. So check it here.
		checkInternalVarNameClash(varName, state);
	}
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
		if (binding) break;
		block = block.parent;
	} while (block);

	// Record if global var
	if (!binding) {
		// Vars which are local bindings have var name checked for internal var name clashes
		// when the binding is created. But here there's no binding, so need to do the check.
		checkInternalVarNameClash(varName, state);
		fn.globalVarNames.add(varName);
		return;
	}

	// Handle internal or external var
	recordBoundVarUse(binding, block, varName, fn, trail, isReadFrom, isAssignedTo, isStrict, state);
}

/**
 * Record a bound var's usage within a function.
 * @param {Object} binding - Binding object
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
function recordBoundVarUse(
	binding, block, varName, fn, trail, isReadFrom, isAssignedTo, isStrict, state
) {
	// Record if internal var
	const blockId = block.id;
	if (fn.id <= blockId) {
		if (!binding.isFunction && !binding.argNames) createArrayOrPush(fn.internalVars, varName, trail);
		return;
	}

	// External var
	if (isAssignedTo && binding.isConst) {
		// Record const violation
		fn.amendments.push({
			type: binding.isSilentConst && !isStrict
				? CONST_VIOLATION_FUNCTION_SILENT
				: binding.isFunction
					? CONST_VIOLATION_FUNCTION_THROWING
					: CONST_VIOLATION_CONST,
			blockId,
			trail
		});

		if (!isReadFrom) return;
		isAssignedTo = false;
	}

	activateBlock(block, state);
	activateBinding(binding, varName);
	const externalVar = getOrCreateExternalVar(fn.externalVars, block, varName, binding);
	if (isReadFrom) externalVar.isReadFrom = true;
	if (isAssignedTo) externalVar.isAssignedTo = true;
	externalVar.trails.push(trail);
}