/* --------------------
 * livepack module
 * Code instrumentation function to instrument AST
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, parse: pathParse} = require('path'),
	{ensureStatementsHoisted} = require('@babel/helper-module-transforms'),
	t = require('@babel/types');

// Imports
const Program = require('./visitors/program.js'),
	{
		escapeFilename, hoistSloppyFunctionDeclarations, createFunctionInfoFunction
	} = require('./visitors/function.js'),
	{
		createAndEnterBlock, createBindingWithoutNameCheck, createThisBinding, createArgumentsBinding,
		createNewTargetBinding
	} = require('./blocks.js'),
	{insertBlockVarsIntoBlockStatement} = require('./tracking.js'),
	{
		createTrackerVarNode, createGetScopeIdVarNode, createFnInfoVarNode, renameInternalVars
	} = require('./internalVars.js'),
	{visitKey} = require('./visit.js'),
	{hasUseStrictDirective, stringLiteralWithSingleQuotes} = require('./utils.js'),
	{getProp} = require('../shared/functions.js');

// Constants
const INIT_PATH = pathJoin(__dirname, '../init/index.js'),
	TOP_BLOCK_ID = 1;

// Exports

module.exports = modifyAst;

/**
 * Instrument AST.
 * Instrumentation occurs in 2 passes.
 * 1st pass:
 *   - Entire AST is traversed.
 *   - Bindings are created for variable declarations, function/class declarations,
 *     `this`, `arguments` and `super` targets.
 *   - A queue is created of actions to take in 2nd pass.
 *     Actions are added to queue when exiting nodes (rather than when entering them),
 *     so that in 2nd pass deeper nodes are processed first.
 * 2nd pass:
 *   - Bindings are created for sloppy-mode function declarations which are hoisted
 *     (where they are bound can only be determined once all other bindings are known).
 *   - Call the queue which was created in 1st pass, which adds the instrumentation code.
 *   - Add call to `init()` at top of file.
 *   - Insert function info functions.
 *
 * To see how files are instrumented, run Livepack with env var `LIVEPACK_DEBUG_INSTRUMENT` set.
 * e.g. `LIVEPACK_DEBUG_INSTRUMENT=1 npx livepack ...`
 *
 * @param {Object} ast - AST
 * @param {string} filename - File path
 * @param {boolean} isCommonJs - `true` if is CommonJS file
 * @param {boolean} isStrict - `true` if is strict mode code
 * @param {Object} [sources] - Sources object mapping file path to file content
 * @param {Object} [evalState] - State from eval outer context
 * @returns {Object} - Transformed AST
 */
function modifyAst(ast, filename, isCommonJs, isStrict, sources, evalState) {
	// Init state object
	const secondPassQueue = [];
	const state = {
		filename,
		filenameEscaped: escapeFilename(filename),
		nextBlockId: TOP_BLOCK_ID,
		currentBlock: undefined,
		currentThisBlock: undefined,
		currentSuperBlock: undefined,
		currentHoistBlock: undefined,
		fileBlock: undefined,
		programBlock: undefined,
		currentFunction: undefined,
		isStrict,
		currentSuperIsProto: false,
		fileNode: ast,
		trail: [],
		sloppyFunctionDeclarations: [],
		internalVarNodes: [],
		internalVarsPrefixNum: 0,
		trackerVarNode: undefined,
		getScopeIdVarNode: undefined,
		functions: [],
		fileContainsFunctionsOrEval: false,
		secondPass: (fn, ...params) => secondPassQueue.push({fn, params})
	};

	if (evalState) Object.assign(state, evalState);

	// Determine if strict mode
	if (!state.isStrict && (ast.program.sourceType === 'module' || hasUseStrictDirective(ast.program))) {
		state.isStrict = true;
	}

	// Create file block.
	const blockName = evalState ? 'eval' : pathParse(filename).name;
	const fileBlock = createAndEnterBlock(blockName, true, state);
	state.fileBlock = fileBlock;

	// Create program block
	const programBlock = createAndEnterBlock(blockName, true, state);
	state.programBlock = programBlock;
	// TODO: If code is a script or in indirect `(0, eval)(...)`,
	// `var` declarations and function declarations (including async functions + generator functions)
	// create globals, not local bindings.
	// In direct `eval()` they create bindings in hoist block external to the `eval()`.
	// So in both cases, there shouldn't be a hoist block.
	state.currentHoistBlock = programBlock;

	// Set file block's vars block to program block
	fileBlock.varsBlock = programBlock;

	if (isCommonJs) {
		// Create CommonJS var bindings.
		// `this` and `arguments` refer to `this` and `arguments` of the CommonJS wrapper function.
		for (const varName of ['module', 'exports', 'require']) {
			createBindingWithoutNameCheck(fileBlock, varName, {});
		}
		createThisBinding(fileBlock);
		createArgumentsBinding(fileBlock, false, ['exports', 'require', 'module']);
		createNewTargetBinding(fileBlock);
		state.currentThisBlock = fileBlock;
	} else if (!fileBlock.parent) {
		// Either ESM, or script context code, or code from inside indirect eval `(0, eval)()`.
		// NB: Only remaining possibility is direct `eval()` code, where `this` is already defined
		// in parent blocks from the outer context.
		// Create binding for `this` (which will be `undefined` in ESM, or `globalThis` in script context).
		// TODO: Uncomment next line.
		// It is correct, but producing excessively verbose output where indirect eval is used.
		// Need to remove references to `globalThis` where in output the code is run inside `(0, eval)()`
		// anyway, so `this` is already `globalThis` and unnecessary to inject it.
		// https://github.com/overlookmotel/livepack/issues/353
		// createThisBinding(fileBlock);

		state.currentThisBlock = fileBlock;
	} else if (!state.currentThisBlock) {
		// Code from direct `eval()` which doesn't provide a `this` binding.
		// TODO: This can be removed once `createThisBinding(fileBlock)` above is uncommented,
		// as then `state.currentThisBlock` will always be defined already in parent scope.
		state.currentThisBlock = fileBlock;
	}

	// Instrument AST
	modifyFirstPass(ast, state);
	modifySecondPass(ast, secondPassQueue, !!evalState, sources, state);

	// Pass state back to eval-handling code
	if (evalState) {
		evalState.nextBlockId = state.nextBlockId;
		evalState.internalVarsPrefixNum = state.internalVarsPrefixNum;
	}

	// Return AST
	return ast;
}

/**
 * Instrumentation first pass.
 * If an error is thrown, the error message is augmented with location in code where error occurred.
 * @param {Object} ast - AST
 * @param {Object} state - State object
 * @returns {undefined}
 */
function modifyFirstPass(ast, state) {
	try {
		visitKey(ast, 'program', Program, state);
	} catch (err) {
		rethrowErrorWithLocation(err, getCurrentNode(state), state);
	}
}

/**
 * Instrumentation second pass.
 * @param {Object} ast - AST
 * @param {Array<Object>} secondPassQueue - Queue of functions to call in 2nd pass
 * @param {boolean} isEvalCode - `true` if code is from within `eval()`
 * @param {Object} [sources] - Object mapping file paths to source code of file before instrumentation
 * @param {Object} state - State object
 * @returns {undefined}
 */
function modifySecondPass(ast, secondPassQueue, isEvalCode, sources, state) {
	state.trackerVarNode = createTrackerVarNode(state);
	state.getScopeIdVarNode = createGetScopeIdVarNode(state);

	const programNode = ast.program;

	// If file contains no functions or `eval`, needs no instrumentation
	if (state.fileContainsFunctionsOrEval) {
		hoistSloppyFunctionDeclarations(state);
		state.getSourcesNode = createFnInfoVarNode(0, state);
		processQueue(secondPassQueue, state);
		insertBlockVarsIntoBlockStatement(state.programBlock, programNode, state);
		insertFunctionInfoFunctions(programNode, isEvalCode, sources, state);
	}

	if (!isEvalCode) insertImportStatement(programNode, state);

	renameInternalVars(state);
}

/**
 * Call queue of functions which were queued in first pass.
 * If an error is thrown, the error message is augmented with location in code where error occurred.
 * @param {Array<Object>} secondPassQueue - Queue of functions to call
 * @param {Object} state - State object
 * @returns {undefined}
 */
function processQueue(secondPassQueue, state) {
	for (const {fn, params} of secondPassQueue) {
		try {
			fn(...params);
		} catch (err) {
			rethrowErrorWithLocation(err, params[0], state);
		}
	}
}

/**
 * Insert `require` statement at top of file (above `scopeId` definition)
 * to inject Livepack's internal functions.
 * @param {Object} programNode - Program AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertImportStatement(programNode, state) {
	// ```
	// const [livepack_tracker, livepack_getScopeId]
	//   = require('/path/to/app/node_modules/livepack/lib/init/index.js')
	//     ('/path/to/app/file.js', module, require, 100, 0);
	// ```
	const statementNode = t.variableDeclaration(
		'const', [
			t.variableDeclarator(
				t.arrayPattern([state.trackerVarNode, state.getScopeIdVarNode]),
				t.callExpression(
					t.callExpression(t.identifier('require'), [t.stringLiteral(INIT_PATH)]),
					[
						t.stringLiteral(state.filename),
						t.identifier('module'),
						t.identifier('require'),
						t.numericLiteral(state.nextBlockId),
						t.numericLiteral(state.internalVarsPrefixNum)
					]
				)
			)
		]
	);

	// Ensure this remains above headers added by `@babel/plugin-transform-modules-commonjs`
	ensureStatementsHoisted([statementNode]);

	programNode.body.unshift(statementNode);
}

/**
 * Insert function info functions.
 * @param {Object} programNode - Program AST node
 * @param {boolean} isEvalCode - `true` if is code from inside `eval()`
 * @param {Object} [sources] - Object mapping file path to source code for file
 *   (`undefined` if source maps disabled)
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertFunctionInfoFunctions(programNode, isEvalCode, sources, state) {
	if (state.functions.length === 0) return;

	const functionInfoNodes = state.functions.map(fn => createFunctionInfoFunction(fn, state));

	// Insert function to get sources
	functionInfoNodes.push(
		t.functionDeclaration(state.getSourcesNode, [], t.blockStatement([
			t.returnStatement(stringLiteralWithSingleQuotes(sources ? JSON.stringify(sources) : '{}'))
		]))
	);

	if (!isEvalCode || state.isStrict) {
		// Insert at bottom of file
		programNode.body.push(...functionInfoNodes);
	} else {
		// Sloppy mode eval code - convert function info functions to const statement and add to top.
		// Otherwise function declarations would be hoisted to scope outside the `eval()`,
		// or to global scope in indirect `eval`.
		programNode.body.unshift(t.variableDeclaration('const', functionInfoNodes.map((fnInfoNode) => {
			fnInfoNode.type = 'FunctionExpression';
			const idNode = fnInfoNode.id;
			fnInfoNode.id = null;
			return t.variableDeclarator(idNode, fnInfoNode);
		})));
	}
}

/**
 * Get current AST node, to get location where instrumentation failed and threw error.
 * Uses current function node and trail to get node. If no node at that trail, get parent node.
 * This is needed in case error caused by attempting to visit a null node.
 * @param {Object} state - State object
 * @returns {Object} - Current AST node
 */
function getCurrentNode(state) {
	const {currentFunction: fn, trail} = state,
		rootNode = fn ? fn.node : state.fileNode;
	let node;
	for (let len = trail.length; len > 0; len--) {
		node = getProp(rootNode, trail, len);
		if (node) return node;
	}
	return rootNode;
}

/**
 * Add location info to error and throw it.
 * @param {*} err - Error thrown
 * @param {Object} node - AST node which was being instrumented when error thrown
 * @param {Object} state - State object
 * @returns {undefined}
 * @throws {Error} - Error with augumented message
 */
function rethrowErrorWithLocation(err, node, state) {
	if (!err || !(err instanceof Error)) err = new Error('Unknown error');

	let location;
	const {loc} = node;
	if (loc) {
		const [line, column] = loc.start ? [loc.start.line, loc.start.column + 1] : ['?', '?'];
		location = `${loc.filename || state.filename}:${line}:${column}`;
	} else {
		location = state.filename;
	}
	err.message = `Error instrumenting: ${location}\n${err.message}`;

	throw err;
}
