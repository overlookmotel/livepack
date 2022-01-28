/* --------------------
 * livepack module
 * Babel plugin bindings util functions
 * ------------------*/

'use strict';

// Imports
const {assertWithLocation} = require('./utils.js'),
	{FUNCTION_PROPS, NAME_BLOCK, PARAMS_BLOCK, BODY_BLOCK} = require('./symbols.js');

// Exports

module.exports = {
	getBindingBlock,
	getVarAccessType
};

/**
 * Get block from binding.
 * Returns an object `{block, isConst, isSilentConst, isFunction}`.
 * `block` is block props object for block var is defined in.
 * `isConst` is `true` if is a const.
 * `isSilentConst` is `true` if is function expression name referred to within function
 *   (assigning to throws const violation error only in strict mode).
 * `isFunction` is `true` if var is a function name.
 *
 * @param {string} varName - Var name
 * @param {Object} binding - Babel binding object
 * @param {Object} identifierPath - Babel path for identifier (only used for throwing errors)
 * @param {Object} state - State object
 * @returns {Object} - Object of form `{block, isConst, isSilentConst, isFunction}`
 */
function getBindingBlock(varName, binding, identifierPath, state) {
	const {kind} = binding,
		blockPath = binding.scope.path;
	if (kind === 'param') {
		// Workaround Babel bug where a function contains a param and a `var` statement or function
		// declaration with same name in its body.
		// e.g. `(x) => { var x = 1; return () => x; }`
		// or `(x) => { function x() {} return () => x; }`
		// For the last `x` in both above examples, Babel returns a `param` binding.
		// If identifer is within the function body, correct this mistake.
		const paramClashIsFunction = blockPath[FUNCTION_PROPS].paramClashes[varName];
		if (paramClashIsFunction !== undefined && isWithinFunctionBody(blockPath, identifierPath)) {
			return {
				block: blockPath[BODY_BLOCK],
				isConst: false,
				isSilentConst: false,
				isFunction: paramClashIsFunction
			};
		}

		return {block: blockPath[PARAMS_BLOCK], isConst: false, isSilentConst: false, isFunction: false};
	}

	if (kind === 'let') {
		const bindingPath = binding.path;
		if (bindingPath.isClass()) {
			const fn = bindingPath[FUNCTION_PROPS];
			if (fn && fn.path) {
				// Class declaration name referenced from inside class.
				// `.path` is unset when exiting class, so as it's set here means identifier is inside class.
				return {block: bindingPath[NAME_BLOCK], isConst: true, isSilentConst: false, isFunction: true};
			}
			return {block: blockPath[BODY_BLOCK], isConst: false, isSilentConst: false, isFunction: true};
		}

		return {
			block: (blockPath.isCatchClause() && bindingPath === blockPath)
				? blockPath[PARAMS_BLOCK] // Error argument in catch clause
				: blockPath[BODY_BLOCK],
			isConst: false,
			isSilentConst: false,
			isFunction: false
		};
	}

	if (kind === 'local') {
		// Function expression or class expression name referenced within function
		const isFunctionExpr = blockPath.isFunctionExpression();
		assertWithLocation(
			isFunctionExpr || blockPath.isClassExpression(), identifierPath, state,
			`Unexpected local binding type '${blockPath.type}'`
		);

		// Workaround Babel bug where var defined in body of function expression has same name
		// as the function itself. Babel erroneously returns a `local` binding,
		// and records the var declaration as a const violation.
		// e.g. `function f() { const f = 1; return () => f; }`
		// `function f() { function f() {} return () => f; }`
		// For the last `f` in both above examples, Babel returns a `local` binding.
		// If identifer is within the function body, correct this mistake.
		if (isFunctionExpr) {
			const {functionNameClash} = blockPath[FUNCTION_PROPS];
			if (functionNameClash && isWithinFunctionBody(blockPath, identifierPath)) {
				return {
					block: blockPath[BODY_BLOCK],
					isConst: functionNameClash.isConst,
					isSilentConst: false,
					isFunction: functionNameClash.isFunction
				};
			}
		}

		// Assigning to function expression name only throws const violation error
		// if assigned to in strict mode. In sloppy mode, fails silently.
		return {
			block: blockPath[NAME_BLOCK], isConst: true, isSilentConst: isFunctionExpr, isFunction: true
		};
	}

	const block = blockPath[BODY_BLOCK];
	if (kind === 'const') return {block, isConst: true, isSilentConst: false, isFunction: false};
	if (kind === 'var') return {block, isConst: false, isSilentConst: false, isFunction: false};

	assertWithLocation(kind === 'hoisted', identifierPath, state, `Unexpected binding kind '${kind}'`);

	// Function declaration
	// NB `block` here is enclosing block, not the function itself
	return {block, isConst: false, isSilentConst: false, isFunction: true};
}

/**
 * Determine if an identifier is within the body of a function (as opposed to within function's params).
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} identifierPath - Babel path object for identifier
 * @returns {boolean} - `true` if identifier is within body of function
 */
function isWithinFunctionBody(fnPath, identifierPath) {
	const bodyPath = fnPath.get('body');
	return identifierPath.findParent(path => path === bodyPath || path === fnPath) === bodyPath;
}

/**
 * Get whether an expression reads from or assigns to a var (or both).
 * @param {Object} path - Babel path object for identifier
 * @returns {Object} - Object with properties:
 *   {boolean} .isReadFrom - `true` if var is read from
 *   {boolean} .isAssignedTo - `true` if var is assigned to
 */
function getVarAccessType(path) {
	const {parentPath} = path;
	if (parentPath.isAssignmentExpression()) {
		if (path.key === 'left') {
			// Assignment - `=`, `+=`, `&&=`
			return {isReadFrom: parentPath.node.operator !== '=', isAssignedTo: true};
		}
	} else if (parentPath.isUpdateExpression()) {
		return {isReadFrom: true, isAssignedTo: true};
	} else if (parentPath.isAssignmentPattern()) {
		if (path.key === 'left') return {isReadFrom: false, isAssignedTo: true};
	} else if (parentPath.isForXStatement()) {
		if (path.key === 'left') return {isReadFrom: false, isAssignedTo: true};
	} else if (
		parentPath.isArrayPattern()
		|| parentPath.isRestElement()
		|| (parentPath.isObjectProperty() && path.key === 'value' && parentPath.parentPath.isObjectPattern())
	) {
		return {isReadFrom: false, isAssignedTo: true};
	}

	return {isReadFrom: true, isAssignedTo: false};
}
