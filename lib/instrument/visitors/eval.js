/* --------------------
 * livepack module
 * Code instrumentation visitors for `eval`
 * ------------------*/

'use strict';

// Export
module.exports = {visitEvalIdentifier, visitEvalCall};

// Modules
const t = require('@babel/types');

// Imports
const {
		activateSuperBinding, getParentFullFunction, createInternalVarForThis, createExternalVarForThis,
		setSuperIsProtoOnFunctions
	} = require('./super.js'),
	{getOrCreateExternalVar, activateBlock, activateBinding, createBlockTempVar} = require('../blocks.js'),
	{createLocalEvalVarNode} = require('../internalVars.js'),
	{flagAllAncestorFunctions, copyLocAndComments} = require('../utils.js'),
	{isReservedWord, getProp} = require('../../shared/functions.js');

// Exports

function visitEvalIdentifier(node, parent, key, state) {
	// Flag that `eval` is used in file
	state.fileContainsFunctionsOrEval = true;

	// Queue instrumentation on 2nd pass
	state.secondPass(instrumentEvalIdentifier, node, state.currentBlock, parent, key, state);
}

/**
 * Visit `eval()` call.
 * @param {Object} node - Call expression AST node
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} state - State object
 * @returns {undefined}
 */
function visitEvalCall(node, parent, key, state) {
	// If no arguments, or first arg is spread (`eval(...x)`), leave as is
	const argNodes = node.arguments;
	if (argNodes.length === 0 || argNodes[0].type === 'SpreadElement') return;

	// Flag that `eval()` used in this function and all functions above
	const fn = state.currentFunction;
	flagAllAncestorFunctions(fn, 'containsEval');

	// Queue instrumentation on 2nd pass
	state.secondPass(
		instrumentEvalCall, node, state.currentBlock, state.currentSuperBlock, state.currentThisBlock,
		fn, state.isStrict, state.currentSuperIsProto, [...state.trail], parent, key, state
	);
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
 * @param {Object} [superBlock] - `super` block object (if `super` block exists)
 * @param {Object} [thisBlock] - `this` block object (if `this` block exists)
 * @param {Object} [fn] - Function object for function `eval` is in (`undefined` if not in a function)
 * @param {boolean} isStrict - `true` if is strict mode
 * @param {boolean} superIsProto - `true` if `super` is in a prototype context (class proto method)
 * @param {Array<string|number>} trail - Trail
 * @param {Object|Array} parent - Call expression's parent AST node/container
 * @param {string|number} key - Call node's key on parent AST node/container
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentEvalCall(
	callNode, block, superBlock, thisBlock, fn, isStrict, superIsProto, trail, parent, key, state
) {
	// If `super` is accessible to `eval`, activate `super` block
	const canUseSuper = activateSuperIfIsUsable(fn, superBlock, thisBlock, superIsProto, trail, state);

	// Capture all vars in scopes above
	const scopeNodes = [],
		functionId = fn ? fn.id : undefined,
		varNamesUsed = new Set();
	let bindingsBlock = block,
		blockIsExternalToFunction = false,
		externalVars,
		externalEvalVarNodeIsProxyBoolNode = t.booleanLiteral(false);
	do {
		if (!blockIsExternalToFunction && fn && bindingsBlock.id < functionId) {
			blockIsExternalToFunction = true;
			externalVars = fn.externalVars;
		}

		const varDefsNodes = [];
		for (const [varName, binding] of Object.entries(bindingsBlock.bindings)) {
			if (varNamesUsed.has(varName)) continue;
			if (isStrict && varName !== 'this' && isReservedWord(varName)) continue;

			// Ignore `super` if it's not accessible
			if (varName === 'super' && !canUseSuper) continue;

			varNamesUsed.add(varName);

			// Create array for var `[varName, isConst, isSilentConst, argNames]`
			// NB Assignment to var called `arguments` or `eval` is illegal in strict mode.
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

			// If var is `eval`, it'll need to be accessed via `livepack_localEval`.
			// If this `eval()` appears in code which is running inside another direct `eval()`,
			// use `state.externalEvalVarNodeIsProxyBoolNode` as the flag.
			// This boolean literal AST node is initially `false`, but will be set to `true`
			// if the internal vars prefix num changes in this "program" from what it is outside `eval()`.
			// Whether that's the case or not can't be known until end of 2nd pass, as there could be
			// an identifier anywhere in the AST referring to a global var with a name which clashes
			// with an internal var. `state.externalEvalVarNodeIsProxyBoolNode` will be mutated to be `true`
			// if this is the case at the end of 2nd pass (in `directEvalModifyAst()`).
			if (varName === 'eval' && bindingsBlock.id < state.programBlock.id) {
				externalEvalVarNodeIsProxyBoolNode = state.externalEvalVarNodeIsProxyBoolNode;
			}

			// If var is external to function, record function as using this var.
			// Ignore `new.target` as it's not possible to recreate.
			// Ignore `require` as it would render the function containing `eval()` un-serializable.
			// Also ignore CommonJS wrapper function's `arguments` as that contains `require` too.
			if (
				blockIsExternalToFunction
				&& varName !== 'new.target'
				&& ((varName !== 'require' && varName !== 'arguments') || bindingsBlock !== state.fileBlock)
			) {
				activateBinding(binding, varName, state);
				const externalVar = getOrCreateExternalVar(externalVars, bindingsBlock, varName, binding);
				externalVar.isReadFrom = true;
				if (!isConst) externalVar.isAssignedTo = true;
			}
		}

		// If some vars from block used, add to scopes definitions.
		// Always include file block and, if sloppy mode, hoist block.
		if (
			varDefsNodes.length !== 0 || bindingsBlock === state.fileBlock
			|| (!isStrict && bindingsBlock === state.currentHoistBlock)
		) {
			activateBlock(bindingsBlock, state);

			scopeNodes.push(t.arrayExpression([
				t.numericLiteral(bindingsBlock.id),
				bindingsBlock.name ? t.stringLiteral(bindingsBlock.name) : null,
				bindingsBlock.varsBlock.scopeIdVarNode,
				...varDefsNodes
			]));
		}
	} while (bindingsBlock = bindingsBlock.parent); // eslint-disable-line no-cond-assign

	// Replace `eval(x)` with
	// ```
	// (
	//   livepack_temp1 = livepack_tracker.evalDirect(
	//     eval,
	//     [x],
	//     [...], // Scope vars
	//     true, // `isStrict` flag
	//     1 // Hoist block ID (if there is hoist block and sloppy mode)
	//   )
	// )[0]
	//   ? eval(livepack_temp1[1])
	//   : (0, livepack_temp1[1])(...livepack_temp1[2])
	// ```
	const tempVarNode = createBlockTempVar(block, state);
	parent[key] = copyLocAndComments(
		t.conditionalExpression(
			t.memberExpression(
				t.assignmentExpression(
					'=', tempVarNode,
					t.callExpression(
						t.memberExpression(state.trackerVarNode, t.identifier('evalDirect')),
						[
							callNode.callee,
							t.arrayExpression(callNode.arguments),
							t.arrayExpression(scopeNodes.reverse()),
							t.booleanLiteral(isStrict),
							externalEvalVarNodeIsProxyBoolNode,
							...(
								(!isStrict && state.currentHoistBlock)
									? [t.numericLiteral(state.currentHoistBlock.id)]
									: []
							)
						]
					)
				),
				t.numericLiteral(0),
				true
			),
			t.callExpression(t.identifier('eval'), [t.memberExpression(tempVarNode, t.numericLiteral(1), true)]),
			t.callExpression(
				t.sequenceExpression([
					t.numericLiteral(0),
					t.memberExpression(tempVarNode, t.numericLiteral(1), true)
				]),
				[t.spreadElement(t.memberExpression(tempVarNode, t.numericLiteral(2), true))]
			)
		),
		callNode
	);
}

/**
 * Instrument `eval` used standalone (not as an `eval()` call).
 * If is bound to a local var (i.e. not referring to global `eval`),
 * replace `eval` with `livepack_localEval`.
 * @param {Object} node - `eval` identifier AST node
 * @param {Object} block - Block object for block `eval` is in
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @param {Object} state - State object
 * @returns {undefined}
 */
function instrumentEvalIdentifier(node, block, parent, key, state) {
	// Find block where `eval` is bound
	let evalBlock = block;
	do {
		if (evalBlock.bindings.eval) break;
	} while (evalBlock = evalBlock.parent); // eslint-disable-line no-cond-assign

	// If is global `eval` (no local binding), leave as `eval`
	if (!evalBlock) return;

	// Replace `eval` with `livepack_localEval`
	parent[key] = copyLocAndComments(createLocalEvalVarNode(state), node);

	// If binding for `eval` is from outside this "program"
	// (i.e. this "program" is code in running inside `eval()` and `eval` binding is outside),
	// record AST node for accessing `livepack_localEval` var node. If `livepack_localEval` is
	// turned into a proxy later, this node may be mutated into a proxy access `livepack_localEval.e`.
	if (evalBlock.id < state.programBlock.id) state.externalEvalVarNodes.push(parent[key]);
}

/**
 * If `super` is usable in this `eval()`, activate `super` block,
 * create an internal / external var for `this`, and set `superIsProto` on function.
 * @param {Object} [fn] - Function object
 * @param {Object} [superBlock] - `super` block object (if `super` block exists)
 * @param {Object} [thisBlock] - `this` block object (if `this` block exists)
 * @param {boolean} superIsProto - `true` if `super` is in a prototype context (class proto method)
 * @param {Array<string|number>} trail - Trail
 * @param {Object} state - State object
 * @returns {boolean} - `true` if `super` is usable
 */
function activateSuperIfIsUsable(fn, superBlock, thisBlock, superIsProto, trail, state) {
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
			createExternalVarForThis(fn, thisBlock, state);
		} else if (fnType === 'ClassDeclaration' || fnType === 'ClassExpression') {
			if (trail.length > 6) {
				const maybeConstructorNode = getProp(fn.node, trail, 3);
				if (maybeConstructorNode.type === 'ClassMethod' && maybeConstructorNode.kind === 'constructor') {
					// In class constructor - need internal var for `this` as `eval()` code might include `super()`
					createInternalVarForThis(fn);
				}
			}
		}

		if (superIsProto) setSuperIsProtoOnFunctions(superBlock, fn);
	}

	// TODO Also need to pass `superIsProto` and `superVarNode` to `evalDirect()`
	// for it to set inside `eval()`
	activateSuperBinding(superBlock, state);
	return true;
}
