/* --------------------
 * livepack module
 * Replacements for `eval` which instrument code before executing.
 * ------------------*/

'use strict';

// Modules
const generate = require('@babel/generator').default,
	{isString} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const createTracker = require('./tracker.js'),
	{parseImpl} = require('../instrument/instrument.js'),
	modifyAst = require('../instrument/modify.js'),
	{
		createBlockWithId, createThisBinding, createNewTargetBinding, createBindingWithoutNameCheck
	} = require('../instrument/blocks.js'),
	{createInternalVarNodeFromPrefixNum} = require('../instrument/internalVars.js'),
	{
		GLOBAL, TOP_BLOCK_ID, TRACKER_VAR_NAME_BODY, GET_SCOPE_ID_VAR_NAME_BODY, LOCAL_EVAL_VAR_NAME_BODY
	} = require('../shared/constants.js'),
	getScopeId = require('./getScopeId.js');

// Constants
const DEBUG = !!process.env.LIVEPACK_DEBUG_INSTRUMENT;

// Exports

module.exports = {addEvalFunctionToTracker, applyEvalShim, disableEvalShim, enableEvalShim};

/**
 * Add `evalDirect` function to tracker.
 * @param {Function} tracker - Tracker function for file
 * @param {Object} fileProps - File properties object
 * @param {string} fileProps.filename - File path
 * @param {number} fileProps.nextBlockId - Next block ID
 * @param {number} prefixNum - Internal vars prefix num
 * @returns {undefined}
 */
function addEvalFunctionToTracker(tracker, fileProps, prefixNum) {
	tracker.evalDirect = (
		possibleEval, args, scopeDefs, isStrict, externalEvalHasProxy, hoistBlockId
	) => evalDirect(
		possibleEval, args, scopeDefs, isStrict, externalEvalHasProxy, hoistBlockId,
		fileProps, prefixNum
	);
}

// Replace `global.eval` with a getter.
// By default will return shimmed `eval` which evaluates code as indirect eval.
// `getEval` can be overriden to cause `global.eval` to evaluate to something else temporarily,
// before going back to evaluate to the shim again.

let evalCount = 0;
const evalShim = {
	eval(code) {
		const fileProps = {filename: `eval:${evalCount++}`, nextBlockId: TOP_BLOCK_ID};
		const tracker = createTracker(fileProps, 0);
		return evalIndirect(code, fileProps, tracker);
	}
}.eval;

const nativeEval = eval; // eslint-disable-line no-eval
const getShimmedEval = () => evalShim;
let getEval = getShimmedEval;
const getNativeEval = () => nativeEval;
const getNativeEvalOnce = () => {
	getEval = getShimmedEval;
	return nativeEval;
};
const getNativeEvalTwice = () => {
	getEval = getNativeEvalOnce;
	return nativeEval;
};

/**
 * Apply shim to `global.eval`.
 * Setting property as non-configurable is a departure from native JS environment.
 * But only way to ensure eval shim continues to work if user can do
 * `Object.defineProperty(global, 'eval', ...)` would be to patch
 * `Object.defineProperty` and `Object.defineProperties`.
 * This would slow down every call to these functions and seems extreme to support
 * a very niche use case.
 * So we just prevent this from happening with `configurable: false`.
 * @param {Map} globals - Globals map
 * @returns {Function} - Native `eval` function
 */
function applyEvalShim(globals) {
	// Apply shim
	Object.defineProperty(global, 'eval', {
		get() {
			return getEval();
		},
		set(newEval) {
			getEval = newEval === evalShim ? getShimmedEval : () => newEval;
		},
		configurable: false
	});

	// Record eval shim in globals in place of native `eval`.
	// User code will only ever be able to access the shim.
	globals.delete(nativeEval);
	globals.set(evalShim, {type: GLOBAL, parent: null, key: 'eval'});

	// Return native `eval` function to be recorded internally
	return nativeEval;
}

/**
 * Disable `global.eval` shim.
 * Only used in tests for "rehydrating" serialized values.
 * @returns {undefined}
 */
function disableEvalShim() {
	getEval = getNativeEval;
}

/**
 * Re-enable `global.eval` shim after it's been disabled.
 * Only used in tests for "rehydrating" serialized values.
 * @returns {undefined}
 */
function enableEvalShim() {
	getEval = getShimmedEval;
}

/**
 * Implementation of shimmed version of `eval` which is exposed as `global.eval`.
 * Instrumentation will replace direct `eval()` calls with `livepack_tracker.evalDirect()`,
 * but all other uses of `eval` will get this shim.
 * Instruments code and executes it.
 * @param {*} code - Argument to `eval`
 * @param {Object} fileProps - File properties object
 * @param {string} fileProps.filename - File path
 * @param {number} fileProps.nextBlockId - Next block ID
 * @param {Function} tracker - Tracker function for file
 * @returns {*} - Result of `eval()` call
 */
function evalIndirect(code, fileProps, tracker) {
	// If `code` arg is not a string, eval it unchanged - it won't be evaluated as code
	if (!isString(code)) return nativeEval(code);

	// Compile code with no external scope.
	// Code returned is instrumented and prefixed with:
	// `const [livepack_tracker, livepack_getScopeId] = eval;`
	// No need to wrap eval code in a further `eval()` call the way there is for direct eval with
	// prefix change, because any local declaration of a var called `eval` will be renamed.
	// So `eval` in injected statement will always refer to `global.eval`.
	const addInternalVarsToAst = (ast, {internalVarsPrefixNum: internalPrefixNum}) => {
		ast.program.body.unshift(
			t.variableDeclaration('const', [t.variableDeclarator(
				t.arrayPattern([trackerVarNode(internalPrefixNum), getScopeIdVarNode(internalPrefixNum)]),
				t.identifier('eval')
			)])
		);
	};
	code = compile(code, fileProps, undefined, false, 0, addInternalVarsToAst);

	// Set up `global.eval` getter to return in order for next calls:
	// 1. Array containing `tracker` and `getScopeId` functions
	//    - for `const [livepack_tracker, livepack_getScopeId] = eval;`.
	// 2. Revert to returning the usual shimmed `eval`.
	getEval = () => {
		getEval = getShimmedEval;
		return [tracker, getScopeId];
	};

	// `eval()` code without external scope
	return nativeEval(code);
}

/**
 * Shimmed version of `eval` exposed as `livepack_tracker.evalDirect`.
 * Instrumentation replaces any uses of `eval` which are direct `eval()` calls with this.
 * Instrumentation also passes details of all vars accessible from outside `eval()`.
 * Reconstruct blocks, then instrument code before returning it to be executed.
 * @param {*} possibleEval - Local value of `eval` var at `eval()` call site
 * @param {Array<*>} args - Arguments `eval()` called with
 * @param {Array<Array>} scopeDefs - Scope definitions
 * @param {boolean} isStrict - `true` if `eval()` is in strict mode context
 * @param {boolean} externalEvalHasProxy - `true` if there is an `eval` var binding
 *   outside this `eval()` call and it is accessed via a proxy
 * @param {number} [hoistBlockId] - Hoist block ID (`undefined` if no hoist block or strict mode)
 * @param {Object} fileProps - File properties object
 * @param {string} fileProps.filename - File path
 * @param {number} fileProps.nextBlockId - Next block ID
 * @param {number} externalPrefixNum - Internal vars prefix num from external code
 * @returns {Array} - Array with 2 entries:
 *   {boolean} .0 - `true` if `eval` should be called with single argument, `false` if multiple args.
 *   {*} .1 - Argument / array of arguments to call `eval()` with.
 */
function evalDirect(
	possibleEval, args, scopeDefs, isStrict, externalEvalHasProxy, hoistBlockId,
	fileProps, externalPrefixNum
) {
	// If var `eval` where `eval()` is called is not global `eval`, or if it is,
	// but first arg is not a string (in which case it won't be evaluated as code),
	// don't instrument code.
	// Just return value of `eval` and original arguments for `eval()` to be called with.
	// NB Pass value of `eval` back out rather than use it directly to avoid double-lookup
	// if lookup has side effects.
	// e.g. `numEvalLookups` should be 1 in this case:
	// ```js
	// let numEvalLookups = 0;
	// const withObj = { get eval() { numEvalLookups++; return () => 123; } };
	// with (withObj) {
	//    eval('456');
	// }
	// ```
	// `with (...)` can still foul things up in other ways, but at least can solve this problem.
	let code = args[0];
	if (possibleEval !== evalShim || !isString(code)) return [false, possibleEval, args];

	// Create blocks
	const state = {
		currentBlock: undefined,
		currentThisBlock: undefined,
		currentSuperBlock: undefined,
		currentHoistBlock: undefined,
		fileBlock: undefined,
		externalEvalVarNodes: undefined,
		externalEvalVarNodeIsProxyBoolNode: undefined
	};

	let isFirstBlock = true;
	for (const [blockId, blockName, scopeId, ...varDefs] of scopeDefs) {
		const block = createBlockWithId(blockId, blockName, true, state);
		block.scopeIdVarNode = t.numericLiteral(scopeId);
		state.currentBlock = block;

		if (isFirstBlock) {
			state.fileBlock = block;
			isFirstBlock = false;
		} else if (blockId === hoistBlockId) {
			state.currentHoistBlock = block;
		}

		for (const [varName, isConst, isSilentConst, argNames] of varDefs) {
			if (varName === 'this') {
				createThisBinding(block);
				state.currentThisBlock = block;
			} else if (varName === 'new.target') {
				createNewTargetBinding(block);
			} else {
				let varNode;
				if (varName === 'super') {
					// TODO Also need to set `superIsProto` and create a new temp var for `super` target
					// (the external var could be shadowed inside `eval()` if prefix num is changing)
					state.currentSuperBlock = block;
				} else if (varName === 'eval') {
					// `eval` var binding outside this `eval()`. Set `varNode` to getter for external `eval` var.
					// TODO Could do this in `instrumentEvalIdentifier()` instead.
					varNode = localEvalVarNode(0);
					state.externalEvalVarNodes = [varNode];
					state.externalEvalVarNodeIsProxyBoolNode = t.booleanLiteral(externalEvalHasProxy);
				}

				// Whether var is function is not relevant because it will always be in external scope
				// of the functions it's being recorded on, and value of `isFunction` only has any effect
				// for internal vars
				createBindingWithoutNameCheck(
					block, varName, {varNode, isConst: !!isConst, isSilentConst: !!isSilentConst, argNames}
				);
			}
		}
	}

	// Compile to executable code with tracking code inserted.
	// If var names prefix inside code has to be different from outside,
	// code is wrapped in another `eval()` and a statement which renames the tracker/eval functions:
	// ```js
	// const livepack1_tracker = livepack_tracker.createTracker(1),
	//   livepack1_getScopeId = livepack_getScopeId;
	// ```
	// The additional wrapping in another `eval()` is in case this code defines a var which clashes
	// with the external `livepack_tracker` or `livepack_getScopeId` var.
	let prefixNumIsChanged = false;
	const addInternalVarsToAst = (ast, compileState) => {
		prefixNumIsChanged = directEvalModifyAst(
			ast, compileState.internalVarsPrefixNum, externalPrefixNum, externalEvalHasProxy,
			state.externalEvalVarNodes, state.externalEvalVarNodeIsProxyBoolNode
		);
	};

	code = compile(code, fileProps, state, isStrict, externalPrefixNum, addInternalVarsToAst);

	// Make `global.eval` getter return native `eval` on next call.
	// If code has been wrapped in a 2nd `eval()` due to prefix num change, make it return it twice
	// (will call `eval('eval("...")'))` and both calls to `eval()` need access to outer scope).
	getEval = prefixNumIsChanged ? getNativeEvalTwice : getNativeEvalOnce;

	// Return instrumented code to call `eval()` with
	return [true, code];
}

/**
 * If var names prefix inside code has to be different from outside,
 * code is wrapped in another `eval()` and a statement which renames the tracker/eval functions:
 * ```js
 * const livepack1_tracker = livepack_tracker.createTracker(1),
 *   livepack1_getScopeId = livepack_getScopeId;
 * ```
 * The additional wrapping in another `eval()` is in case this code defines a var which clashes
 * with the external `livepack_tracker` or `livepack_getScopeId` var.
 *
 * Also, if there's a binding for var called `eval` outside of `eval()`-ed code and it's accessed
 * inside the `eval()-ed` code, create a proxy to access it.
 *
 * Proxy is needed in cases where internal vars prefix num changes within the `eval()`.
 * However, it's not possible to know if this will happen during compilation at the time `eval()`
 * is replaced by `livepack_tracker.evalDirect()`. This is because an identifier later on in the AST
 * may force this change, and that's only discovered later in the 2nd compilation pass, so potentially
 * after `eval()` has been processed.
 *
 * So, compilation uses a boolean literal AST node `state.externalEvalVarNodeIsProxyBoolNode`
 * in the `livepack_tracker.evalDirect()` shim. This AST node can be retrospectively changed to `true`
 * at this point if prefix num is changing and a proxy is created.
 *
 * @param {Object} ast - AST
 * @param {number} internalPrefixNum - Internal vars prefix num in `eval()`-ed code
 * @param {number} externalPrefixNum - Internal vars prefix num outside `eval()`-ed code
 * @param {boolean} externalEvalHasProxy - `true` if binding for `eval` var is proxied
 * @param {Array<Object>} [externalEvalVarNodes] - Array of identifier AST nodes `livepack_localEval`
 *   used to access external `eval` var
 * @param {Object} [externalEvalVarNodeIsProxyBoolNode] - Boolean literal AST node.
 *   Value is `true` if external `eval` var is accessed with getter/setter
 * @returns {boolean} - `true` if internal vars prefix num is different inside `eval()` from outside
 */
function directEvalModifyAst(
	ast, internalPrefixNum, externalPrefixNum, externalEvalHasProxy,
	externalEvalVarNodes, externalEvalVarNodeIsProxyBoolNode
) {
	if (internalPrefixNum === externalPrefixNum) return false;

	// Insert vars for `livepack_tracker` + `livepack_getScopeId`
	const declaratorNodes = [
		t.variableDeclarator(
			trackerVarNode(internalPrefixNum),
			t.callExpression(
				t.memberExpression(trackerVarNode(externalPrefixNum), t.identifier('createTracker')),
				[t.numericLiteral(internalPrefixNum)]
			)
		),
		t.variableDeclarator(getScopeIdVarNode(internalPrefixNum), getScopeIdVarNode(externalPrefixNum))
	];

	// Insert var for `livepack_localEval` proxy.
	// NB Reason test is that `.length` needs to be greater than 1 (not 0) is that the array
	// is initialized with one element in `evalDirect()` above.
	// If var has used, more will have been nodes have been pushed onto array during compilation.
	if (externalEvalVarNodes && externalEvalVarNodes.length > 1) {
		// Mutate eval var nodes from `livepack1_localEval` to `livepack1_localEval.e`
		const internalLocalEvalVarNode = localEvalVarNode(internalPrefixNum),
			externalLocalEvalVarNode = localEvalVarNode(externalPrefixNum);

		const accessorNode = t.memberExpression(internalLocalEvalVarNode, t.identifier('e'));
		accessorNode.name = undefined;
		for (const externalEvalVarNode of externalEvalVarNodes) {
			Object.assign(externalEvalVarNode, accessorNode);
		}

		// Add declaration for proxy
		let proxyNode;
		if (!externalEvalHasProxy) {
			// No existing proxy - create one

			// Set boolean for whether `eval` is accessed via getter/setter to `true`.
			// This alters the value of `externalEvalHasProxy` in the code generated for `eval()`
			// within this `eval()`.
			externalEvalVarNodeIsProxyBoolNode.value = true;

			// Create proxy to access external `livepack_localEval`
			// ```js
			// livepack1_localEval = {
			//   get e() { return livepack_localEval; },
			//   set e(v) { livepack_localEval = v; }
			// }
			// ```
			// Don't need to worry about the proxy's setter being in a different location from
			// where the original set operation occurs originally, and that potentially it runs in sloppy mode,
			// when original set operation runs in strict mode, because: Assigning to `eval` in strict mode
			// code is a syntax error, so we know for sure original assignment is in sloppy mode code
			// (and therefore the proxy's setter must be too).
			proxyNode = t.objectExpression([
				t.objectMethod('get', t.identifier('e'), [], t.blockStatement([
					t.returnStatement(externalLocalEvalVarNode)
				])),
				t.objectMethod('set', t.identifier('e'), [t.identifier('v')], t.blockStatement([
					t.expressionStatement(t.assignmentExpression('=', externalLocalEvalVarNode, t.identifier('v')))
				]))
			]);
		} else {
			// Proxy already exists outside `eval()` - just rename it
			// `livepack1_localEval = livepack_localEval`
			proxyNode = externalLocalEvalVarNode;
		}
		declaratorNodes.push(t.variableDeclarator(internalLocalEvalVarNode, proxyNode));
	}

	// Wrap code in another `eval()`
	ast.program.body = [
		t.variableDeclaration('const', declaratorNodes),
		// eslint-disable-next-line no-use-before-define
		t.expressionStatement(t.callExpression(t.identifier('eval'), [generateCodeStringNode(ast)]))
	];

	return true;
}

/**
 * Instrument code.
 * @param {string} code - Code string passed to `eval()`
 * @param {Object} fileProps - File properties object
 * @param {string} fileProps.filename - File path
 * @param {number} fileProps.nextBlockId - Next block ID
 * @param {Object} [state] - State to initialize instrumentation state (only if direct `eval()` call)
 * @param {boolean} isStrict - `true` if environment outside `eval()` is strict mode
 * @param {number} externalPrefixNum - Internal vars prefix num from external code
 * @param {Function} addInternalVarsToAst - Function to alter AST to inject internal vars
 * @returns {string} - Instrumented code
 * @throws {Error} - If failed to parse or instrument code
 */
function compile(code, fileProps, state, isStrict, externalPrefixNum, addInternalVarsToAst) {
	// Parse code
	const {filename} = fileProps;
	const {ast} = parseImpl(code, filename, false, false, !!state, false, isStrict, false, undefined);

	// Instrument code.
	// Filename in eval code will be same as host file.
	// Block IDs in created code will be higher than block IDs used in this file (to avoid clashes).
	// Var name prefix will be kept same as in host file if possible,
	// to avoid wrapping in a function unless impossible to avoid.
	// Details of vars which can be obtained from external scopes is passed in.
	state = {
		nextBlockId: fileProps.nextBlockId,
		isStrict,
		internalVarsPrefixNum: externalPrefixNum,
		...state
	};
	modifyAst(ast, filename, false, isStrict, undefined, state);

	// Update next block ID for file
	fileProps.nextBlockId = state.nextBlockId;

	// If indirect `eval`, or direct `eval()` with different prefix nums inside and outside `eval()`,
	// inject `livepack_tracker` and `livepack_getScopeId`
	addInternalVarsToAst(ast, state);

	// Return instrumented code
	code = generateCode(ast); // eslint-disable-line no-use-before-define

	if (DEBUG) {
		/* eslint-disable no-console */
		console.log('----------------------------------------');
		console.log('TRANSFORMED: eval code in', filename);
		console.log('----------------------------------------');
		console.log(code);
		console.log('');
		/* eslint-enable no-console */
	}

	return code;
}

function trackerVarNode(prefixNum) {
	return createInternalVarNodeFromPrefixNum(TRACKER_VAR_NAME_BODY, prefixNum);
}

function getScopeIdVarNode(prefixNum) {
	return createInternalVarNodeFromPrefixNum(GET_SCOPE_ID_VAR_NAME_BODY, prefixNum);
}

function localEvalVarNode(prefixNum) {
	return createInternalVarNodeFromPrefixNum(LOCAL_EVAL_VAR_NAME_BODY, prefixNum);
}

/**
 * Generate code from AST.
 * If debugging enabled, generates in a more readable form.
 * @param {Object} ast - AST
 * @returns {string} - Generated code
 */
const generateCode = DEBUG
	? ast => generate(ast).code
	: ast => generate(ast, {retainLines: true, compact: true}).code;

/**
 * Generate a string literal AST node for a string of code generated from AST.
 * If debugging enabled, generates a template literal instead with line breaks retained
 * for greater readability.
 * @param {Object} ast - AST
 * @returns {Object} - String literal / template literal AST node
 */
const generateCodeStringNode = DEBUG
	? ast => t.templateLiteral([
		t.templateElement({
			raw: `\n${generateCode(ast).replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\n`
		}, true)
	], [])
	: ast => t.stringLiteral(generateCode(ast));
