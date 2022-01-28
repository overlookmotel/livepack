/* --------------------
 * livepack module
 * Babel plugin eval handling
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {getBindingBlock} = require('./bindings.js'),
	{getArgNames} = require('./thisArguments.js'),
	{initBlockScope} = require('./blocks.js'),
	recordVarUse = require('./vars.js'),
	{createPrevalVarNode, getEvalVarName, addToInternalVars} = require('./internalVars.js'),
	{PARAMS_BLOCK} = require('./symbols.js'),
	{isReservedWord} = require('../shared/functions.js');

// Exports

module.exports = {
	callExpressionExitVisitor,
	processEval
};

/**
 * Visitor to instrument `eval()` calls.
 * @param {Object} callPath - Babel path object for identifer
 * @param {Object} state - State object
 * @returns {undefined}
 */
function callExpressionExitVisitor(callPath, state) {
	// Ignore local vars called `eval`.
	// NB No need to check `parentVars` as if `eval` was an external var, we wouldn't end up here.
	const calleeNode = callPath.node.callee;
	if (
		t.isIdentifier(calleeNode) && calleeNode.name === 'eval'
		&& !callPath.scope.getBinding('eval')
		&& !state.topLevelVarNames.has('eval')
	) processEvalCall(callPath, state);
}

/**
 * Process `eval()` call.
 * Wrap code in `livepack_preval()`, with object containing scope info about all vars in scope.
 * It's impossible to say which vars will be used until the code runs, so need to assume all vars
 * in scope need to be available.
 * @param {Object} callPath - Babel path object for `eval()`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function processEvalCall(callPath, state) {
	// If no arguments, leave as is
	const argNodes = callPath.node.arguments;
	if (argNodes.length === 0) return;

	// Capture all vars accessible to code in `eval()` expression
	const {currentFunction, currentFullFunction, isStrict} = state,
		vars = Object.create(null);

	// eslint-disable-next-line consistent-return
	function recordVar(shouldRecord, varName, block, isConst, isSilentConst, isFunction) {
		vars[varName] = {block, isConst, isSilentConst};
		if (shouldRecord) return recordVarUse(varName, block, true, !isConst, isFunction, false, state);
		initBlockScope(block, state);
	}

	// Capture all vars in scopes above
	let {scope} = callPath;
	do {
		for (const [varName, binding] of Object.entries(scope.bindings)) {
			if (vars[varName]) continue;
			if (isStrict && isReservedWord(varName)) continue;

			const {
				block, isConst, isSilentConst, isFunction
			} = getBindingBlock(varName, binding, callPath, state);

			// Ignore `arguments` if shadowed by implicit `arguments` created by function
			const blockId = block.id;
			if (varName === 'arguments' && currentFullFunction && currentFullFunction.id > blockId) continue;

			recordVar(
				!!currentFunction && currentFunction.id > blockId,
				varName, block, isConst, isSilentConst && !isStrict, isFunction
			);
		}
		scope = scope.parent;
	} while (scope);

	// Capture `this` + `arguments`
	let argNames;
	if (currentFullFunction) {
		// Capture `this`
		const block = currentFullFunction.path[PARAMS_BLOCK],
			hasIntermediateFunctions = currentFunction !== currentFullFunction;
		recordVar(hasIntermediateFunctions, 'this', block, true, false, false);

		// Capture `arguments`
		if (!vars.arguments) {
			vars.arguments = {block, isConst: isStrict, isSilentConst: false};
			argNames = getArgNames(currentFullFunction);

			if (hasIntermediateFunctions) {
				const fns = recordVarUse('arguments', block, true, !isStrict, false, false, state);
				for (const fn of fns) {
					fn.argNames = argNames;
				}
			}
		}
	}

	// Capture all vars from parent scopes
	for (const [varName, varProps] of Object.entries(state.parentVars)) {
		if (vars[varName]) continue;
		if (isStrict && isReservedWord(varName)) continue;

		let {isConst} = varProps,
			isArguments = varName === 'arguments';
		if (isArguments) {
			argNames = varProps.argNames;
			if (!argNames) {
				isArguments = false;
			} else if (isStrict && !isConst) {
				isConst = true;
			}
		}

		const block = {
			id: varProps.blockId,
			name: varProps.blockName,
			varsBlock: {
				scopeIdVarNode: t.numericLiteral(varProps.scopeId)
			}
		};

		// NB No need to record if var is function - it's not relevant
		// because it will always be in external scope of the functions it's being recorded on
		const fns = recordVar(
			!!currentFunction, varName, block, isConst, varProps.isSilentConst && !isStrict, false
		);

		if (isArguments && fns) {
			for (const fn of fns) {
				fn.argNames = argNames;
			}
		}
	}

	// Capture `module` + `exports`
	if (state.isCommonJs) {
		const block = state.programBlock;
		for (const varName of ['module', 'exports']) {
			if (!vars[varName]) recordVar(!!currentFunction, varName, block, false, false, false);
		}
	}

	// TODO Capture `super`

	// Replace `eval(x)` with `eval(livepack_preval(x, [...], true))`
	argNodes[0] = t.callExpression(
		createPrevalVarNode(state),
		[
			argNodes[0],
			t.arrayExpression(
				Object.entries(vars).map(([varName, {block, isConst, isSilentConst}]) => t.arrayExpression([
					t.stringLiteral(varName),
					t.numericLiteral(block.id),
					block.varsBlock.scopeIdVarNode,
					block.name ? t.stringLiteral(block.name) : null,
					isConst ? t.numericLiteral(1) : null,
					isSilentConst ? t.numericLiteral(1) : null
				]))
			),
			t.booleanLiteral(isStrict),
			...(
				argNames
					? [t.arrayExpression(argNames.map(varName => t.stringLiteral(varName)))]
					: []
			)
		]
	);

	// Flag that eval used in file
	state.evalIsUsed = true;

	// Flag that eval used in this function and all functions above
	let evalFn = currentFunction;
	while (evalFn && !evalFn.containsEval) {
		evalFn.containsEval = true;
		evalFn = evalFn.parent;
	}
}

/**
 * Process `eval`.
 * If it's used standalone (e.g. `(0, eval)()` or `const e = eval`), substitute `livepack_eval`.
 * If it's used as a direct call `eval(x)`, leave to `callExpressionExitVisitor()` to handle.
 * @param {Object} evalPath - Babel path object for `eval`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function processEval(evalPath, state) {
	const {parentPath} = evalPath;
	if (parentPath.isCallExpression() && evalPath.key === 'callee') return;

	const {node} = evalPath;
	node.name = getEvalVarName();
	addToInternalVars(node, state);
	state.evalIsUsed = true;
}
