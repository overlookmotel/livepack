/* --------------------
 * livepack module
 * Babel plugin handling `this` + `arguments`
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {getVarAccessType} = require('./bindings.js'),
	recordVarUse = require('./vars.js'),
	{PARAMS_BLOCK} = require('./symbols.js'),
	{createArrayOrPush} = require('../shared/functions.js');

// Exports

module.exports = {
	thisExpressionVisitor,
	processArguments,
	getArgNames
};

/**
 * Visitor to track use of `this` which refers to an upper scope.
 * Record the var same as for identifiers (only applies inside arrow functions).
 * Record position of `this` within class constructor where class extends a super class
 * (or in arrow functions within such a class constructor).
 * @param {Object} state - State object
 * @returns {undefined}
 */
function thisExpressionVisitor(state) {
	// Assigning to `this` is always a syntax error (not a runtime error).
	// So no need to check if it's assigned to here, as this code would never have run.
	processThisOrArguments('this', true, false, state);

	// If `this` is within class constructor which extends a super class, record position of `this`
	const {currentFullFunction} = state;
	if (
		currentFullFunction && currentFullFunction.isClassConstructorWithSuperClass
		&& state.currentFunction === currentFullFunction
	) {
		createArrayOrPush(currentFullFunction.internalVars, 'this', [...state.trail]);
	}
}

/**
 * Visitor to track use of `arguments` which refers to an upper scope.
 * Record the var same as for identifiers, and also record an array of
 * argument names in call to `livepack_tracker()`.
 * (only applies inside arrow functions)
 * @param {Object} identifierPath - Babel path object for `arguments` identifer
 * @param {Object} state - State object
 * @returns {undefined}
 */
function processArguments(identifierPath, state) {
	// Determine if is assigned to.
	// Writing to `arguments` is illegal in strict mode, but not in sloppy mode.
	// NB No need to check if is a const violation, because these are syntax errors, not runtime errors
	// so impossible to encounter `arguments = 1` unless it's a valid assignment.
	const {isReadFrom, isAssignedTo} = getVarAccessType(identifierPath);

	const res = processThisOrArguments('arguments', isReadFrom, isAssignedTo, state);
	if (!res) return;

	const {fns, parentVar} = res;
	if (fns.length === 0) return;

	// Add arguments names to function props objects
	let argNames;
	if (parentVar) {
		argNames = parentVar.argNames;
		if (!argNames) return;
	} else {
		argNames = getArgNames(state.currentFullFunction);
	}

	for (const fn of fns) {
		fn.argNames = argNames;
	}
}

/**
 * Find what function a use of `this`/`arguments` derives from.
 * (only applies to arrow functions, where `this` in the arrow function
 * refers to `this` in enclosing function)
 * @param {string} name - Var name (i.e 'this' or 'arguments')
 * @param {boolean} isReadFrom - `true` if this/arguments is read from
 * @param {boolean} isAssignedTo - `true` if this/arguments is assigned to
 * @param {Object} state - State object
 * @returns {Object|undefined} - Object with props:
 *   {Array<Object>} .fns - Array of function props objects
 *   {Object} [.parentVar] - Parent var object (only if references `this`/`arguments` from within eval)
 */
function processThisOrArguments(name, isReadFrom, isAssignedTo, state) {
	// Ignore if outside full function
	const {currentFunction, currentFullFunction} = state;
	if (!currentFullFunction) {
		// If this is code generated in `eval` and `this` / `arguments` is from
		// scope outside `eval`, record var usage
		if (currentFunction) {
			const parentVar = state.parentVars[name];
			if (parentVar) {
				const block = {
					id: parentVar.blockId,
					name: parentVar.blockName,
					varsBlock: {
						scopeIdVarNode: t.numericLiteral(parentVar.scopeId)
					}
				};
				const fns = recordVarUse(name, block, isReadFrom, isAssignedTo, false, true, state);

				// Return function props objects + parent var (used in `processArguments()`)
				return {fns, parentVar};
			}
		}

		return; // eslint-disable-line consistent-return
	}

	// Skip if enclosing function is not arrow function (i.e. `this`/`arguments` is local)
	if (currentFunction === currentFullFunction) return; // eslint-disable-line consistent-return

	// Record variable use
	const block = currentFullFunction.path[PARAMS_BLOCK];
	const fns = recordVarUse(name, block, isReadFrom, isAssignedTo, false, true, state);

	// Return function props objects (used in `processArguments()`)
	return {fns, parentVar: undefined};
}

/**
 * Get arg names for function.
 * Arg names is list of arguments which are linked to the parameter vars.
 * When all params are simple vars (i.e. `function(a, b, c) {}`), values of `a` and `arguments[0]`
 * are linked. Setting `a` results in `arguments[0]` also being set to same value + vice versa.
 * If params use default values, destructuring or spreading, they are not linked.
 * Linking only occurs in sloppy mode.
 * @param {Object} fn - Function props object
 * @returns {Array<string>} - Array of arg names
 */
function getArgNames(fn) {
	if (fn.isStrict) return [];

	const argNames = [];
	for (const paramNode of fn.path.node.params) {
		if (!t.isIdentifier(paramNode)) {
			argNames.length = 0;
			break;
		}
		argNames.push(paramNode.name);
	}
	return argNames;
}
