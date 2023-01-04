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
	{escapeFilename, hoistSloppyFunctionDeclarations} = require('./visitors/function.js'),
	{
		createAndEnterBlock, createBindingWithoutNameCheck, createThisBinding, createArgumentsBinding,
		createNewTargetBinding
	} = require('./blocks.js'),
	{insertBlockVarsIntoBlockStatement} = require('./tracking.js'),
	{createTrackerVarNode, createGetScopeIdVarNode, createFnInfoVarNode} = require('./internalVars.js'),
	{visitKey} = require('./visit.js'),
	{hasUseStrictDirective, stringLiteralWithSingleQuotes} = require('./utils.js'),
	{getProp} = require('../shared/functions.js'),
	{TOP_BLOCK_ID} = require('../shared/constants.js');

// Constants
const INIT_PATH = pathJoin(__dirname, '../init/index.js');

// Exports

module.exports = modifyAst;

/**
 * Instrument AST.
 * Instrumentation occurs in 2 passes:
 *
 * 1st pass:
 *   - Entire AST is traversed.
 *   - Bindings are created for variable declarations, function/class declarations,
 *     `this`, `arguments` and `super` targets.
 *   - A queue is created of actions to take in 2nd pass.
 *     Actions are added to queue when exiting nodes (rather than when entering them),
 *     so that in 2nd pass deeper nodes are processed first.
 *   - Identify any variables in code which would clash with Livepack's internal vars
 *     and determine prefix num for internal vars names.
 *
 * 2nd pass:
 *   - Bindings are created for sloppy-mode function declarations which are hoisted
 *     (whether they are hoisted can only be determined once all other bindings are known).
 *   - Call the queue which was created in 1st pass, which adds the instrumentation code.
 *   - Add call to `init()` at top of file.
 *   - Insert function info functions.
 *
 * The following must only be done in 2nd pass:
 *   - Modifying the AST in any way.
 *   - Resolving bindings i.e. work out what variable `x` refers to.
 *     This can only be accurately determined once 1st pass is complete
 *     (except for `this`, `new.target` and `super` target which are lexically bound).
 *   - Create internal vars e.g. `livepack_temp`.
 *     This can only be done in 2nd pass, because it's not until end of 1st pass that prefix num
 *     for internal vars is determined.
 *   - Activate blocks (i.e. flag that vars in a block are accessed).
 *     Must be 2nd pass, because creates internal var `livepack_scopeId`.
 *     This is true even for lexically-bound vars e.g. `this`.
 *   - Activate bindings (i.e. flag that a binding is used).
 *     This can create internal vars in some cases. e.g. where var name is `eval`.
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
		isCommonJs,
		currentSuperIsProto: false,
		fileNode: ast,
		trail: [],
		sloppyFunctionDeclarations: [],
		internalVarsPrefixNum: 0,
		internalVarsPrefixNumHasChanged: false,
		trackerVarNode: undefined,
		getScopeIdVarNode: undefined,
		functionInfoNodes: [],
		externalEvalBinding: undefined,
		externalEvalIsProxied: false,
		fileContainsFunctionsOrEval: false,
		secondPass: (fn, ...params) => secondPassQueue.push({fn, params})
	};

	if (evalState) Object.assign(state, evalState);

	// Determine if strict mode
	if (!state.isStrict && (ast.program.sourceType === 'module' || hasUseStrictDirective(ast.program))) {
		state.isStrict = true;
	}

	// Create file block, unless inheritied (in direct `eval()`)
	const blockName = evalState ? 'eval' : pathParse(filename).name;
	let {fileBlock} = state;
	const hasNoInheritedFileBlock = !fileBlock;
	if (hasNoInheritedFileBlock) {
		fileBlock = createAndEnterBlock(blockName, true, state);
		state.fileBlock = state.currentBlock = fileBlock;
		state.currentThisBlock = fileBlock;

		if (isCommonJs) {
			// Create CommonJS var bindings.
			// `this` and `arguments` refer to `this` and `arguments` of the CommonJS wrapper function.
			for (const varName of ['module', 'exports', 'require']) {
				createBindingWithoutNameCheck(fileBlock, varName, {});
			}
			createThisBinding(fileBlock);
			createArgumentsBinding(fileBlock, false, ['exports', 'require', 'module']);
			createNewTargetBinding(fileBlock);
		}
		/*
		else {
			// Either ESM, or script context code, or code from inside indirect eval `(0, eval)()`.
			// NB Only remaining possibility is direct `eval()` code, where `this` is already defined
			// in parent blocks from the outer context.
			// Create binding for `this` (which will be `undefined` in ESM, or `globalThis` in script context).
			// TODO Uncomment this.
			// It is correct, but producing excessively verbose output where indirect eval is used.
			// Need to remove references to `globalThis` where in output the code is run inside `(0, eval)()`
			// anyway, so `this` is already `globalThis` and unnecessary to inject it.
			// https://github.com/overlookmotel/livepack/issues/353
			createThisBinding(fileBlock);
		}
		*/
	}

	// Create program block
	const programBlock = createAndEnterBlock(blockName, true, state);
	state.programBlock = programBlock;

	// Make program block hoist block if CommonJS or ESM, or `eval()` in strict mode.
	// In strict mode direct or indirect `eval()`, program is hoist block.
	// In sloppy mode direct `eval()`, hoist block is inherited from outside context.
	// In sloppy mode indirect `eval`, there is no hoist block - top level `var` declarations
	//   and function declarations create globals, not local bindings.
	if (state.isStrict || (hasNoInheritedFileBlock && !evalState)) {
		state.currentHoistBlock = programBlock;
	}

	// Set file block's vars block to program block
	if (hasNoInheritedFileBlock) fileBlock.varsBlock = programBlock;

	// Instrument AST
	modifyFirstPass(ast, state);
	modifySecondPass(ast, secondPassQueue, !!evalState, sources, state);

	// Pass state back to eval-handling code
	if (evalState) evalState.state = state;

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
		determineIfExternalEvalNeedsProxy(state);
		hoistSloppyFunctionDeclarations(state);
		state.getSourcesNode = createFnInfoVarNode(0, state);
		processQueue(secondPassQueue, state);
		insertBlockVarsIntoBlockStatement(state.programBlock, programNode, state);
		insertFunctionInfoFunctions(programNode, isEvalCode, sources, state);
	}

	if (!isEvalCode) insertImportStatement(programNode, state);
}

/**
 * If all of the following are true:
 *   1. This "program" is code running inside `eval()`
 *   2. Internal vars prefix num is changing inside `eval()`
 *   3. Code inside `eval()` has access to a var called `eval` from outside `eval()`
 *   4. That var `eval` is not a const
 * then need to access it via a proxy.
 *
 * Don't need to consider the case where `eval` is a "silent const" (i.e. function expression name)
 * because it's impossible. Code now being instrumented was run in a direct `eval()` call,
 * so the var `eval` must have been global `eval`. This isn't possible if `eval` was defined as a
 * function expression.
 *
 * @param {Object} state - State object
 * @returns {undefined}
 */
function determineIfExternalEvalNeedsProxy(state) {
	if (
		state.internalVarsPrefixNumHasChanged && !state.externalEvalIsProxied
		&& state.externalEvalBinding && !state.externalEvalBinding.isConst
	) state.externalEvalIsProxied = true;
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
	const {functionInfoNodes} = state;
	if (functionInfoNodes.length === 0) return;

	// Insert function to get sources
	functionInfoNodes.push(
		t.functionDeclaration(state.getSourcesNode, [], t.blockStatement([
			t.returnStatement(stringLiteralWithSingleQuotes(sources ? JSON.stringify(sources) : '{}'))
		]))
	);

	// Insert at bottom of file, or top in eval code.
	// In eval code, convert function declarations to `const` declarations
	// so they don't escape to outer scope in sloppy mode.
	if (isEvalCode) {
		programNode.body.unshift(t.variableDeclaration('const', functionInfoNodes.map((fnNode) => {
			const idNode = fnNode.id;
			fnNode.type = 'FunctionExpression';
			fnNode.id = null;
			return t.variableDeclarator(idNode, fnNode);
		})));
	} else {
		programNode.body.push(...functionInfoNodes);
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
