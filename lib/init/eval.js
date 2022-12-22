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
const {parseImpl} = require('../instrument/instrument.js'),
	modifyAst = require('../instrument/modify.js'),
	{
		createBlockWithId, createThisBinding, createNewTargetBinding, createBindingWithoutNameCheck
	} = require('../instrument/blocks.js'),
	{
		INTERNAL_VAR_NAMES_PREFIX, TRACKER_VAR_NAME_BODY, GET_SCOPE_ID_VAR_NAME_BODY
	} = require('../shared/constants.js'),
	specialFunctions = require('../shared/internal.js').functions,
	getScopeId = require('./getScopeId.js'),
	assertBug = require('../shared/assertBug.js');

// Constants
const DEBUG = !!process.env.LIVEPACK_DEBUG_INSTRUMENT;

// Exports

/**
 * Add eval methods to tracker.
 * @param {Function} tracker - Tracker function for file
 * @param {string} filename - File path
 * @returns {undefined}
 */
module.exports = function addEvalFunctionsToTracker(tracker, filename) {
	const evalIndirectLocal = {
		eval(code) {
			return evalIndirect(code, tracker, filename, evalIndirectLocal);
		}
	}.eval;
	const evalDirectLocal = (...args) => evalDirect(args, tracker, filename, evalDirectLocal);
	tracker.evalIndirect = evalIndirectLocal;
	tracker.evalDirect = evalDirectLocal;

	// Record eval shim so it can be switched back to `eval` if it's serialized
	specialFunctions.set(evalIndirectLocal, {type: 'eval', parent: null, key: filename});
};

/**
 * Shimmed version of `eval` exposed as `livepack_tracker.evalIndirect`.
 * Instrumentation replaces an uses of `eval` which are not `eval()` calls with this.
 * Instruments code before executing it.
 * @param {*} code - Argument to `eval`
 * @param {Function} tracker - Tracker function for file
 * @param {string} filename - File path
 * @param {Function} evalIndirectLocal - Function which was called (used for stack traces if error)
 * @returns {*} - Result of `eval()` call
 */
function evalIndirect(code, tracker, filename, evalIndirectLocal) {
	// If `code` arg is not a string, eval it unchanged - it won't be evaluated as code
	// eslint-disable-next-line no-eval
	if (!isString(code)) return execEvalCode(eval, code, false, code, evalIndirectLocal);

	// Compile code with no external scope.
	// Code returned is for a function which takes arguments `(livepack_tracker, livepack_getScopeId)`.
	const {code: fnCode, shouldThrow} = compile(code, tracker, filename, true, undefined, false);

	// `eval()` code without external scope and inject in Livepack's vars
	// eslint-disable-next-line no-eval
	const fn = execEvalCode(eval, fnCode, shouldThrow, code, evalIndirectLocal);
	return fn(tracker, getScopeId);
}

/**
 * Shimmed version of `eval` exposed as `livepack_tracker.evalDirect`.
 * Instrumentation replaces any uses of `eval` which are direct `eval()` calls with this.
 * Instrumentation also passes details of all vars accessible from outside `eval()`.
 * Reconstruct blocks, then instrument code before executing it.
 * @param {Array<*>} args - Arguments `eval()` called with
 * @param {Function} tracker - Tracker function for file
 * @param {string} filename - File path
 * @param {Function} evalDirectLocal - Function which was called (used for stack traces if error)
 * @returns {*} - Result of `eval()` call
 */
function evalDirect(args, tracker, filename, evalDirectLocal) {
	const callArgs = args.slice(0, -5),
		code = callArgs[0],
		[possibleEval, execEvalSingleArg, execEvalSpread, scopeDefs, isStrict] = args.slice(-5);

	// If var `eval` where `eval()` is called is not global `eval`,
	// call `eval()` with original args unaltered
	// eslint-disable-next-line no-eval
	if (possibleEval !== eval) return execEvalCode(execEvalSpread, callArgs, false, code, evalDirectLocal);

	// If `code` arg is not a string, eval it unchanged - it won't be evaluated as code
	if (!isString(code)) return execEvalCode(execEvalSingleArg, code, false, code, evalDirectLocal);

	// Create blocks
	const state = {
		currentBlock: undefined,
		currentThisBlock: undefined,
		currentSuperBlock: undefined
	};
	for (const [blockId, blockName, scopeId, ...varDefs] of scopeDefs) {
		const block = createBlockWithId(blockId, blockName, true, state);
		block.scopeIdVarNode = t.numericLiteral(scopeId);
		state.currentBlock = block;

		for (const [varName, isConst, isSilentConst, argNames] of varDefs) {
			if (varName === 'this') {
				createThisBinding(block);
				state.currentThisBlock = block;
			} else if (varName === 'new.target') {
				createNewTargetBinding(block);
			} else {
				// TODO Also need to set `superIsProto` and create a new temp var for `super` target
				// (the external var could be shadowed inside `eval()` if prefix num is changing)
				if (varName === 'super') state.currentSuperBlock = block;

				// Whether var is function is not relevant because it will always be in external scope
				// of the functions it's being recorded on, and value of `isFunction` only has any effect
				// for internal vars
				createBindingWithoutNameCheck(
					block, varName, {isConst: !!isConst, isSilentConst: !!isSilentConst, argNames}
				);
			}
		}
	}

	// Compile to executable code with tracking code inserted.
	// If var names prefix inside code has to be different from outside,
	// code is wrapped in an IIFE which renames the tracker/eval functions:
	// `() => foo` ->
	// `((livepack1_tracker, livepack1_getScopeId) => () => foo)(livepack_tracker, livepack_getScopeId)`
	const {code: codeInstrumented, shouldThrow} = compile(code, tracker, filename, false, state, isStrict);

	// Call `eval()` with amended code
	return execEvalCode(execEvalSingleArg, codeInstrumented, shouldThrow, code, evalDirectLocal);
}

/**
 * Execute eval call.
 * If `shouldThrowSyntaxError` is set and `eval()` doesn't throw, throw an error.
 * This is to check that if parsing the code threw an error, it is indeed a genuine syntax error.
 * @param {Function} exec - Function to call
 * @param {*} arg - Argument to call `exec` with
 * @param {boolean} shouldThrowSyntaxError - `true` if `exec(arg)` should throw
 * @param {string} code - Code being executed (for error message)
 * @param {Function} fn - Wrapper function
 * @returns {*} - Return value of `exec(arg)`
 * @throws {*} - Error thrown by `exec(arg)` or internal error if should have thrown but didn't
 */
function execEvalCode(exec, arg, shouldThrowSyntaxError, code, fn) {
	let hasThrown = false;
	try {
		return exec(arg);
	} catch (err) {
		hasThrown = true;
		Error.captureStackTrace(err, fn);
		throw err;
	} finally {
		assertBug(
			!shouldThrowSyntaxError || hasThrown,
			'Failed to parse `eval` expression',
			() => `Eval expression: ${JSON.stringify(code)}`
		);
	}
}

/**
 * Instrument code.
 * If is indirect `eval`, wraps the code in a function which takes `livepack_tracker`
 * and `livepack_getScopeId` arguments. This is to inject Livepack's internal functions into scope.
 * If is direct `eval()` and internal vars prefix number outside `eval()` and inside `eval()` differ,
 * wrap in an IIFE to inject the internal vars with new names:
 * `((livepack20_tracker, livepack20_getScopeId) => { ... })(livepack_tracker, livepack_getScopeId)`
 *
 * @param {string} code - Code string passed to `eval()`
 * @param {Function} tracker - Tracker function for file
 * @param {string} filename - File path
 * @param {boolean} isIndirectEval - `true` if is indirect eval
 * @param {Object} [state] - State to initialize instrumentation state (only if direct `eval()` call)
 * @param {boolean} isStrict - `true` if environment outside `eval()` is strict mode
 * @returns {Object} - Object with properties:
 *   {string} .code - Instrumented code (or input code if parsing failed)
 *   {boolean} .shouldThrow - `true` if could not parse code, so calling `eval()` with this code
 *     should throw syntax error
 */
function compile(code, tracker, filename, isIndirectEval, state, isStrict) {
	// Parse code.
	// If parsing fails, swallow error. Expression will be passed to `eval()`
	// which should throw - this maintains native errors.
	let ast;
	try {
		ast = parseImpl(
			code, filename, false, false, !isIndirectEval, false, isStrict, false, undefined
		).ast;
	} catch (err) {
		return {code, shouldThrow: true};
	}

	// Instrument code.
	// Filename in eval code will be same as host file.
	// Block IDs in created code will be higher than block IDs used in this file (to avoid clashes).
	// Var name prefix will be kept same as in host file if possible,
	// to avoid wrapping in a function unless impossible to avoid.
	// Details of vars which can be obtained from external scopes is passed in.
	const externalPrefixNum = tracker.prefixNum;
	state = {
		nextBlockId: tracker.nextBlockId,
		isStrict,
		internalVarsPrefixNum: externalPrefixNum,
		...state
	};
	modifyAst(ast, filename, false, isStrict, undefined, state);

	// Update next block ID and prefix num for file
	tracker.nextBlockId = state.nextBlockId;
	const internalPrefixNum = tracker.prefixNum = state.internalVarsPrefixNum;

	// If indirect `eval`, or direct `eval()` with different prefix nums inside and outside `eval()`,
	// wrap in function to inject Livepack's internal vars.
	// `123` => `(livepack_tracker, livepack_getScopeId) => eval('123')`.
	// Wrapping in a 2nd `eval()` is required to ensure it returns its value.
	if (isIndirectEval || internalPrefixNum !== externalPrefixNum) {
		let node = wrapInFunction(ast, internalPrefixNum);
		if (!isIndirectEval) node = wrapInFunctionCall(node, externalPrefixNum);
		ast.program.body = [t.expressionStatement(node)];
	}

	// Return instrumented code
	code = generate(ast, {retainLines: true, compact: true}).code;

	if (DEBUG) {
		/* eslint-disable no-console */
		console.log('----------------------------------------');
		console.log('TRANSFORMED: eval code in', filename);
		console.log('----------------------------------------');
		console.log(code);
		console.log('');
		/* eslint-enable no-console */
	}

	return {code, shouldThrow: false};
}

function wrapInFunction(ast, internalPrefixNum) {
	return t.arrowFunctionExpression(
		[
			internalVarNode(TRACKER_VAR_NAME_BODY, internalPrefixNum),
			internalVarNode(GET_SCOPE_ID_VAR_NAME_BODY, internalPrefixNum)
		],
		t.callExpression(
			t.identifier('eval'), [
				t.stringLiteral(generate(ast, {retainLines: true, compact: true}).code)
			]
		)
	);
}

function wrapInFunctionCall(fnNode, externalPrefixNum) {
	return t.callExpression(
		fnNode,
		[
			internalVarNode(TRACKER_VAR_NAME_BODY, externalPrefixNum),
			internalVarNode(GET_SCOPE_ID_VAR_NAME_BODY, externalPrefixNum)
		]
	);
}

function internalVarNode(name, prefixNum) {
	return t.identifier(`${INTERNAL_VAR_NAMES_PREFIX}${prefixNum || ''}_${name}`);
}
