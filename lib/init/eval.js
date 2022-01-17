/* --------------------
 * livepack module
 * Replacements for `eval` which Babel-compile code before executing.
 * These are injected into compiled code in Babel plugin.
 * ------------------*/

'use strict';

// Modules
const {parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	generate = require('@babel/generator').default,
	{isString} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const visitor = require('../babel/visitor.js'),
	{
		EVAL, INTERNAL_VAR_NAMES_PREFIX, TRACKER_VAR_NAME_BODY, GET_SCOPE_ID_VAR_NAME_BODY,
		EVAL_VAR_NAME_BODY, PREVAL_VAR_NAME_BODY, GET_EVAL_VAR_NAME_BODY
	} = require('../shared/constants.js'),
	{globals} = require('../shared/internal.js'),
	{tracker} = require('../shared/tracker.js'),
	getScopeId = require('./getScopeId.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

// Record of next block ID to use for each file (object keyed by file path)
const blockIds = Object.create(null);

module.exports = function(filename, nextBlockId, prefixNum) {
	blockIds[filename] = nextBlockId;
	return getEvalFunctions(filename, prefixNum);
};

function getEvalFunctions(filename, prefixNum) {
	const evalLocal = {
		eval(code) {
			return evalShim(code, filename, evalLocal);
		}
	}.eval;
	const prevalLocal = (code, vars, isStrict, argNames) => preval(
		code, vars, isStrict, argNames, filename, prefixNum
	);
	const getEvalLocal = internalPrefixNum => getEvalFunctions(filename, internalPrefixNum);

	// Record eval shim so it can be switched back to `eval` if it's serialized
	globals.set(evalLocal, {type: EVAL, parent: null, key: 'eval'});

	return [evalLocal, prevalLocal, getEvalLocal];
}

function evalShim(code, filename, evalLocal) {
	// If `code` arg is not a string, eval it unchanged - it won't be evaluated as code
	if (!isString(code)) return (0, eval)(code); // eslint-disable-line no-eval

	// Compile code with no external scope.
	// Code returned is for a function which takes arguments `(livepack_tracker, livepack_getScopeId)`,
	// or `(livepack_tracker, livepack_getScopeId, livepack_eval, livepack_preval, livepack_getEval)`
	// if code itself uses `eval`.
	// Use var prefix num 0 since this code doesn't refer to any vars outside its scope.
	const {code: fnCode, usesEval, internalPrefixNum, errored} = compile(code, filename, null, false, 0);
	if (errored) {
		try {
			(0, eval)(code); // eslint-disable-line no-eval
		} catch (err) {
			Error.captureStackTrace(err, evalLocal);
			throw err;
		}

		// Eval-ing code should have thrown - parsing has failed
		assertBug(
			false,
			'Failed to parse `eval` expression',
			() => `Eval expression: ${JSON.stringify(code)}`
		);
	}

	// `eval()` code without external scope and inject in livepack's vars
	const fn = (0, eval)(fnCode); // eslint-disable-line no-eval
	if (!usesEval) return fn(tracker, getScopeId);
	return fn(tracker, getScopeId, ...getEvalFunctions(filename, internalPrefixNum));
}

function preval(code, vars, isStrict, argNames, filename, prefixNum) {
	// If `code` arg is not a string, return unchanged - it won't be evaluated as code
	if (!isString(code)) return code;

	// Compile scope vars object, of form:
	// `{x: {blockId: 1, scopeId: 1, blockName: 'index', isConst: true, argNames: undefined}, y: ...}`
	const scopeVars = Object.create(null);
	for (const [varName, blockId, scopeId, blockName, isConst, isSilentConst] of vars) {
		scopeVars[varName] = {
			blockId,
			scopeId,
			blockName,
			isConst: !!isConst,
			isSilentConst: !!isSilentConst,
			argNames: varName === 'arguments' ? argNames : undefined
		};
	}

	// Compile to executable code with tracking code inserted.
	// If var names prefix inside code has to be different from outside,
	// code is wrapped in an IIFE which renames the tracker/eval functions:
	// `(() => foo)` ->
	// `((livepack1_tracker, livepack1_getScopeId) => () => foo)(livepack_tracker, livepack_getScopeId)`
	return compile(code, filename, scopeVars, isStrict, prefixNum).code;
}

function compile(code, filename, scopeVars, isStrict, externalPrefixNum) {
	const {ast, internalPrefixNum, usesEval} = codeToAst(
		code, filename, scopeVars, isStrict, externalPrefixNum
	);
	if (!ast) return {code, errored: true};

	if (internalPrefixNum !== externalPrefixNum || !scopeVars) {
		let node = getFunctionBody(ast);
		node = wrapInFunction(node, internalPrefixNum, usesEval);
		if (scopeVars) node = wrapInFunctionCall(node, internalPrefixNum, externalPrefixNum, usesEval);
		ast.program.body = [t.expressionStatement(node)];
	}

	return {
		code: generateFromAst(ast),
		internalPrefixNum,
		usesEval
	};
}

function codeToAst(code, filename, scopeVars, isStrict, externalPrefixNum) {
	// Parse code.
	// If Babel cannot parse, swallow error. Expression will be passed to `eval()`
	// which should throw - this maintains native errors.
	let ast;
	try {
		ast = parse(code, {strictMode: isStrict});
	} catch (err) {
		return {};
	}

	// Transform with Babel plugin.
	// Filename in eval code will be same as host file.
	// Block IDs in created code will be higher than block IDs used in this file (to avoid clashes).
	// Var name prefix will be kept same as in host file if possible,
	// to avoid wrapping in a function unless impossible to avoid.
	// Details of vars which can be obtained from external scopes is passed in.
	let state;
	traverse(ast, {
		Program: {
			exit(path) {
				state = visitor(path, undefined, {
					filename,
					blockId: blockIds[filename],
					...(scopeVars ? {parentVars: scopeVars} : null),
					topLevelIsStrict: isStrict,
					internalVarsPrefixNum: externalPrefixNum
				});
			}
		}
	});

	// Update next block ID for this file, so further `eval`-ed code gets block IDs which don't clash
	blockIds[filename] = state.blockId;

	return {
		ast,
		internalPrefixNum: state.internalVarsPrefixNum,
		usesEval: state.evalIsUsed
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

function wrapInFunction(bodyNode, internalPrefixNum, usesEval) {
	const varNodes = [
		internalVarNode(TRACKER_VAR_NAME_BODY, internalPrefixNum),
		internalVarNode(GET_SCOPE_ID_VAR_NAME_BODY, internalPrefixNum)
	];

	if (usesEval) {
		varNodes.push(
			internalVarNode(EVAL_VAR_NAME_BODY, internalPrefixNum),
			internalVarNode(PREVAL_VAR_NAME_BODY, internalPrefixNum),
			internalVarNode(GET_EVAL_VAR_NAME_BODY, internalPrefixNum)
		);
	}

	return t.arrowFunctionExpression(varNodes, bodyNode);
}

function wrapInFunctionCall(bodyNode, internalPrefixNum, externalPrefixNum, usesEval) {
	const varNodes = [
		internalVarNode(TRACKER_VAR_NAME_BODY, externalPrefixNum),
		internalVarNode(GET_SCOPE_ID_VAR_NAME_BODY, externalPrefixNum)
	];

	if (usesEval) {
		varNodes.push(
			t.spreadElement(
				t.callExpression(
					internalVarNode(GET_EVAL_VAR_NAME_BODY, externalPrefixNum),
					[t.numericLiteral(internalPrefixNum)]
				)
			)
		);
	}

	return t.callExpression(bodyNode, varNodes);
}

function generateFromAst(ast) {
	return generate(ast, {retainLines: true, compact: true}).code;
}

function internalVarNode(name, prefixNum) {
	return t.identifier(`${INTERNAL_VAR_NAMES_PREFIX}${prefixNum || ''}_${name}`);
}
