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
const {activateSuperBinding} = require('./super.js'),
	{getOrCreateExternalVar, activateBlock, activateBinding} = require('../blocks.js'),
	{createTempVarNode} = require('../internalVars.js'),
	{copyLocAndComments} = require('../utils.js'),
	{isReservedWord} = require('../../shared/functions.js');

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
			flagFunctionsAsContainingEval(fn);
			canUseSuper = activateSuperIfIsUsable(fn, state);
		}
	}

	// Flag that `eval` is used in file
	state.fileContainsFunctionsOrEval = true;

	// Queue instrumentation on 2nd pass
	if (isEvalCall) {
		state.secondPass(
			instrumentEvalCall,
			parent, state.currentBlock, fn, state.isStrict, canUseSuper, state.currentSuperIsProto, state
		);
	} else {
		state.secondPass(instrumentEvalIdentifier, node, state.currentBlock, parent, key, state);
	}
}

/**
 * Flag current function (if in a function) and all functions above as containing `eval()`.
 * Also flag all external vars for all functions as `isFrozenName`.
 * @param {Object} [fn] - Function object
 * @returns {undefined}
 */
function flagFunctionsAsContainingEval(fn) {
	while (fn && !fn.containsEval) {
		fn.containsEval = true;

		for (const vars of fn.externalVars.values()) {
			for (const [varName, externalVar] of vars) {
				if (externalVar.isFrozenName) continue;
				externalVar.isFrozenName = true;
				// `new.target` isn't actually frozen, so needs trails recorded
				if (varName !== 'new.target') externalVar.trails.length = 0;
			}
		}

		fn = fn.parent;
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
 * @param {boolean} superIsProto - `true` if `super` refers to class prototype
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentEvalCall(callNode, block, fn, isStrict, canUseSuper, superIsProto, state) {
	// If no arguments, leave as is
	const argNodes = callNode.arguments;
	if (argNodes.length === 0) return;

	// Capture all vars in scopes above
	const scopeNodes = [],
		varNamesUsed = new Set();
	let isExternalToFunction = false,
		evalIsLocal = false;
	do {
		// Check if block is external to function
		if (!isExternalToFunction && fn && block.id < fn.id) isExternalToFunction = true;

		const varDefsNodes = [];
		for (const [varName, binding] of block.bindings) {
			// Freeze binding to prevent var being renamed when used internally in a function.
			// All vars in scope need to be frozen, even if not accessible to `eval()`
			// because if they're renamed, they would become accessible to `eval()` when they weren't before.
			if (!binding.isFrozenName) {
				binding.isFrozenName = true;
				binding.trails.length = 0;
			}

			// Skip var if it's shadowed by var with same name in higher scope
			if (varNamesUsed.has(varName)) continue;

			// If `eval()` is strict mode, skip vars which are illegal to use in strict mode (e.g. `package`)
			// as `eval()` won't be able to access them
			if (isStrict && varName !== 'this' && varName !== 'super' && isReservedWord(varName)) continue;

			// Ignore `require` as it would render the function containing `eval()` un-serializable.
			// Also ignore CommonJS wrapper function's `arguments` as that contains `require` too.
			if ((varName === 'require' || varName === 'arguments') && block === state.fileBlock) continue;

			// Ignore `super` if it's not accessible
			if (varName === 'super' && !canUseSuper) continue;

			varNamesUsed.add(varName);

			if (varName === 'eval') evalIsLocal = true;

			// Create array for var `[varName, isConst, isSilentConst, argNames, tempVarValue]`.
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
			if (varName === 'super') {
				while (varDefNodes.length !== 4) varDefNodes.push(null);
				varDefNodes.push(binding.varNode);
			}
			varDefsNodes.push(t.arrayExpression(varDefNodes));

			// If var is external to function, record function as using this var.
			// Ignore `new.target` and `super` as they're not possible to recreate.
			// https://github.com/overlookmotel/livepack/issues/448
			if (isExternalToFunction && varName !== 'new.target' && varName !== 'super') {
				activateBinding(binding);
				const externalVar = getOrCreateExternalVar(fn, block, varName, binding);
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

	// If `eval` is not refering to global, don't replace `eval()`
	// TODO: This isn't perfect, but problem is local `eval` var may a reference to global `eval`,
	// but if so it will have been swapped for `livepack_tracker.evalIndirect`, and no way to reliably
	// restore `eval` in local scope to native `eval` in order to call it if in strict mode.
	// e.g. `const x = 1; (eval => { 'use strict'; eval('x'); })(eval);`
	// https://github.com/overlookmotel/livepack/issues/485 would be a solution to this.
	if (evalIsLocal) return;

	// Replace `eval(x)` with
	// `livepack_tracker.evalDirect(
	//   x,
	//   eval,
	//   livepack_temp_1 => eval(livepack_temp_1),
	//   livepack_temp_1 => eval(...livepack_temp_1),
	//   [...], // Scope vars
	//   true, // `isStrict` flag
	//   false // `superIsProto` flag
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
		t.booleanLiteral(isStrict),
		t.booleanLiteral(canUseSuper && superIsProto)
	);
}

/**
 * Instrument `eval` used standalone (not as an `eval()` call).
 * Replace `eval` with `livepack_tracker.evalIndirect`.
 * @param {Object} node - `eval` identifier AST node
 * @param {Object} block - Block object for block `eval` is in
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentEvalIdentifier(node, block, parent, key, state) {
	// Don't alter if `eval` doesn't refer to global `eval`
	do {
		if (block.bindings.has('eval')) return;
	} while (block = block.parent); // eslint-disable-line no-cond-assign

	parent[key] = copyLocAndComments(
		t.memberExpression(state.trackerVarNode, t.identifier('evalIndirect')),
		node
	);
}

/**
 * If `super` is usable in this `eval()`, activate `super` block.
 * @param {Object} [fn] - Function object
 * @param {Object} state - State object
 * @returns {boolean} - `true` if `super` is usable
 */
function activateSuperIfIsUsable(fn, state) {
	const superBlock = state.currentSuperBlock;
	if (!superBlock) return false;

	// If inside a class constructor, class method, class property, or object method,
	// or an arrow function inside any of those, `super` is usable.
	// If inside a normal function, it's not.
	// If no parent non-arrow function found, this code must be within `eval()`
	// and `super` is outside `eval()`, so `super` is usable.
	while (fn) {
		const {type} = fn.node;
		if (type === 'FunctionDeclaration' || type === 'FunctionExpression') return false;
		if (type !== 'ArrowFunctionExpression') break;
		fn = fn.parent;
	}

	activateSuperBinding(superBlock, state);
	return true;
}
