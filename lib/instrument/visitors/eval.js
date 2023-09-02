/* --------------------
 * livepack module
 * Code instrumentation visitors for `eval`
 * ------------------*/

'use strict';

// Export
module.exports = visitEval;

// Modules
const t = require('@babel/types');

// Imports
const {
		activateSuperBinding, getParentFullFunction, createInternalVarForThis, createExternalVarForThis,
		setSuperIsProtoOnFunctions
	} = require('./super.js'),
	{getOrCreateExternalVar, activateBlock, activateBinding} = require('../blocks.js'),
	{createTempVarNode} = require('../internalVars.js'),
	{flagAllAncestorFunctions, copyLocAndComments} = require('../utils.js'),
	{isReservedWord, getProp} = require('../../shared/functions.js');

// Exports

/**
 * Visit `eval` identifier.
 * @param {Object} node - `eval` identifier AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitEval(node, parent, key, state) {
	// Flag that `eval()` used in this function and all functions above
	let isEvalCall = key === 'callee' && parent.type === 'CallExpression';
	const fn = state.currentFunction;
	let canUseSuper = false;
	if (isEvalCall && parent.arguments.length > 0) {
		// If called with spread element as first arg (`eval(...x)`), acts as indirect `eval`
		if (parent.arguments[0].type === 'SpreadElement') {
			isEvalCall = false;
		} else {
			flagAllAncestorFunctions(fn, 'containsEval');
			canUseSuper = activateSuperIfIsUsable(fn, state);
		}
	}

	// Flag that `eval` is used in file
	state.fileContainsFunctionsOrEval = true;

	// Queue instrumentation on 2nd pass
	state.secondPass(
		instrumentEval, node, isEvalCall, parent, key, state.currentBlock, fn,
		state.isStrict, canUseSuper, state
	);
}

/**
 * Instrument `eval` - either direct `eval()` or e.g. `x = eval;` / `(0, eval)('...')`.
 * @param {Object} node - `eval` identifier AST node
 * @param {boolean} isEvalCall - `true` if is eval call
 * @param {Object|Array<Object>} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} block - Block object for block `eval` is in
 * @param {Object} [fn] - Function object for function `eval` is in (`undefined` if not in a function)
 * @param {boolean} isStrict - `true` if is strict mode
 * @param {boolean} canUseSuper - `true` if `super()` can be used in `eval()`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentEval(node, isEvalCall, parent, key, block, fn, isStrict, canUseSuper, state) {
	// Check `eval` is global
	if (!isGlobalEval(block)) return;

	// Handle either `eval()` call or `eval` identifier
	if (isEvalCall) {
		instrumentEvalCall(parent, block, fn, isStrict, canUseSuper, state);
	} else {
		instrumentEvalIdentifier(node, parent, key, state);
	}
}

/**
 * Instrument `eval()` call.
 * Convert `eval()` to `livepack_tracker.evalDirect()`.
 * Capture all vars which can be accessed by `eval()` and pass details to `evalDirect()`.
 * `evalDirect()` will reconstruct the scopes and instrument the `eval()`-ed code.
 * If `eval()` is within a function, flag all vars which `eval()` can access as used by the function.
 *
 * @param {Object} callNode - Call expression AST node
 * @param {Object} block - Block object for block `eval` is in
 * @param {Object} [fn] - Function object for function `eval` is in (`undefined` if not in a function)
 * @param {boolean} isStrict - `true` if is strict mode
 * @param {boolean} canUseSuper - `true` if `super()` can be used in `eval()`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentEvalCall(callNode, block, fn, isStrict, canUseSuper, state) {
	// If no arguments, leave as is
	const argNodes = callNode.arguments;
	if (argNodes.length === 0) return;

	// Capture all vars in scopes above
	const scopeNodes = [],
		functionId = fn ? fn.id : undefined,
		varNamesUsed = new Set();
	let blockIsExternalToFunction = false,
		externalVars;
	do {
		if (!blockIsExternalToFunction && fn && block.id < functionId) {
			blockIsExternalToFunction = true;
			externalVars = fn.externalVars;
		}

		const varDefsNodes = [];
		for (const [varName, binding] of Object.entries(block.bindings)) {
			if (varNamesUsed.has(varName)) continue;
			if (isStrict && varName !== 'this' && isReservedWord(varName)) continue;

			// Ignore `require` as it would render the function containing `eval()` un-serializable.
			// Also ignore CommonJS wrapper function's `arguments` as that contains `require` too.
			if ((varName === 'require' || varName === 'arguments') && block === state.fileBlock) continue;

			// Ignore `super` if it's not accessible
			if (varName === 'super' && !canUseSuper) continue;

			varNamesUsed.add(varName);

			// Create array for var `[varName, isConst, isSilentConst, argNames]`.
			// NB: Assignment to var called `arguments` or `eval` is illegal in strict mode.
			// This is relevant as it affects whether var is flagged as mutable or not.
			const isConst = binding.isConst || (isStrict && (varName === 'arguments' || varName === 'eval'));
			const varDefNodes = [t.stringLiteral(varName)];
			if (isConst) varDefNodes.push(t.numericLiteral(1));
			if (binding.isSilentConst) varDefNodes.push(t.numericLiteral(1));
			if (binding.argNames) {
				while (varDefNodes.length !== 3) varDefNodes.push(null);
				varDefNodes.push(t.arrayExpression(binding.argNames.map(argName => t.stringLiteral(argName))));
			}
			varDefsNodes.push(t.arrayExpression(varDefNodes));

			// If var is external to function, record function as using this var.
			// Ignore `new.target` as it's not possible to recreate.
			if (blockIsExternalToFunction && varName !== 'new.target') {
				activateBinding(binding, varName);
				const externalVar = getOrCreateExternalVar(externalVars, block, varName, binding);
				externalVar.isReadFrom = true;
				if (!isConst) externalVar.isAssignedTo = true;
			}
		}

		// If some vars from block used, add to scopes definitions
		if (varDefsNodes.length !== 0) {
			activateBlock(block, state);

			scopeNodes.push(t.arrayExpression([
				t.numericLiteral(block.id),
				block.name ? t.stringLiteral(block.name) : null,
				block.varsBlock.scopeIdVarNode,
				...varDefsNodes
			]));
		}
	} while (block = block.parent); // eslint-disable-line no-cond-assign

	// Replace `eval(x)` with
	// `livepack_tracker.evalDirect(
	//   x,
	//   eval,
	//   livepack_temp_1 => eval(livepack_temp_1),
	//   livepack_temp_1 => eval(...livepack_temp_1),
	//   [...], // Scope vars
	//   true // `isStrict` flag
	// )`
	callNode.callee = copyLocAndComments(
		t.memberExpression(state.trackerVarNode, t.identifier('evalDirect')),
		callNode.callee
	);

	const tempVarNode = createTempVarNode(state);
	argNodes.push(
		t.identifier('eval'),
		t.arrowFunctionExpression([tempVarNode], t.callExpression(t.identifier('eval'), [tempVarNode])),
		t.arrowFunctionExpression(
			[tempVarNode], t.callExpression(t.identifier('eval'), [t.spreadElement(tempVarNode)])
		),
		t.arrayExpression(scopeNodes.reverse()),
		t.booleanLiteral(isStrict)
	);
}

/**
 * Instrument `eval` not used standalone (not as an `eval()` call).
 * Replace `eval` with `livepack_tracker.evalIndirect`.
 * @param {Object} node - `eval` identifier AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentEvalIdentifier(node, parent, key, state) {
	parent[key] = copyLocAndComments(
		t.memberExpression(state.trackerVarNode, t.identifier('evalIndirect')),
		node
	);
}

/**
 * Determine if `eval` identifier refers to global `eval` (not var called `eval` defined in file).
 * @param {Object} block - Block object that `eval` in in.
 * @returns {boolean} - `true` if `eval` is a global var
 */
function isGlobalEval(block) {
	do {
		if (block.bindings.eval) return false;
	} while (block = block.parent); // eslint-disable-line no-cond-assign
	return true;
}

/**
 * If `super` is usable in this `eval()`, activate `super` block,
 * create an internal / external var for `this`, and set `superIsProto` on function.
 * @param {Object} [fn] - Function object
 * @param {Object} state - State object
 * @returns {boolean} - `true` if `super` is usable
 */
function activateSuperIfIsUsable(fn, state) {
	const superBlock = state.currentSuperBlock;
	if (!superBlock) return false;

	// If no function, this code must be within `eval()` and `super` is outside `eval()`, so it is usable
	if (fn) {
		const fnType = fn.node.type;
		if (fnType === 'FunctionDeclaration' || fnType === 'FunctionExpression') return false;
		if (fnType === 'ArrowFunctionExpression') {
			const fullFunction = getParentFullFunction(fn);
			if (fullFunction) {
				const fullFnType = fullFunction.node.type;
				if (fullFnType === 'FunctionDeclaration' || fullFnType === 'FunctionExpression') return false;
			}
			createExternalVarForThis(fn, state);
		} else if (fnType === 'ClassDeclaration' || fnType === 'ClassExpression') {
			const {trail} = state;
			if (trail.length > 6) {
				const maybeConstructorNode = getProp(fn.node, trail, 3);
				if (maybeConstructorNode.type === 'ClassMethod' && maybeConstructorNode.kind === 'constructor') {
					// In class constructor - need internal var for `this` as `eval()` code might include `super()`
					createInternalVarForThis(fn, state);
				}
			}
		}

		setSuperIsProtoOnFunctions(superBlock, fn, state);
	}

	// TODO: Also need to pass `superIsProto` and `superVarNode` to `evalDirect()`
	// for it to set inside `eval()`
	activateSuperBinding(superBlock, state);
	return true;
}
