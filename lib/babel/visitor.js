/* --------------------
 * livepack module
 * Babel plugin visitor
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, parse: pathParse} = require('path'),
	{ensureStatementsHoisted} = require('@babel/helper-module-transforms'),
	t = require('@babel/types');

// Imports
const {initFunctionAstSerialization, unpatchNodeToJson} = require('./ast.js'),
	{
		recordVarUse, createTrackerComment, createBlockId, getOrCreateScope,
		replaceWith, addComment, assertWithLocation
	} = require('./utils.js'),
	{
		checkInternalVarNameClash,
		createTrackerVarNode, createGetScopeIdVarNode, createTempVarNode, createAstVarNode,
		createEvalVarNode, createPrevalVarNode, createGetEvalVarNode, getEvalVarName,
		addToInternalVars, renameInternalVars
	} = require('./internalVars.js'),
	{
		FUNCTION_PROPS, NAME_BLOCK, PARAMS_BLOCK, BODY_BLOCK, SUPER_VAR_NODE, SUPER_VARS
	} = require('./symbols.js'),
	{identifierIsVariable, isReservedWord} = require('../shared/functions.js'),
	{COMMON_JS_LOCAL_VAR_NAMES, TRANSFORMED_COMMENT} = require('../shared/constants.js');

// Constants
const INIT_PATH = pathJoin(__dirname, '../init/index.js'),
	EVAL_PATH = pathJoin(__dirname, '../init/eval.js'),
	TOP_BLOCK_ID = 1,
	COMMON_JS_VARS = new Set(COMMON_JS_LOCAL_VAR_NAMES);

// Exports

const undefinedNode = t.unaryExpression('void', t.numericLiteral(0));

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
		Class: path => classEnterVisitor(path, state),
		FunctionDeclaration: path => functionDeclarationEnterVisitor(path, state),
		FunctionExpression: path => functionExpressionEnterVisitor(path, state),
		ArrowFunctionExpression: path => arrowFunctionEnterVisitor(path, state),
		Method: path => methodEnterVisitor(path, state),
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
		CatchClause: {
			enter: path => catchClauseEnterVisitor(path, state),
			exit: path => catchClauseExitVisitor(path, state)
		},
		BlockStatement: {
			enter: path => blockStatementEnterVisitor(path, state),
			exit: path => blockStatementExitVisitor(path, state)
		},
		Identifier: path => identifierVisitor(path, state),
		CallExpression: {
			exit: path => callExpressionExitVisitor(path, state)
		},
		ThisExpression: path => thisExpressionVisitor(path, state),
		Super: path => superVisitor(path, state)
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
	if (containsUseStrictDirective(programPath)) state.topLevelIsStrict = true;

	// Create nodes for tracker + getScopeId vars
	state.trackerVarNode = createTrackerVarNode(state);
	state.getScopeIdVarNode = createGetScopeIdVarNode(state);

	// Set custom `.toJSON()` prototype method on Babel's `Node` class for serializing functions' ASTs
	// and record files' source code
	initFunctionAstSerialization(programPath, filename, babelState, sources);

	// Enter block for program
	const programBlock = createBlockProps(filename ? pathParse(filename).name : undefined, true, state);
	state.programBlock = programBlock;
	state.currentBlock = programBlock;
	programPath[BODY_BLOCK] = programBlock;

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

	// Insert `const livepack_scopeId_1 = livepack_tracker();` at top of file if file scope referenced
	blockStatementExitVisitor(programPath, state);

	// Insert AST getter functions at bottom of file
	insertAstFunctions(programPath, state, isEval);

	// Insert `init` + `eval` import statements at top of file
	if (!isEval) insertImportStatements(programPath, state);

	// Rename internal vars so they don't clash with existing vars
	renameInternalVars(state);
}

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
	addComment(node, 'leading', TRANSFORMED_COMMENT);

	// Ensure these headers remain above headers added by @babel/plugin-transform-modules-commonjs
	ensureStatementsHoisted(statementNodes);

	node.body.unshift(...statementNodes);
}

function insertAstFunctions(programPath, state, isEval) {
	const getSourcesNode = createAstVarNode(0, state);

	// Insert functions to get functions' ASTs
	const fnNodes = [];
	for (const {id, astJson, children} of state.fns) {
		// Create node for JSON string.
		// Make output as single-quoted string for shorter output (not escaping every `"`).
		const childFnTrails = children.map(childFn => childFn.trail);
		const json = `{"ast":${astJson},${JSON.stringify({childFns: childFnTrails}).slice(1)}`;

		fnNodes.push(
			t.functionDeclaration(createAstVarNode(id, state), [], t.blockStatement([
				t.returnStatement(t.arrayExpression([
					stringLiteralWithSingleQuotes(json),
					t.arrayExpression(children.map(childFn => createAstVarNode(childFn.id, state))),
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

	// Insert functions at bottom, unless is eval code in which case insert at start
	const programBodyNodes = programPath.node.body;
	if (isEval) {
		programBodyNodes.unshift(...fnNodes);
	} else {
		programBodyNodes.push(...fnNodes);
	}
}

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
	// Class function / class exit visitor
	const {type} = path;
	if (type === 'FunctionDeclaration') {
		functionDeclarationExitVisitor(path, state);
	} else if (type === 'FunctionExpression') {
		functionExpressionExitVisitor(path, state);
	} else if (type === 'ArrowFunctionExpression') {
		arrowFunctionExitVisitor(path, state);
	} else if (type === 'ObjectMethod' || type === 'ClassMethod' || type === 'ClassPrivateMethod') {
		methodExitVisitor(path, state);
	} else if (type === 'ClassDeclaration' || type === 'ClassExpression') {
		classExitVisitor(path, state);
	}

	// Set trail back to as was before entering node
	state.trail.length -= path.listKey ? 2 : 1;

	// If exiting method key, set method as current function and enter its params block
	const {parentPath} = path;
	if (path.key === 'key' && parentPath.isMethod() && parentPath.node.kind !== 'constructor') {
		const fn = parentPath[FUNCTION_PROPS];
		state.currentFunction = state.currentFullFunction = fn;
		fn.trail = state.trail;
		state.trail = [];
		state.currentBlock = parentPath[PARAMS_BLOCK];
	}
}

/**
 * Visitor to init scope and state for class.
 * @param {Object} classPath - Babel path object for class
 * @param {Object} state - State object
 * @returns {undefined}
 */
function classEnterVisitor(classPath, state) {
	// Create block but don't enter it. Block may be used for class name or `super` target.
	const idNode = classPath.node.id,
		blockName = idNode ? idNode.name : undefined;
	const block = createBlockProps(blockName, false, state);
	classPath[NAME_BLOCK] = block;

	// NB Classes are always strict mode
	enterFunctionOrClass(classPath, block.id, true, false, false, state);

	// Init props for tracking `super` target var
	classPath[SUPER_VAR_NODE] = undefined;
	classPath[SUPER_VARS] = undefined;
}

/**
 * Visitor to add constructor to classes with no existing constructor.
 * Constructor is required for serializer to call.
 * Insert temp var for `super` if required.
 *
 * @param {Object} classPath - Babel path object for class
 * @param {Object} state - State object
 * @returns {undefined}
 */
function classExitVisitor(classPath, state) {
	const fn = exitFunctionOrClass(state);

	// Insert temp var for `super` if required
	insertClassTempSuperVar(classPath, state);

	// If class has constructor, exit - `functionExitVisitor()` has already inserted tracker comment
	if (fn.hasConstructor) return;

	// Create constructor.
	// If extends a super class: `constructor(...args) { super(...args); }`
	// Otherwise: `constructor() {}`
	const classNode = classPath.node,
		hasSuperClass = !!classNode.superClass,
		blockId = fn.id;

	const scopes = hasSuperClass
		? [{
			blockId,
			scopeIdVarNode: getOrCreateScope(classPath[NAME_BLOCK], state),
			varNames: new Set(['super']),
			constNames: new Set(['super']),
			constInStrictNames: new Set(),
			blockName: classNode.id ? classNode.id.name : undefined
		}]
		: [];

	classNode.body.body.push(t.classMethod(
		'constructor',
		t.identifier('constructor'),
		hasSuperClass ? [t.restElement(t.identifier('args'))] : [],
		t.blockStatement([
			t.expressionStatement(createTrackerNode(blockId, scopes, undefinedNode, state)),
			...(
				hasSuperClass
					? [t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(t.identifier('args'))]))]
					: []
			)
		])
	));

	addComment(classNode, 'inner', createTrackerComment(
		fn.id, scopes, undefined, true, false, false, false, false, false, undefined, state
	));
}

/**
 * Insert temp var for `super` if required for class.
 *
 * Class declarations are converted to var declaration
 * `class X { foo() { const X = 1; super.foo() } }`
 * -> `let X = temp_0 = class X { foo() { const X = 1; super.foo() } };`
 *
 * If is an unnamed class, preserve implicit name.
 * `let X = class {};` -> `let X = temp_0 = {X: class {}}.X;`
 * `const o = { [fn()]: class {} };`
 * -> `const o = { [temp_2 = fn() + '']: temp_1 = { [temp_2]: class {} }[temp_2] } };`
 *
 * @param {Object} classPath - Babel path for class which is target of `super`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertClassTempSuperVar(classPath, state) {
	const superVarNode = classPath[SUPER_VAR_NODE];
	if (!superVarNode) return;

	const tempVarNodes = [superVarNode],
		classNode = classPath.node,
		isClassDeclaration = t.isClassDeclaration(classNode);
	let replacementNode = classNode;
	if (isClassDeclaration) {
		classNode.type = 'ClassExpression';
	} else if (!classNode.id) {
		// Ensure class name is preserved if gained implicitly from assignment
		const {parentPath} = classPath;
		let idNode,
			keyIsComputed = false,
			accessIsComputed = false;
		if (parentPath.isAssignmentExpression()) {
			if (classPath.key === 'right') {
				const parentNode = parentPath.node;
				if (['=', '&&=', '||=', '??='].includes(parentNode.operator)) {
					const leftNode = parentNode.left;
					if (t.isIdentifier(leftNode)) idNode = leftNode;
				}
			}
		} else if (parentPath.isVariableDeclarator()) {
			if (classPath.key === 'init') {
				const assignedToNode = parentPath.node.id;
				if (t.isIdentifier(assignedToNode)) idNode = assignedToNode;
			}
		} else if (parentPath.isProperty()) {
			if (classPath.key === 'value') {
				const parentNode = parentPath.node,
					keyNode = parentNode.key;
				keyIsComputed = parentNode.computed;

				if (!keyIsComputed) {
					idNode = keyNode;
					accessIsComputed = t.isLiteral(keyNode);
				} else if (t.isLiteral(keyNode)) {
					idNode = keyNode;
					accessIsComputed = true;
				} else {
					// Key is expression.
					// Create temp var to hold key, to prevent expression being evaluated multiple times.
					// `+ ''` is added in case `.toString()` method has side effects,
					// so need to prevent it being called multiple times too.
					// `{[f()]: class {}}` -> `{[temp_2 = fn() + '']: temp_1 = {[temp_2]: class {}}[temp_2]}`
					// TODO Conversion to string won't work for Symbols.
					// Needs to be `{[temp_2 = livepack_getKey(fn())]: temp_1 = {[temp_2]: class {}}[temp_2]}}`
					// where `livepack_getKey` is defined as:
					// `k => (typeof k === 'symbol' || require('util').types.isSymbolObject(k)) ? k : k + '';`
					idNode = createTempVarNode(state);
					tempVarNodes.push(idNode);
					accessIsComputed = true;
					parentNode.key = t.assignmentExpression(
						'=',
						idNode,
						t.binaryExpression('+', keyNode, t.stringLiteral(''))
					);
				}
			}
		}

		if (idNode) {
			// Class will be named by assignment.
			// `let C = class {};` -> `let C = temp_3 = {C: class {}}.C;`
			// Using object prop to provide class name rather than setting directly, as that
			// would add a variable to scope which could potentially interfere with a var
			// with same name in an upper scope.
			replacementNode = t.memberExpression(
				t.objectExpression([t.objectProperty(idNode, classNode, keyIsComputed)]),
				idNode,
				accessIsComputed
			);
		} else {
			// Class will remain anonymous.
			// `class {}` -> `temp_3 = (0, class {})`
			replacementNode = t.sequenceExpression([t.numericLiteral(0), classNode]);
		}
	}

	replacementNode = t.assignmentExpression('=', superVarNode, replacementNode);

	// If class declaration, replace with `let ... = ...`.
	// `class X {}` -> `let X = temp_3 = class X {}`
	if (isClassDeclaration) {
		replacementNode = t.variableDeclaration(
			'let', [t.variableDeclarator(classNode.id, replacementNode)]
		);
	}

	replaceWith(classPath, replacementNode);

	// Create temp vars at start of enclosing block (will be inserted in `blockStatementExitVisitor()`)
	const {varsBlock} = state.currentBlock;
	(varsBlock.tempVarNodes || (varsBlock.tempVarNodes = [])).push(...tempVarNodes);
}

/**
 * Visitor to init scope + state for function declaration.
 * Does not create a block for function name as function declarations are scoped to enclosing block,
 * even when referred to from within the function.
 * e.g. `function f() { return f; }` - `f` in `return f` refers to var in parent scope.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function functionDeclarationEnterVisitor(fnPath, state) {
	state.currentFullFunction = enterFunctionOrMethod(fnPath, fnPath.node.id.name, false, false, state);
}

/**
 * Visitor to init scope + state for function expression.
 * If function has a name, create block for the name being referred to within function.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function functionExpressionEnterVisitor(fnPath, state) {
	// Name block is created before params + body blocks but added as last property
	// to keep more similar object shapes
	let blockName, nameBlock;
	const idNode = fnPath.node.id;
	if (idNode) {
		blockName = idNode.name;
		nameBlock = createBlockProps(blockName, false, state);
	}

	state.currentFullFunction = enterFunctionOrMethod(fnPath, blockName, false, false, state);

	fnPath[NAME_BLOCK] = nameBlock;
}

/**
 * Visitor to init scope + state for arrow function expression.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function arrowFunctionEnterVisitor(fnPath, state) {
	enterFunctionOrMethod(fnPath, undefined, false, false, state);
}

/**
 * Visitor to init scope + state for method.
 * Function props is created at this point, and added to `state.fns`,
 * but function is not set as current function yet.
 * This is done after exiting key (in `nodeExitVisitor()`), as code in a computed key cannot access vars
 * defined within the method, and don't inherit the method's strict/sloppy status.
 *
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function methodEnterVisitor(fnPath, state) {
	// Determine if is class constructor, and get block name
	const fnNode = fnPath.node,
		isClassConstructor = fnNode.kind === 'constructor';
	let blockName;
	if (isClassConstructor) {
		state.currentFunction.hasConstructor = true; // Flag presence of constructor on class
		blockName = 'constructor';
	} else if (!fnNode.computed) {
		const keyNode = fnNode.key;
		if (t.isIdentifier(keyNode)) {
			blockName = keyNode.name;
		} else if (t.isStringLiteral(keyNode)) {
			blockName = keyNode.value;
		} else if (t.isNumericLiteral(keyNode)) {
			blockName = `${keyNode.value}`;
		}
	}

	// Create function
	const fn = enterFunctionOrMethod(fnPath, blockName, !isClassConstructor, isClassConstructor, state);
	if (isClassConstructor) state.currentFullFunction = fn;
}

/**
 * Enter function or method.
 * Determine if is strict, create blocks for params and body, create function props,
 * and set function as current (unless is a method).
 *
 * @param {Object} fnPath - Babel path object for function
 * @param {string} [blockName] - Block name
 * @param {boolean} isMethod - `true` if is method (excluding class constructors)
 * @param {boolean} isClassConstructor - `true` if is class constructor
 * @param {Object} state - State object
 * @returns {Object} - Function props object
 */
function enterFunctionOrMethod(fnPath, blockName, isMethod, isClassConstructor, state) {
	// Determine if function is strict
	const parentFunction = state.currentFunction;
	let isStrict = parentFunction ? parentFunction.isStrict : state.topLevelIsStrict;
	if (!isStrict) {
		const bodyPath = fnPath.get('body');
		if (bodyPath.isBlockStatement() && containsUseStrictDirective(bodyPath)) isStrict = true;
	}

	// Create blocks for function.
	// 2 separate blocks - 1. params; 2. body block.
	// Function expressions may also have a name block (created in visitors already).
	const block = createBlockProps(blockName, true, state);
	// TODO This isn't correct - params and body should be separate blocks
	// https://github.com/overlookmotel/livepack/issues/108
	fnPath[PARAMS_BLOCK] = block;
	fnPath[BODY_BLOCK] = block;

	// Enter block, unless is method, in which case block is entered after method key
	if (!isMethod) state.currentBlock = block;

	// Enter function
	return enterFunctionOrClass(fnPath, block.id, isStrict, isMethod, isClassConstructor, state);
}

/**
 * Enter function or class.
 * - Serialize AST of function / class to JSON.
 * - Create function props object.
 * - Set function as child of its parent.
 * - Record function props in `state.fns`.
 * - Set this function as current (unless is a method).
 *
 * @param {Object} path - Babel path object for function/class
 * @param {number} id - Block ID
 * @param {boolean} isStrict - `true` if function/class is strict mode
 * @param {boolean} isMethod - `true` if is method (excluding class constructors)
 * @param {boolean} isClassConstructor - `true` if is class constructor
 * @param {Object} state - State object
 * @returns {Object} - Function props object
 */
function enterFunctionOrClass(path, id, isStrict, isMethod, isClassConstructor, state) {
	// Serialize AST to JSON.
	// Class constructor ASTs are included in the class AST, so don't need stringifying again.
	const astJson = isClassConstructor ? undefined : JSON.stringify(path.node);

	// Create function props object
	const parentFunction = state.currentFunction;
	const fn = {
		id,
		path,
		scopes: new Map(),
		isStrict,
		superVarNode: undefined,
		superIsProto: false,
		argNames: undefined,
		containsEval: false,
		hasConstructor: false,
		astJson,
		parent: parentFunction,
		fullParent: state.currentFullFunction,
		children: isClassConstructor ? parentFunction.children : [],
		trail: state.trail
	};
	path[FUNCTION_PROPS] = fn;

	// NB Class constructors are treated as part of the class itself
	if (!isClassConstructor) {
		// Add to array of functions (used for outputting get AST functions)
		state.fns.push(fn);

		// Set as child of parent function
		if (parentFunction) parentFunction.children.push(fn);
	}

	// Set function as current, unless is method, in which case it's entered after traversing method key
	if (!isMethod) {
		state.currentFunction = fn;

		// Start new trail
		if (!isClassConstructor) state.trail = [];
	}

	return fn;
}

/**
 * Visitor to add tracking comment + code to function declaration.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function functionDeclarationExitVisitor(fnPath, state) {
	// Exit function
	const fn = exitFunctionOrClass(state);
	state.currentFullFunction = fn.fullParent;

	// Insert tracker code and comment - comment after `function` keyword
	insertTrackerCodeAndComment(fnPath, fn, fn.id, false, fnPath.node, 'inner', state);
}

/**
 * Visitor to add tracking comment + code to function expression.
 * If contains `eval()` and function name is referred to within function, treat it as internal var.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function functionExpressionExitVisitor(fnPath, state) {
	// Exit function
	const fn = exitFunctionOrClass(state);
	state.currentFullFunction = fn.fullParent;

	// If contains `eval()`, treat function name as internal var
	if (fn.containsEval) {
		const idNode = fnPath.node.id;
		if (idNode) {
			const nameBlockId = fnPath[NAME_BLOCK].id,
				{scopes} = fn,
				scope = scopes.get(nameBlockId);
			if (scope) {
				const {varNames} = scope,
					{name} = idNode;
				if (varNames.has(name)) {
					if (varNames.size === 1) {
						scopes.delete(nameBlockId);
					} else {
						varNames.delete(name);
						scope.constInStrictNames.delete(name);
					}
				}
			}
		}
	}

	// Insert tracker code and comment - comment after `function` keyword
	insertTrackerCodeAndComment(fnPath, fn, fn.id, false, fnPath.node, 'inner', state);
}

/**
 * Visitor to add tracking comment + code to arrow function.
 * Converts body to a statement block if not already.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function arrowFunctionExitVisitor(fnPath, state) {
	// Exit function
	const fn = exitFunctionOrClass(state);

	// If has no body statement block, convert into block.
	// This is necessary so there's a block to put tracking code into.
	// `x => x` -> `(x) => { return x; }`
	const fnNode = fnPath.node;
	let bodyNode = fnNode.body;
	if (!t.isBlockStatement(bodyNode)) {
		bodyNode = t.blockStatement([t.returnStatement(bodyNode)]);
		fnNode.body = bodyNode;
		insertBlockVars(bodyNode, state);
		exitBlock(state);
	}

	// Insert tracker code and comment.
	// Comment before first param. If no params, before function body.
	const paramNodes = fnNode.params,
		commentHolderNode = paramNodes.length > 0 ? paramNodes[0] : bodyNode;
	insertTrackerCodeAndComment(fnPath, fn, fn.id, false, commentHolderNode, 'leading', state);
}

/**
 * Visitor to add tracking comment + code to class/object method.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function methodExitVisitor(fnPath, state) {
	// Exit function
	const fn = exitFunctionOrClass(state);
	state.currentFullFunction = fn.fullParent;

	const fnNode = fnPath.node,
		isClassConstructor = fnNode.kind === 'constructor';
	let fnId, commentHolderNode, commentType;
	if (isClassConstructor) {
		// Class constructor - tracker comment after `class` keyword of class
		const {currentFunction} = state;
		fnId = currentFunction.id;
		commentHolderNode = currentFunction.path.node;
		commentType = 'inner';
	} else {
		// Tracker comment before key if computed key, or after key otherwise
		fnId = fn.id;
		commentHolderNode = fnNode.key;
		commentType = fnNode.computed ? 'leading' : 'trailing';
	}

	insertTrackerCodeAndComment(
		fnPath, fn, fnId, isClassConstructor, commentHolderNode, commentType, state
	);
}

/**
 * Exit function / class.
 * Set current function to be parent, and reset trail to as was before entering this function.
 * @param {Object} state - State object
 * @returns {Object} - Function props object for function which are exiting
 */
function exitFunctionOrClass(state) {
	// Restore parent function as current parent function
	const fn = state.currentFunction;
	state.currentFunction = fn.parent;

	// Clear `.path` to free memory
	fn.path = undefined;

	// Restore previous key trail. Clone, so trail saved in function props
	// does not get altered as traverse back down to parent function.
	state.trail = [...fn.trail];

	// Return props object for exited function
	return fn;
}

/**
 * Insert tracker code and comment to function.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} fn - Function props object
 * @param {number} fnId - Function ID
 * @param {boolean} isClass - `true` if is class
 * @param {Object} commentHolderNode - AST node to attach tracker comment to
 * @param {string} commentType - Type of comment attachment - 'leading' / 'inner' / 'trailing'
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertTrackerCodeAndComment(
	fnPath, fn, fnId, isClass, commentHolderNode, commentType, state
) {
	// Get scope vars, sorted by block ID in ascending order
	const scopes = [...fn.scopes.values()]
		.sort((a, b) => (a.blockId > b.blockId ? 1 : -1));

	// Insert tracker code in function params
	const trackerNode = createTrackerNode(fnId, scopes, fn.superVarNode, state);
	const callArguments = insertTrackerNode(fnPath, trackerNode, state);

	// Insert tracker comment
	const fnNode = fnPath.node;
	addComment(commentHolderNode, commentType, createTrackerComment(
		fnId, scopes, callArguments,
		isClass, fnNode.async, fnNode.generator, !isClass && fn.isStrict,
		fn.superIsProto, fn.containsEval, fn.argNames, state
	));
}

/**
 * Create tracker function call AST node.
 * @param {number} blockId - Block ID for function being tracked
 * @param {Array<Object>} scopes - Array of scope objects
 * @param {Object} [superVarNode] - AST node for super var (optional)
 * @param {Object} state - State object
 * @returns {Object} - AST node for tracker function call
 */
function createTrackerNode(blockId, scopes, superVarNode, state) {
	// `livepack_tracker(livepack_ast_2, () => [[scopeId_1, x, y]])`
	return t.callExpression(state.trackerVarNode, [
		createAstVarNode(blockId, state),
		t.arrowFunctionExpression([], t.arrayExpression(
			scopes.map(({scopeIdVarNode, varNames}) => t.arrayExpression([
				scopeIdVarNode,
				...[...varNames].map(name => (name === 'super' ? superVarNode : t.identifier(name)))
			]))
		))
	]);
}

/**
 * Insert tracker into function.
 * Intent is to place tracker as close to start of code as possible to ensure:
 * 1. No code is evaluated prior to tracker being executed.
 * 2. If parameters reference external vars, tracker is outside function body and so can access them.
 *
 * Tracker is added to first modifiable parameter.
 * If no modifiable parameters, falls back to placing in function body.
 * Tracker is placed so that it does not alter normal operation of function, and does not
 * alter function signature (`.length` property).
 *
 * Parameters of the following kinds cannot be modified:
 * 1. Simple params e.g. `x` (converting to `x = livepack_tracker()` would alter function's `.length`)
 * 2. Rest element with simple argument e.g. `...x` (no valid way to insert a default)
 * 3. Object/Array destructuring with first element being rest with simple argument
 *    e.g. `{...x}`, `[...x]`
 *    (converting to `{...x} = livepack_tracker()` would alter `.length` and no way to insert a default)
 * 4. Object/Array destructuring repeated e.g. `{...{...x}}` `[...{...x}]` (same reason as previous)
 *
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} trackerNode - AST node for `livepack_tracker()` call
 * @param {Object} state - State object
 * @returns {Array|undefined} - Arguments to call function with to trigger tracker
 */
function insertTrackerNode(fnPath, trackerNode, state) {
	const fnNode = fnPath.node,
		callArguments = [];
	const trackerIsAddedToParams = fnNode.params.some((_, paramIndex) => {
		let path = fnPath.get(`params.${paramIndex}`);
		if (path.isArrayPattern()) {
			callArguments[paramIndex] = [];
		} else if (path.isObjectPattern()) {
			callArguments[paramIndex] = {};
		}

		if (path.isRestElement()) path = path.get('argument');

		let canAddDefault = false;
		while (true) { // eslint-disable-line no-constant-condition
			let {node} = path;
			const {type} = node;
			if (type === 'AssignmentPattern') {
				// `x = 1` => `x = livepack_tracker() || 1`
				node.right = t.logicalExpression('||', trackerNode, node.right);
				return true;
			}

			assertWithLocation(
				type === 'Identifier' || type === 'ArrayPattern' || type === 'ObjectPattern', path, state,
				`Unexpected function param type ${type}`
			);

			if (canAddDefault) {
				// `x` => `x = livepack_tracker()` / `{a: 1} => `{a: 1} = livepack_tracker()`
				replaceWith(path, t.assignmentPattern(node, trackerNode));
				return true;
			}

			if (type === 'Identifier') return false;

			path = path.get(type === 'ArrayPattern' ? 'elements.0' : 'properties.0');
			if (!path) return false;
			if (path.isRestElement()) {
				canAddDefault = false;
				path = path.get('argument');
			} else {
				if (type === 'ObjectPattern') {
					node = path.node;
					let keyNode = node.key;
					if (!node.computed) {
						if (t.isIdentifier(keyNode)) keyNode = t.stringLiteral(keyNode.name);
						node.computed = true;
						node.shorthand = false;
					}
					node.key = t.logicalExpression('||', trackerNode, keyNode);
					return true;
				}
				canAddDefault = true;
			}
		}
	});

	if (!trackerIsAddedToParams) {
		// Insert tracker at start of function body
		fnNode.body.body.unshift(t.expressionStatement(trackerNode));
	}

	return callArguments.length > 0 ? callArguments : undefined;
}

/**
 * Visitor to create block for object expression.
 * May be used if object contains method including `super`.
 * @param {Object} objPath - Babel path object for object expression
 * @param {Object} state - State object
 * @returns {undefined}
 */
function objectExpressionEnterVisitor(objPath, state) {
	// Create block but don't enter it. Block may be used for `super` target.
	objPath[NAME_BLOCK] = createBlockProps(undefined, false, state);

	// Init props for tracking `super` target var
	objPath[SUPER_VAR_NODE] = undefined;
	objPath[SUPER_VARS] = undefined;
}

/**
 * Visitor to assign object expression to temp var if required for `super`.
 * @param {Object} objPath - Babel path object for object expression
 * @param {Object} state - State object
 * @returns {undefined}
 */
function objectExpressionExitVisitor(objPath, state) {
	const superVarNode = objPath[SUPER_VAR_NODE];
	if (superVarNode) {
		replaceWith(objPath, t.assignmentExpression('=', superVarNode, objPath.node));

		// Create temp var at start of enclosing block (will be inserted in `blockStatementExitVisitor()`)
		const {varsBlock} = state.currentBlock;
		(varsBlock.tempVarNodes || (varsBlock.tempVarNodes = [])).push(superVarNode);
	}
}

/**
 * Visitor to create block for `for` / `while` / `do while` statements.
 * @param {Object} forOrWhilePath - Babel path object for `for` / `while` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function forOrWhileEnterVisitor(forOrWhilePath, state) {
	const block = createBlockProps(undefined, true, state);
	// TODO This isn't correct - initializer and body should be separate blocks
	// https://github.com/overlookmotel/livepack/issues/108
	if (forOrWhilePath.isFor()) forOrWhilePath[PARAMS_BLOCK] = block;
	forOrWhilePath[BODY_BLOCK] = block;
	state.currentBlock = block;
}

/**
 * Visitor to create body block for `for` / `while` / `do while` statements which have no body block
 * where it's required.
 *
 * `for`: variables defined in the init node are referenced in functions created in the body,
 * in which case a scope var statement will need to be inserted in the body block.
 * `for (const x of [1, 2, 3]) fns.push(() => x);` -> `for (const x of [1, 2, 3]) { fns.push(() => x); }`
 *
 * `while` / `do while`: object or class with method using `super` defined in loop
 * and requires temp var scoped to inside loop.
 * e.g. `while (x) fn(class extends C {m() { super.m() }})`
 * `do fn(class extends C {m() { super.m() }}); while (x)`
 *
 * @param {Object} forOrWhilePath - Babel path object for `for` / `while` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function forOrWhileExitVisitor(forOrWhilePath, state) {
	const {node} = forOrWhilePath;
	let bodyNode = node.body;
	if (!t.isBlockStatement(bodyNode)) {
		const block = state.currentBlock;
		if (block.scopeIdVarNode) {
			bodyNode = t.blockStatement([bodyNode]);
			node.body = bodyNode;
			insertBlockVars(bodyNode, state);
		}
		exitBlock(state);
	}
}

/**
 * Visitor to create block for error var in `catch` clause of `try {} catch (e) {}`.
 * @param {Object} catchPath - Babel path object for `catch` clause
 * @param {Object} state - State object
 * @returns {undefined}
 */
function catchClauseEnterVisitor(catchPath, state) {
	const block = createBlockProps('catch', false, state);
	catchPath[PARAMS_BLOCK] = block;
	state.currentBlock = block;
}

/**
 * Visitor to exit block for error var in `catch` clause of `try {} catch (e) {}`.
 * @param {Object} catchPath - Babel path object for `catch` clause
 * @param {Object} state - State object
 * @returns {undefined}
 */
function catchClauseExitVisitor(catchPath, state) {
	exitBlock(state);
}

/**
 * Visitor to set a block ID on every block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - State object
 * @returns {undefined}
 */
function blockStatementEnterVisitor(blockPath, state) {
	// If is body of function or `for` / `while` statement, use block already created
	const {parentPath} = blockPath;
	if (parentPath.isFunction() || parentPath.isFor() || parentPath.isWhile()) {
		blockPath[BODY_BLOCK] = state.currentBlock;
	} else {
		const block = createBlockProps(undefined, true, state);
		blockPath[BODY_BLOCK] = block;
		state.currentBlock = block;
	}
}

/**
 * Visitor to add `const scopeId_3 = livepack_getScopeId();` at start of block if block is a scope.
 * Also adds any temp var declarations to start of block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - State object
 * @returns {undefined}
 */
function blockStatementExitVisitor(blockPath, state) {
	insertBlockVars(blockPath.node, state);
	exitBlock(state);
}

/**
 * Create block props object.
 * @param {string} [name] - Block name
 * @param {boolean} canHoldVars - `true` if block can hold vars e.g. statement block
 * @param {Object} state - State object
 * @returns {Object} - Block props object
 */
function createBlockProps(name, canHoldVars, state) {
	const block = {
		id: createBlockId(state),
		name,
		scopeIdVarNode: undefined,
		tempVarNodes: undefined,
		parent: state.currentBlock,
		varsBlock: undefined
	};
	block.varsBlock = canHoldVars ? block : state.currentBlock.varsBlock;
	return block;
}

/**
 * Exit block.
 * @param {Object} state - State object
 * @returns {undefined}
 */
function exitBlock(state) {
	state.currentBlock = state.currentBlock.parent;
}

/**
 * Insert scope ID var and temp vars at start of statement block.
 * @param {Object} blockNode - AST node for block statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertBlockVars(blockNode, state) {
	const block = state.currentBlock,
		{scopeIdVarNode} = block;
	if (!scopeIdVarNode) return;

	// Insert `const scopeId_3 = livepack_getScopeId();` statement at top of block
	const insertNodes = [
		t.variableDeclaration(
			'const', [t.variableDeclarator(scopeIdVarNode, t.callExpression(state.getScopeIdVarNode, []))]
		)
	];

	// Insert temp vars declaration at top of block
	const {tempVarNodes} = block;
	if (tempVarNodes) {
		insertNodes.push(t.variableDeclaration('let', tempVarNodes.map(node => t.variableDeclarator(node))));
	}

	blockNode.body.unshift(...insertNodes);
}

/**
 * Visitor to track a variable used which is in an upper scope.
 * @param {Object} identifierPath - Babel path object for identifer
 * @param {Object} state - State object
 * @returns {undefined}
 */
function identifierVisitor(identifierPath, state) {
	// Skip identifiers not used as vars e.g. `{a: 1}`
	if (!identifierIsVariable(identifierPath)) return;

	// If var name could clash with internal var names, record this
	const {node, parentPath} = identifierPath,
		{name} = node;
	checkInternalVarNameClash(name, state);

	// Handle top-level vars
	const {currentFunction} = state;
	if (!currentFunction) {
		if (
			parentPath.isVariableDeclarator() && identifierPath.key === 'id'
			&& parentPath.parentPath.parentPath.isProgram()
		) {
			// Top-level var declaration - record it.
			// This is a hack to work around Babel not seeing vars created by
			// `@babel/plugin-transform-modules-commonjs` when binding is searched for later.
			// `.scope.getBinding()` returns undefined. So catalog them here and use the list
			// to identify their scope when they're encountered later.
			// https://github.com/babel/babel/issues/13665
			// TODO Find a better way to do this.
			state.topLevelVarNames.add(name);
		} else if (name === 'eval' && !identifierPath.scope.getBinding('eval')) {
			// Shim `eval` in top level scope
			processEval(identifierPath, state);
		}
		return;
	}

	// Skip function/class names where they are defined (i.e. `x` in `function x() {}`)
	if (identifierPath.key === 'id' && (parentPath.isFunction() || parentPath.isClass())) return;

	// Locate binding and handle
	let block, isConst,
		isConstInStrict = false;
	const binding = identifierPath.scope.getBinding(name);
	if (binding) {
		const {kind} = binding;
		let blockPath = binding.scope.path;
		if (kind === 'param') {
			block = blockPath[PARAMS_BLOCK];
			isConst = false;
		} else if (kind === 'let') {
			const bindingPath = binding.path;
			if (bindingPath.isClass()) {
				const fn = bindingPath[FUNCTION_PROPS];
				if (fn && fn.path) {
					// Class declaration name referenced from inside class.
					// `.path` is unset when exiting class, so as it's set here means identifier is inside class.
					block = bindingPath[NAME_BLOCK];
					isConst = true;
				}
			}

			if (!block) {
				if (blockPath.isFunction()) {
					// `let` or class declaration in body of function results in Babel scope path being function.
					// Set block to function body block.
					block = blockPath[BODY_BLOCK];
				} else if (blockPath.isCatchClause() && bindingPath === blockPath) {
					// Error argument in catch clause
					block = blockPath[PARAMS_BLOCK];
				} else {
					// `let` or class declaration in body of catch clause results in Babel scope path
					// being catch clause. Set block to catch clause body block.
					block = blockPath[BODY_BLOCK];
				}
				isConst = false;
			}
		} else if (kind === 'local') {
			// Function expression or class expression name referenced within function
			block = blockPath[NAME_BLOCK];
			if (blockPath.isFunctionExpression()) {
				isConst = false;
				isConstInStrict = true;
			} else {
				assertWithLocation(
					blockPath.isClassExpression(), identifierPath, state,
					`Unexpected local binding type '${blockPath.type}'`
				);
				isConst = true;
			}
		} else {
			if (blockPath.isFunction() || blockPath.isCatchClause()) {
				// `const`, `var` or function declaration in body of function or catch clause of try-catch
				// results in Babel scope path being function / catch clause.
				// Set block to function / catch clause body block.
				blockPath = blockPath.get('body');
			}

			if (kind === 'const' || kind === 'var') {
				block = blockPath[BODY_BLOCK];
				isConst = kind === 'const';
			} else {
				assertWithLocation(
					kind === 'hoisted', identifierPath, state, `Unexpected binding kind '${kind}'`
				);

				// Function declaration
				// NB `blockPath` here is enclosing block, not the function itself
				block = blockPath[BODY_BLOCK];
				isConst = false;
			}
		}

		// Skip if identifier is a var local to function in which it's being used
		if (block.id >= currentFunction.id) return;
	} else if (state.topLevelVarNames.has(name)) {
		// Top-level var
		block = state.programBlock;
		isConst = true; // Assume vars added by other Babel plugins are consts
	} else {
		const parentVar = state.parentVars[name];
		if (parentVar) {
			// This is `eval`ed code and var is from scope outside `eval`
			if (name === 'arguments' && !state.currentFullFunction) {
				processArguments(state);
				return;
			}

			block = {
				id: parentVar.blockId,
				name: parentVar.blockName,
				varsBlock: {
					scopeIdVarNode: t.numericLiteral(parentVar.scopeId)
				}
			};
			isConst = parentVar.isConst;
			isConstInStrict = parentVar.isConstInStrict;
		} else if (COMMON_JS_VARS.has(name)) {
			// Treat `exports` etc as external vars, not globals
			block = state.programBlock;
			isConst = false;
		} else {
			// Global var
			if (name === 'eval') {
				processEval(identifierPath, state);
			} else if (name === 'arguments' && state.currentFullFunction) {
				processArguments(state);
			}
			return;
		}
	}

	// Handle `arguments`
	if (name === 'arguments') {
		const {currentFullFunction} = state;
		if (currentFullFunction && block.id < currentFullFunction.id) {
			processArguments(state);
			return;
		}
	}

	// Record variable use
	recordVarUse(name, block, isConst, isConstInStrict, state);
}

/**
 * Visitor to instrument `eval()` calls.
 * @param {Object} callPath - Babel path object for identifer
 * @param {Object} state - State object
 * @returns {undefined}
 */
function callExpressionExitVisitor(callPath, state) {
	// Ignore local vars called `eval`.
	// NB No need to check `parentVars` as if `eval` was a local var, we wouldn't end up here.
	const calleeNode = callPath.node.callee;
	if (
		t.isIdentifier(calleeNode) && calleeNode.name === 'eval'
		&& !callPath.scope.getBinding('eval')
		&& !state.topLevelVarNames.has('eval')
	) processEvalCall(callPath, state);
}

/**
 * Visitor to track use of `this` which refers to an upper scope.
 * Record the var same as for identifiers.
 * (only applies inside arrow functions)
 * @param {Object} thisPath - Babel path object for `this`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function thisExpressionVisitor(thisPath, state) {
	processThisOrArguments('this', state);
}

/**
 * Visitor to track use of `super` in methods.
 * @param {Object} superPath - Babel path object for `super`
 * @param {Object} state - State object
 * @returns {undefined}
 */
function superVisitor(superPath, state) {
	// Find method `super` is in
	const {currentFunction, currentFullFunction} = state,
		fnPath = currentFunction.path,
		methodPath = currentFullFunction.path;
	assertWithLocation(methodPath.isMethod(), methodPath, state);

	// Skip if another incidence of `super` in this function already encountered
	if (currentFunction.superVarNode) return;

	// Get var node to represent super
	const isClass = methodPath.isClassMethod();
	let isClassConstructor, encloserPath, superIsProto, ctorFunction, superVarNode;
	if (isClass) {
		isClassConstructor = methodPath.node.kind === 'constructor';
		if (isClassConstructor) {
			ctorFunction = currentFullFunction;
			if (currentFunction === currentFullFunction) superVarNode = undefinedNode;
		}
		superIsProto = !methodPath.node.static;
		encloserPath = methodPath.parentPath.parentPath;
	} else {
		isClassConstructor = false;
		superIsProto = false;
		encloserPath = methodPath.parentPath;
	}
	if (!superVarNode) superVarNode = getSuperVarNode(encloserPath, fnPath, isClass, state);

	// Record var use
	const block = encloserPath[NAME_BLOCK];
	const fns = recordVarUse('super', block, true, false, state);

	// Record super var on functions
	for (const fn of fns) {
		if (fn === ctorFunction) {
			fn.superVarNode = undefinedNode;
		} else {
			fn.superVarNode = superVarNode;
			if (superIsProto) fn.superIsProto = true;
		}
	}

	// If `super` is used in an arrow function nested within method, and usage is something other
	// than `super()`, the transpiled `super` will need access to `this` from within method
	if (
		currentFunction !== currentFullFunction
		&& (!superPath.parentPath.isCallExpression() || superPath.key !== 'callee')
	) {
		thisExpressionVisitor(superPath, state);
	}
}

/**
 * Get var node which can be used as target for `super`.
 *
 * Vars which can be used:
 *   1. Class name in class declaration or class expression - `class X {}`
 *   2. Const class/object is assigned to - `const X = class {};`, `const x = { ... };`
 *
 * If either is found, they are stored in `encloserPath[SUPER_VARS]`.
 * Each is stored as object of form `{node, bindingPath}`.
 *   - `node` = var node
 *   - `bindingPath` = Babel path object for where var is bound (`undefined` for temp vars)
 *
 * If neither is found, or neither is accessible from tracker function in function (shadowed),
 * create a temp var.
 *
 * @param {Object} encloserPath - Babel path for class/object which is subject of `super`
 * @param {Object} fnPath - Current parent function path
 * @param {boolean} isClass - `true` if encloser is class
 * @param {Object} state - State object
 * @returns {Object} - AST node for var to be used as super
 */
function getSuperVarNode(encloserPath, fnPath, isClass, state) {
	// If temp var already created, use it
	let superVarNode = encloserPath[SUPER_VAR_NODE];
	if (superVarNode) return superVarNode;

	// Get existing vars which can be used
	let superVars = encloserPath[SUPER_VARS];
	if (!superVars) {
		const potentialSuperVars = [];

		// If class, use class name
		if (isClass) {
			assertWithLocation(encloserPath.isClass(), encloserPath, state);
			const idNode = encloserPath.node.id;
			if (idNode) potentialSuperVars.push({node: idNode, bindingPath: encloserPath});
		}

		// If defined with `const x = ...`, use var name (`const` only, so value cannot change)
		const {parentPath} = encloserPath;
		if (parentPath.isVariableDeclarator() && parentPath.parentPath.node.kind === 'const') {
			const idNode = parentPath.node.id;
			if (t.isIdentifier(idNode)) potentialSuperVars.push({node: idNode, bindingPath: parentPath});
		}

		if (potentialSuperVars.length !== 0) superVars = encloserPath[SUPER_VARS] = potentialSuperVars;
	}

	// Find an existing var which is accessible from tracker function in parent function
	if (superVars) {
		const functionBodyScope = fnPath.get('body').scope;
		const superVar = superVars.find(superVar => ( // eslint-disable-line no-shadow
			functionBodyScope.getBinding(superVar.node.name).path === superVar.bindingPath
		));
		if (superVar) return superVar.node;

		// None accessible
		encloserPath[SUPER_VARS] = undefined;
	}

	// No existing var accessible - create temp var
	superVarNode = createTempVarNode(state);
	encloserPath[SUPER_VAR_NODE] = superVarNode;
	return superVarNode;
}

/**
 * Visitor to track use of `arguments` which refers to an upper scope.
 * Record the var same as for identifiers, and also record an array of
 * argument names in call to `livepack_tracker()`.
 * (only applies inside arrow functions)
 * @param {Object} state - State object
 * @returns {undefined}
 */
function processArguments(state) {
	const res = processThisOrArguments('arguments', state);
	if (!res) return;

	const {fns, parentVar} = res;
	if (fns.length === 0) return;

	// Add arguments names to function props objects
	let argNames;
	if (!parentVar) {
		// When all params are simple vars (i.e. `function(a, b, c) {}`), values of `a` and `arguments[0]`
		// are linked. Setting `a` results in `arguments[0]` also being set to same value + vice versa.
		// If params use default values, destructuring or spreading, they are not linked.
		// So only record `argNames` if all params are simple vars.
		argNames = [];
		const {currentFullFunction} = state;
		if (!currentFullFunction.isStrict) {
			for (const paramNode of currentFullFunction.path.node.params) {
				if (!t.isIdentifier(paramNode)) {
					argNames.length = 0;
					break;
				}
				argNames.push(paramNode.name);
			}
		}
	} else {
		argNames = parentVar.argNames;
		if (!argNames) return;
	}

	for (const fn of fns) {
		fn.argNames = argNames;
	}
}

/**
 * Find what function a use of `this`/`arguments` derives from.
 * (only applies to arrow functions, where `this` in the arrow function
 * refers to `this` in enclosing function)
 * @param {string} name - Var name (i.e 'this' or 'arguments')
 * @param {Object} state - State object
 * @returns {Object|undefined} - Object with props:
 *   {Array<Object>} .fns - Array of function props objects
 *   {Object} [.parentVar] - Parent var object (only if references `this`/`arguments` from within eval)
 */
function processThisOrArguments(name, state) {
	// Determine if this/arguments is a const.
	// NB Do not need to handle where `arguments` is a const (which it is in strict mode)
	// because an assignment to `arguments` will have caused a syntax error during parsing.
	// Therefore we can always know that either `arguments` is not a const, or there are
	// no assignments to it. So it doesn't matter if it's not correctly identified as a const here,
	// as only purpose for identification of consts is to prevent const violations.
	const isConst = name === 'this';

	// Ignore if outside full function
	const {currentFunction, currentFullFunction} = state;
	if (!currentFullFunction) {
		// If this is code generated in `eval` and `this` / `arguments` is from
		// scope outside `eval`, record var usage
		if (currentFunction) {
			const parentVar = state.parentVars[name];
			if (parentVar) {
				const block = {
					id: parentVar.blockId,
					name: parentVar.blockName,
					varsBlock: {
						scopeIdVarNode: t.numericLiteral(parentVar.scopeId)
					}
				};
				const fns = recordVarUse(name, block, isConst, false, state);
				// Return function props objects + parent var (used in `processArguments()`)
				return {fns, parentVar};
			}
		}

		return; // eslint-disable-line consistent-return
	}

	// Skip if enclosing function is not arrow function (i.e. `this`/`arguments` is local)
	if (currentFunction === currentFullFunction) return; // eslint-disable-line consistent-return

	// Record variable use
	const block = currentFullFunction.path[PARAMS_BLOCK];
	const fns = recordVarUse(name, block, isConst, false, state);

	// Return function props objects (used in `processArguments()`)
	return {fns, parentVar: undefined};
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

	// Capture all vars accessible to code in `eval()` expression.
	// Works by treating `eval` as if it was an arrow function
	// and acting as if all vars are encountered within it.
	const {currentFunction} = state,
		isStrict = currentFunction ? currentFunction.isStrict : state.topLevelIsStrict,
		scopes = new Map(),
		fn = {path: callPath, scopes, argNames: undefined, parent: currentFunction};
	state.currentFunction = fn;

	const evalPath = callPath.get('callee'),
		idNode = {name: undefined},
		idPath = {
			node: idNode,
			parentPath: evalPath,
			scope: evalPath.scope,
			findParent: path => evalPath.findParent(path)
		};
	function includeVar(varName) {
		// If `eval()` is in strict mode, skip vars which are reserved words in strict mode
		// as they cannot be referenced within the eval - would be a syntax error
		if (isStrict && isReservedWord(varName)) return;
		idNode.name = varName;
		identifierVisitor(idPath, state);
	}

	// Capture all vars in scopes above
	let currentPath = callPath;
	do {
		for (const varName of Object.keys(currentPath.scope.bindings)) {
			includeVar(varName);
		}
		currentPath = currentPath.parentPath;
	} while (currentPath);

	// Capture `this` + `arguments`
	processThisOrArguments('this', state);
	includeVar('arguments');

	// Capture all vars from parent scopes
	for (const varName of Object.keys(state.parentVars)) {
		includeVar(varName);
	}

	// Capture `module` + `exports`
	if (state.isCommonJs) {
		includeVar('module');
		includeVar('exports');
	}

	// TODO Capture `super`

	// Exit faux function
	state.currentFunction = currentFunction;

	// Replace `eval(x)` with `eval(livepack_preval(x, [...], true))`
	argNodes[0] = t.callExpression(
		createPrevalVarNode(state),
		[
			argNodes[0],
			t.arrayExpression(
				[...scopes.values()].map(scope => t.arrayExpression([
					t.numericLiteral(scope.blockId),
					scope.scopeIdVarNode,
					scope.blockName ? t.stringLiteral(scope.blockName) : null,
					t.arrayExpression(
						[...scope.varNames].map(varName => t.stringLiteral(varName))
					),
					t.arrayExpression(
						[...scope.constNames].map(varName => t.stringLiteral(varName))
					),
					t.arrayExpression(
						[...scope.constInStrictNames].map(varName => t.stringLiteral(varName))
					)
				]))
			),
			t.booleanLiteral(isStrict),
			...(
				fn.argNames
					? [t.arrayExpression(fn.argNames.map(varName => t.stringLiteral(varName)))]
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
 * Determine if block statement contains a 'use strict' directive.
 * @param {Object} blockPath - Babel path object for block statement
 * @returns {boolean} - `true` if block contains a 'use strict' directive
 */
function containsUseStrictDirective(blockPath) {
	return blockPath.node.directives.some(directiveNode => directiveNode.value.value === 'use strict');
}
