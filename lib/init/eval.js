/* --------------------
 * livepack module
 * Replacements for `eval` which Babel-compile code before executing.
 * These are injected into compiled code in Babel plugin.
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
		createBlockWithId, createThisBinding, createBindingWithoutNameCheck
	} = require('../instrument/blocks.js'),
	{
		EVAL, INTERNAL_VAR_NAMES_PREFIX, TRACKER_VAR_NAME_BODY, GET_SCOPE_ID_VAR_NAME_BODY
	} = require('../shared/constants.js'),
	{globals} = require('../shared/internal.js'),
	getScopeId = require('./getScopeId.js'),
	assertBug = require('../shared/assertBug.js');

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
	globals.set(evalIndirectLocal, {type: EVAL, parent: null, key: 'eval'});
};

function evalIndirect(code, tracker, filename, evalIndirectLocal) {
	// If `code` arg is not a string, eval it unchanged - it won't be evaluated as code
	// eslint-disable-next-line no-eval
	if (!isString(code)) return execEvalCode(eval, code, false, code, evalIndirectLocal);

	// Compile code with no external scope.
	// Code returned is for a function which takes arguments `(livepack_tracker, livepack_getScopeId)`.
	const {code: fnCode, shouldThrow} = compile(code, tracker, filename, undefined, false);

	// `eval()` code without external scope and inject in Livepack's vars
	// eslint-disable-next-line no-eval
	const fn = execEvalCode(eval, fnCode, shouldThrow, code, evalIndirectLocal);
	return fn(tracker, getScopeId);
}

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
	const {code: codeInstrumented, shouldThrow} = compile(code, tracker, filename, state, isStrict);

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

function compile(code, tracker, filename, state, isStrict) {
	const externalPrefixNum = tracker.prefixNum;
	const res = codeToAst(code, filename, state, isStrict, tracker.nextBlockId, externalPrefixNum);
	if (!res) return {code, shouldThrow: true};

	const {ast, internalPrefixNum} = res;
	tracker.nextBlockId = res.nextBlockId;
	tracker.prefixNum = internalPrefixNum;

	if (internalPrefixNum !== externalPrefixNum || !state) {
		let node = getFunctionBody(ast);
		node = wrapInFunction(node, internalPrefixNum);
		if (state) node = wrapInFunctionCall(node, externalPrefixNum);
		ast.program.body = [t.expressionStatement(node)];
	}

	return {code: generateFromAst(ast), shouldThrow: false};
}

function codeToAst(code, filename, state, isStrict, nextBlockId, externalPrefixNum) {
	// Parse code.
	// If parsing fails, swallow error. Expression will be passed to `eval()`
	// which should throw - this maintains native errors.
	let ast;
	try {
		ast = parseImpl(code, filename, false, false, false, isStrict, false, undefined).ast;
	} catch (err) {
		return undefined;
	}

	// Instrument code.
	// Filename in eval code will be same as host file.
	// Block IDs in created code will be higher than block IDs used in this file (to avoid clashes).
	// Var name prefix will be kept same as in host file if possible,
	// to avoid wrapping in a function unless impossible to avoid.
	// Details of vars which can be obtained from external scopes is passed in.
	state = {
		nextBlockId,
		isStrict,
		internalVarsPrefixNum: externalPrefixNum,
		...state
	};
	modifyAst(ast, filename, false, isStrict, undefined, state);

	return {
		ast,
		nextBlockId: state.nextBlockId,
		internalPrefixNum: state.internalVarsPrefixNum
	};
}

function getFunctionBody(ast) {
	const bodyNodes = ast.program.body,
		numBodyNodes = bodyNodes.length;
	if (numBodyNodes !== 0) {
		const lastNode = bodyNodes[numBodyNodes - 1];
		if (t.isExpressionStatement(lastNode)) {
			if (numBodyNodes === 1) return lastNode.expression;
			bodyNodes[numBodyNodes - 1] = t.returnStatement(lastNode.expression);
		}
	}

	return t.blockStatement(bodyNodes);
}

function wrapInFunction(bodyNode, internalPrefixNum) {
	return t.arrowFunctionExpression(
		[
			internalVarNode(TRACKER_VAR_NAME_BODY, internalPrefixNum),
			internalVarNode(GET_SCOPE_ID_VAR_NAME_BODY, internalPrefixNum)
		],
		bodyNode
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

function generateFromAst(ast) {
	return generate(ast, {retainLines: true, compact: true}).code;
}

function internalVarNode(name, prefixNum) {
	return t.identifier(`${INTERNAL_VAR_NAMES_PREFIX}${prefixNum || ''}_${name}`);
}
