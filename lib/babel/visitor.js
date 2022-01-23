/* --------------------
 * livepack module
 * Babel plugin visitor
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, parse: pathParse} = require('path'),
	{ensureStatementsHoisted} = require('@babel/helper-module-transforms'),
	mapValues = require('lodash/mapValues'),
	t = require('@babel/types');

// Imports
const {
		functionDeclarationEnterVisitor, functionExpressionEnterVisitor,
		arrowFunctionEnterVisitor, classMethodEnterVisitor, methodEnterVisitor, exitMethodKey,
		functionDeclarationExitVisitor, functionExpressionExitVisitor,
		arrowFunctionExitVisitor, classMethodExitVisitor, methodExitVisitor
	} = require('./functions.js'),
	{classEnterVisitor, classBodyExitVisitor, classExitVisitor} = require('./classes.js'),
	{blockStatementEnterVisitor, blockStatementExitVisitor, createBlockProps} = require('./blocks.js'),
	identifierVisitor = require('./identifiers.js'),
	{callExpressionExitVisitor} = require('./eval.js'),
	{thisExpressionVisitor} = require('./thisArguments.js'),
	superVisitor = require('./super.js'),
	{objectExpressionEnterVisitor, objectExpressionExitVisitor} = require('./objects.js'),
	{forOrWhileEnterVisitor, forOrWhileExitVisitor} = require('./forWhile.js'),
	catchClauseVisitor = require('./catch.js'),
	switchStatementVisitor = require('./switch.js'),
	importVisitor = require('./import.js'),
	{initFunctionAstSerialization, unpatchNodeToJson} = require('./ast.js'),
	{insertComment, containsUseStrictDirective} = require('./utils.js'),
	{
		createTrackerVarNode, createGetScopeIdVarNode, createFnInfoVarNode,
		createEvalVarNode, createPrevalVarNode, createGetEvalVarNode,
		renameInternalVars
	} = require('./internalVars.js'),
	{BODY_BLOCK} = require('./symbols.js'),
	{TRANSFORMED_COMMENT} = require('../shared/constants.js');

// Constants
const INIT_PATH = pathJoin(__dirname, '../init/index.js'),
	EVAL_PATH = pathJoin(__dirname, '../init/eval.js'),
	TOP_BLOCK_ID = 1;

// Exports

/**
 * Visitor to add tracking to program.
 * Traverses entire AST tree.
 * @param {Object} programPath - Babel path object for program
 * @param {Object} [babelState] - Babel state object for file (not provided if code is from inside eval)
 * @param {Object} [evalState] - Livepack state object (only provided if code is from inside eval)
 * @returns {Object} - Livepack state object
 */
module.exports = function(programPath, babelState, evalState) {
	// Prepare for traversal
	const state = programEnterVisitor(programPath, babelState, evalState);

	// Traverse AST tree
	programPath.traverse({
		enter: path => nodeEnterVisitor(path, state),
		exit: path => nodeExitVisitor(path, state),
		// Exit visitors for functions and classes are called by `nodeExitVisitor()`
		FunctionDeclaration: path => functionDeclarationEnterVisitor(path, state),
		FunctionExpression: path => functionExpressionEnterVisitor(path, state),
		ArrowFunctionExpression: path => arrowFunctionEnterVisitor(path, state),
		ClassMethod: path => classMethodEnterVisitor(path, state),
		ObjectMethod: path => methodEnterVisitor(path, state),
		ClassPrivateMethod: path => methodEnterVisitor(path, state),
		Class: path => classEnterVisitor(path, state),
		ClassBody: {
			exit: path => classBodyExitVisitor(path, state)
		},
		BlockStatement: {
			enter: path => blockStatementEnterVisitor(path, state),
			exit: path => blockStatementExitVisitor(path, state)
		},
		Identifier: path => identifierVisitor(path, state),
		CallExpression: {
			exit: path => callExpressionExitVisitor(path, state)
		},
		ThisExpression: () => thisExpressionVisitor(state),
		Super: path => superVisitor(path, state),
		ObjectExpression: {
			enter: path => objectExpressionEnterVisitor(path, state),
			exit: path => objectExpressionExitVisitor(path, state)
		},
		For: {
			enter: path => forOrWhileEnterVisitor(path, state),
			exit: path => forOrWhileExitVisitor(path, state)
		},
		While: {
			enter: path => forOrWhileEnterVisitor(path, state),
			exit: path => forOrWhileExitVisitor(path, state)
		},
		CatchClause: path => catchClauseVisitor(path, state),
		SwitchStatement: path => switchStatementVisitor(path, state),
		Import: () => importVisitor(state)
	});

	// Insert tracker + init statements at top of file
	programExitVisitor(programPath, state, !!evalState);

	// Pass updated state back to `codeToAst()` if processing code from inside eval
	return state;
};

/**
 * Visitor to init state for file.
 * @param {Object} programPath - Babel path object for program
 * @param {Object} [babelState] - Babel state object for file
 * @param {Object} [evalState] - Livepack state object
 * @returns {Object} - Livepack state object
 */
function programEnterVisitor(programPath, babelState, evalState) {
	// Init state
	const filename = babelState ? babelState.file.opts.filename : undefined,
		sources = Object.create(null);
	const state = {
		filename,
		blockId: TOP_BLOCK_ID,
		parentVars: Object.create(null),
		isCommonJs: !!babelState && babelState.file.opts.sourceType === 'script',
		isStrict: false,
		topLevelIsStrict: false,
		trackerVarNode: undefined,
		getScopeIdVarNode: undefined,
		programPath,
		fns: [],
		currentFunction: undefined,
		currentFullFunction: undefined,
		currentBlock: undefined,
		programBlock: undefined,
		trail: [],
		internalVarsPrefixNum: 0,
		internalVarNodes: [],
		topLevelVarNames: new Set(),
		evalIsUsed: false,
		sources
	};

	// Inherit state if processing code from inside eval
	if (evalState) Object.assign(state, evalState);

	// Determine if file is strict mode
	if (containsUseStrictDirective(programPath.node)) state.topLevelIsStrict = true;
	state.isStrict = state.topLevelIsStrict;

	// Create nodes for tracker + getScopeId vars
	state.trackerVarNode = createTrackerVarNode(state);
	state.getScopeIdVarNode = createGetScopeIdVarNode(state);

	// Set custom `.toJSON()` prototype method on Babel's `Node` class for serializing functions' ASTs
	// and record files' source code
	initFunctionAstSerialization(programPath, filename, babelState, sources);

	// Enter block for program
	const blockName = filename ? pathParse(filename).name : undefined;
	const programBlock = createBlockProps(blockName, true, state);
	state.currentBlock = state.programBlock = programPath[BODY_BLOCK] = programBlock;

	// Return state object
	return state;
}

/**
 * Visitor to insert tracker + init statements at top of file.
 * @param {Object} programPath - Babel path object for program
 * @param {Object} state - State object
 * @param {boolean} isEval - `true` if is code produced by `eval()`
 * @returns {undefined}
 */
function programExitVisitor(programPath, state, isEval) {
	// Remove `Node.prototype.toJSON()` method added previously
	unpatchNodeToJson();

	// Insert `const livepack_scopeId_1 = livepack_getScopeId();` and any temp vars
	// at top of file, if file scope referenced
	blockStatementExitVisitor(programPath, state);

	// Insert function info getter functions at bottom of file
	insertFnInfoFunctions(programPath, state, isEval);

	// Insert `init` + `eval` import statements at top of file
	if (!isEval) insertImportStatements(programPath, state);

	// Rename internal vars so they don't clash with existing vars
	renameInternalVars(state);
}

/**
 * Insert `import` / `require` statements at top of file to inject Livepack's internal functions.
 * @param {Object} programPath - Babel path object for program
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertImportStatements(programPath, state) {
	// Insert init import statement at top of file (above `scopeId` definition)
	// eslint-disable-next-line max-len
	// `const [livepack_tracker, livepack_getScopeId] = require('/path/to/app/node_modules/livepack/lib/init/index.js')(__filename, module, require);`
	const statementNodes = [
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					t.arrayPattern([state.trackerVarNode, state.getScopeIdVarNode]),
					t.callExpression(
						t.callExpression(t.identifier('require'), [t.stringLiteral(INIT_PATH)]),
						[t.identifier('__filename'), t.identifier('module'), t.identifier('require')]
					)
				)
			]
		)
	];

	// Insert eval import statement at top of file
	if (state.evalIsUsed) {
		statementNodes.push(
			t.variableDeclaration(
				'const', [
					t.variableDeclarator(
						t.arrayPattern([
							createEvalVarNode(state),
							createPrevalVarNode(state),
							createGetEvalVarNode(state)
						]),
						t.callExpression(
							t.callExpression(t.identifier('require'), [t.stringLiteral(EVAL_PATH)]),
							[
								t.identifier('__filename'),
								t.numericLiteral(state.blockId),
								t.numericLiteral(state.internalVarsPrefixNum)
							]
						)
					)
				]
			)
		);
	}

	// Insert `/*livepack_babel_transformed*/` comment at top of file
	const {node} = programPath;
	insertComment(node, 'leading', TRANSFORMED_COMMENT);

	// Ensure these headers remain above headers added by @babel/plugin-transform-modules-commonjs
	ensureStatementsHoisted(statementNodes);

	node.body.unshift(...statementNodes);
}

/**
 * Insert function info functions at bottom of file (or at top if is eval code).
 * @param {Object} programPath - Babel path object for program
 * @param {Object} state - State object
 * @param {boolean} isEval - `true` if code is from inside `eval()`
 * @returns {undefined}
 */
function insertFnInfoFunctions(programPath, state, isEval) {
	const getSourcesNode = createFnInfoVarNode(0, state);

	// Insert functions to get functions' info and ASTs
	const fnNodes = [];
	for (const fn of state.fns) {
		// Create JSON function info string
		const {id, children} = fn;
		let json = JSON.stringify({
			scopes: fn.scopes.map(({block, vars}) => ({
				blockId: block.id,
				blockName: block.name,
				vars: mapValues(vars, varProps => ({
					isReadFrom: varProps.isReadFrom || undefined,
					isAssignedTo: varProps.isAssignedTo || undefined,
					isFunction: varProps.isFunction || undefined,
					trails: varProps.trails
				}))
			})),
			isStrict: fn.isStrict || undefined,
			superIsProto: fn.superIsProto || undefined,
			containsEval: fn.containsEval || undefined,
			containsImport: fn.containsImport || undefined,
			argNames: fn.argNames,
			internalVars: fn.internalVars,
			globalVarNames: fn.globalVarNames.size > 0 ? [...fn.globalVarNames] : undefined,
			amendments: fn.amendments.length > 0
				? fn.amendments.map(({type, blockId, trail}) => [type, blockId, ...trail])
				: undefined,
			numClassChildren: fn.numClassChildren,
			hasSuperClass: fn.hasSuperClass || undefined,
			firstSuperStatementIndex: fn.firstSuperStatementIndex,
			returnsSuper: fn.returnsSuper || undefined,
			childFns: children.map(childFn => childFn.trail)
		});

		// Add AST JSON to JSON
		json = `${json.slice(0, -1)},"ast":${fn.astJson}}`;

		// Create function returning JSON string and references to function info function for child fns.
		// Make output as single-quoted string for shorter output (not escaping every `"`).
		fnNodes.push(
			t.functionDeclaration(createFnInfoVarNode(id, state), [], t.blockStatement([
				t.returnStatement(t.arrayExpression([
					stringLiteralWithSingleQuotes(json),
					t.arrayExpression(children.map(childFn => createFnInfoVarNode(childFn.id, state))),
					getSourcesNode
				]))
			]))
		);
	}

	// Insert function to get sources
	fnNodes.push(
		t.functionDeclaration(getSourcesNode, [], t.blockStatement([
			t.returnStatement(t.stringLiteral(JSON.stringify(state.sources)))
		]))
	);

	// Insert functions at bottom, unless is eval code in which case insert at top
	const programBodyNodes = programPath.node.body;
	if (isEval) {
		programBodyNodes.unshift(...fnNodes);
	} else {
		programBodyNodes.push(...fnNodes);
	}
}

/**
 * Create string literal AST node with single quotes.
 * @param {string} str - String
 * @returns {Object} - AST node for string literal
 */
function stringLiteralWithSingleQuotes(str) {
	const strNode = t.stringLiteral(str);
	strNode.extra = {
		rawValue: str,
		raw: `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
	};
	return strNode;
}

/**
 * Visitor for all nodes, to update trail on entry.
 * This visitor is called before visitors for specific node types e.g. `functionEnterVisitor()`.
 * @param {Object} path - Babel path object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function nodeEnterVisitor(path, state) {
	const {trail} = state,
		{listKey} = path;
	if (listKey) trail.push(listKey);
	trail.push(path.key);
}

/**
 * Visitor for all nodes, to update trail on exit.
 * This visitor is called before visitors for specific node types.
 * Calls function/class visitors if is a class or function.
 * These exit visitors need to alter trail before items are popped off it.
 * @param {Object} path - Babel path object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function nodeExitVisitor(path, state) {
	// Call function/class exit visitors
	const {type} = path;
	if (type === 'FunctionDeclaration') {
		functionDeclarationExitVisitor(path, state);
	} else if (type === 'FunctionExpression') {
		functionExpressionExitVisitor(path, state);
	} else if (type === 'ArrowFunctionExpression') {
		arrowFunctionExitVisitor(path, state);
	} else if (type === 'ClassMethod') {
		classMethodExitVisitor(path, state);
	} else if (type === 'ObjectMethod' || type === 'ClassPrivateMethod') {
		methodExitVisitor(path, state);
	} else if (type === 'ClassDeclaration' || type === 'ClassExpression') {
		classExitVisitor(path, state);
	}

	// Set trail back to as was before entering node
	state.trail.length -= path.listKey ? 2 : 1;

	// If exiting method key, enter the method
	const {parentPath} = path;
	if (path.key === 'key' && parentPath.isMethod() && parentPath.node.kind !== 'constructor') {
		exitMethodKey(parentPath, state);
	}
}
