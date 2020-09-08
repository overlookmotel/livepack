/* --------------------
 * livepack module
 * Babel plugin
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, parse: pathParse} = require('path'),
	{ensureStatementsHoisted} = require('@babel/helper-module-transforms'),
	assert = require('simple-invariant'),
	{isString} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {
	identifierIsVariable, replaceWith, isInternalPath,
	TRANSFORMED_COMMENT, TRACKER_COMMENT_PREFIX, TEMP_COMMENT_PREFIX, COMMON_JS_LOCAL_VAR_NAMES
} = require('./shared.js');

// Constants
const INIT_PATH = pathJoin(__dirname, 'init/index.js'),
	TRACKER_VAR_NAME = 'tracker',
	TRACKER_VAR_NUMS_USED = Symbol('livepack.TRACKER_VAR_NUMS_USED'),
	TRACKER_VAR_NODE = Symbol('livepack.TRACKER_VAR_NODE'),
	SCOPE_ID_VAR_NAME = 'scopeId',
	SCOPE_ID_VAR_NUMS_USED = Symbol('livepack.SCOPE_ID_VAR_NUMS_USED'),
	SCOPE_ID_VAR_NODES = Symbol('livepack.SCOPE_ID_VAR_NODES'),
	SCOPE_ID_VAR_NODE = Symbol('livepack.SCOPE_ID_VAR_NODE'),
	TEMP_VAR_NAME = 'temp',
	TEMP_VAR_NUMS_USED = Symbol('livepack.TEMP_VAR_NUMS_USED'),
	TEMP_VAR_NODES = Symbol('livepack.TEMP_VAR_NODES'),
	TOP_BLOCK_ID = 1,
	BLOCK_ID = Symbol('livepack.BLOCK_ID'),
	BLOCK_NAME = Symbol('livepack.BLOCK_NAME'),
	FUNCTION_PROPS = Symbol('livepack.FUNCTION_PROPS'),
	HAS_CONSTRUCTOR = Symbol('livepack.HAS_CONSTRUCTOR'),
	PROGRAM_PATH = Symbol('livepack.PROGRAM_PATH'),
	PARENT_FUNCTION_PATH = Symbol('livepack.PARENT_FUNCTION_PATH'),
	PARENT_FULL_FUNCTION_PATH = Symbol('livepack.PARENT_FULL_FUNCTION_PATH'),
	SUPER_VAR_NODE = Symbol('livepack.SUPER_VAR_NODE'),
	TOP_LEVEL_VAR_NAMES = Symbol('livepack.TOP_LEVEL_VARS'),
	IS_INTERNAL = Symbol('livepack.IS_INTERNAL'),
	COMMON_JS_VARS = new Set(COMMON_JS_LOCAL_VAR_NAMES);

// Exports

const TRACKER_NAME_REGEXP = new RegExp(`^${TRACKER_VAR_NAME}([1-9]\\d*)?$`),
	SCOPE_ID_NAME_REGEXP = new RegExp(`^${SCOPE_ID_VAR_NAME}(\\d*)?_\\d+$`),
	TEMP_NAME_REGEXP = new RegExp(`^${TEMP_VAR_NAME}(\\d*)?_\\d+$`);

/**
 * Babel plugin.
 * Adds tracking code to all functions.
 *
 * Every function gets a unique ID.
 * In addition, every time a function is called, it gets a unique scope ID.
 * The scope ID represents the scope of function for that call.
 * If a function returns (or saves in an external var) another function, that function
 * will inherit the scope of this function.
 * Scope IDs track this, so it's possible to determine value of vars outside scope of a function.
 *
 * When any function is called, it calls `tracker.track()` with the values of vars in scope
 * of it's enclosing function, the scope ID, and parent scope's scope ID.
 *
 * Plugin is implemented as a single Program exit visitor which performs a sub-traversal to do its work.
 * This approach is necessary to avoid ordering interactions with other plugins.
 *
 * @param {Object} api - Babel API object
 * @param {Object} options - Options object
 * @param {string} [options.initPath] - Path to `init` script file
 * @returns {Object} - Babel plugin object
 */
module.exports = function livepackBabelPlugin(api, options) {
	// Get init require path
	let {initPath} = options;
	if (initPath == null) {
		initPath = INIT_PATH;
	} else {
		assert(isString(initPath), 'options.initPath must be a string if provided');
	}

	// Return visitors
	return {
		visitor: {
			Program: {
				exit: (path, state) => masterVisitor(path, state, initPath)
			}
		}
	};
};

/**
 * Visitor to add tracking to program.
 * Traverses entire AST tree.
 * @param {Object} path - Babel path object for program
 * @param {Object} state - Babel state object for file
 * @param {string} initPath - Import path for init
 * @returns {undefined}
 */
function masterVisitor(programPath, state, initPath) {
	// Avoid adding tracking code to livepack's own codebase
	const {filename} = state.file.opts;
	if (filename && isInternalPath(filename)) return;

	// Prepare for traversal
	programEnterVisitor(programPath, state);

	// Traverse AST tree
	programPath.traverse({
		Class: {
			enter: classEnterVisitor,
			exit: path => classExitVisitor(path, state)
		},
		Function: {
			enter: path => functionEnterVisitor(path, state),
			exit: path => functionExitVisitor(path, state)
		},
		For: forOrWhileVisitor,
		While: forOrWhileVisitor,
		BlockStatement: {
			enter: path => blockStatementEnterVisitor(path, state),
			exit: path => blockStatementExitVisitor(path, state)
		},
		Identifier: path => identifierVisitor(path, state),
		ThisExpression: path => thisExpressionVisitor(path, state),
		Super: path => superVisitor(path, state)
	});

	// Insert tracker + init statements at top of file
	programExitVisitor(programPath, state, initPath);
}

/**
 * Visitor to determine var names for tracker and scopeId vars in this file.
 * @param {Object} path - Babel path object for program
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function programEnterVisitor(path, state) {
	// Create node for tracker var + init array to track invalid names
	state[TRACKER_VAR_NODE] = internalIdentifier(TRACKER_VAR_NAME);
	state[TRACKER_VAR_NUMS_USED] = [];

	// Init arrays to track scopeId + temp vars
	state[SCOPE_ID_VAR_NUMS_USED] = [];
	state[SCOPE_ID_VAR_NODES] = [];
	state[TEMP_VAR_NUMS_USED] = [];
	state[TEMP_VAR_NODES] = [];

	// Record program path
	state[PROGRAM_PATH] = path;

	// Init parent function state vars
	state[PARENT_FUNCTION_PATH] = null;
	state[PARENT_FULL_FUNCTION_PATH] = null;

	// Init set of top level var names
	state[TOP_LEVEL_VAR_NAMES] = new Set();

	// Init block ID counter
	state[BLOCK_ID] = TOP_BLOCK_ID;

	// Set block ID
	enterBlock(path, state);
}

/**
 * Visitor to insert tracker + init statements at top of file.
 * @param {Object} path - Babel path object for program
 * @param {Object} state - Babel state object for file
 * @param {string} initPath - Import path for init
 * @returns {undefined}
 */
function programExitVisitor(path, state, initPath) {
	// Insert `const scopeId_1 = tracker();` at top of file if file scope referenced
	blockStatementExitVisitor(path, state);

	// Insert init import statement at top of file (above `scopeId` definition)
	// eslint-disable-next-line max-len
	// `const tracker = require('/path/to/app/node_modules/livepack/lib/init.index.js')(__filename, module, require);`
	const trackerVarNode = state[TRACKER_VAR_NODE];
	const statementNodes = [
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					trackerVarNode,
					t.callExpression(
						t.callExpression(internalIdentifier('require'), [t.stringLiteral(initPath)]),
						[t.identifier('__filename'), t.identifier('module'), t.identifier('require')]
					)
				)
			]
		)
	];

	// Insert `/*livepack_babel_transformed*/` comment at top of file
	const {node} = path;
	(node.leadingComments || (node.leadingComments = [])).unshift({
		type: 'CommentBlock',
		value: TRANSFORMED_COMMENT
	});

	// Ensure these headers remain above headers added by @babel/plugin-transform-modules-commonjs
	ensureStatementsHoisted(statementNodes);

	path.unshiftContainer('body', statementNodes);

	// Determine unique name for tracker var
	const trackerNum = getUnusedNum(state[TRACKER_VAR_NUMS_USED]);
	if (trackerNum !== 0) trackerVarNode.name = `tracker${trackerNum}`;

	// Determine unique name prefix for scopeId vars and set all vars to use this prefix
	const scopeIdNum = getUnusedNum(state[SCOPE_ID_VAR_NUMS_USED]);
	if (scopeIdNum !== 0) {
		const scopeIdName = `${SCOPE_ID_VAR_NAME}${scopeIdNum}`;
		const pos = SCOPE_ID_VAR_NAME.length;
		for (const varNode of state[SCOPE_ID_VAR_NODES]) {
			varNode.name = `${scopeIdName}${varNode.name.slice(pos)}`;
		}
	}

	// Determine unique name prefix for temp vars and set all vars to use this prefix
	const tempNum = getUnusedNum(state[TEMP_VAR_NUMS_USED]);
	if (tempNum !== 0) {
		const tempName = `${TEMP_VAR_NAME}${tempNum}`;
		const pos = TEMP_VAR_NAME.length;
		for (const varNode of state[TEMP_VAR_NODES]) {
			varNode.name = `${tempName}${varNode.name.slice(pos)}`;
		}
	}
}

/**
 * Visitor to init `HAS_CONSTRUCTOR` flag.
 * @param {Object} classPath - Babel path object for class
 * @returns {undefined}
 */
function classEnterVisitor(classPath) {
	classPath[HAS_CONSTRUCTOR] = false;
}

/**
 * Visitor to amend classes with no constructor.
 * If is subclass, create blank constructor. Otherwise, add tracker comment.
 * Blank constructor for subclasses is required to track super.
 * @param {Object} classPath - Babel path object for class
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function classExitVisitor(classPath, state) {
	if (classPath[HAS_CONSTRUCTOR]) return;

	if (classPath.node.superClass) {
		classPath.get('body').pushContainer('body', t.classMethod(
			'constructor',
			t.identifier('constructor'),
			[t.restElement(t.identifier('args'))],
			t.blockStatement([
				t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(t.identifier('args'))]))
			])
		));
	} else {
		insertTrackerComment(
			classPath.get('body'), createBlockId(state), [], false, false, undefined, false, state
		);
	}
}

/**
 * Visitor to init scope + state for function.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function functionEnterVisitor(fnPath, state) {
	// If arrow function with no body statement block, convert into block.
	// This is necessary so there's a block to put tracking code into.
	// `x => x` -> `(x) => { return x; }`
	let bodyPath = fnPath.get('body');
	if (!bodyPath.isBlockStatement()) {
		bodyPath.replaceWith(
			t.blockStatement([
				t.returnStatement(bodyPath.node)
			])
		);
		bodyPath = fnPath.get('body');
	}

	// Init scope on function body
	const blockId = enterBlock(bodyPath, state);
	initScope(bodyPath, blockId, state);

	// Init functions props
	fnPath[FUNCTION_PROPS] = {id: blockId, scopes: new Map(), superVarNode: undefined};

	// Update parent functions
	fnPath[PARENT_FUNCTION_PATH] = state[PARENT_FUNCTION_PATH];
	fnPath[PARENT_FULL_FUNCTION_PATH] = state[PARENT_FULL_FUNCTION_PATH];
	state[PARENT_FUNCTION_PATH] = fnPath;
	if (!fnPath.isArrowFunctionExpression()) state[PARENT_FULL_FUNCTION_PATH] = fnPath;
}

/**
 * Exit visitor to add tracking comment + code to function bodies.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function functionExitVisitor(fnPath, state) {
	// Insert tracking info comment at start of function body (or start of class body for constructors)
	const isCtor = fnPath.node.kind === 'constructor';
	const bodyPath = fnPath.get('body');
	let commentBodyPath,
		isMethod = false,
		isProtoMethod = false;
	if (isCtor) {
		commentBodyPath = fnPath.parentPath;
		commentBodyPath.parentPath[HAS_CONSTRUCTOR] = true;
	} else {
		commentBodyPath = bodyPath;
		if (fnPath.isMethod()) {
			isMethod = true;
			if (fnPath.isClassMethod() && !fnPath.node.static) isProtoMethod = true;
		}
	}

	const props = fnPath[FUNCTION_PROPS];
	const scopes = [...props.scopes.values()]
		.sort((a, b) => (a.blockId > b.blockId ? 1 : -1)); // Sort by block ID in ascending order

	const {superVarNode} = props;
	let superVarName,
		superIsTemp = false;
	if (superVarNode) {
		superVarName = superVarNode.name;
		if (superVarNode[IS_INTERNAL]) superIsTemp = true;
	}

	insertTrackerComment(
		commentBodyPath, props.id, scopes, isMethod, isProtoMethod,
		superVarName, superIsTemp, state
	);

	// Insert reveal code
	// (after `const scopeId_3 = tracker();` already inserted in `blockStatementExitVisitor()`)
	// `if (scopeId_3 === null) return tracker([scopeId_1, a], [scopeId_2, b, arguments]);`
	bodyPath.get('body.0').insertAfter(
		t.ifStatement(
			t.binaryExpression(
				'===',
				bodyPath[SCOPE_ID_VAR_NODE],
				t.nullLiteral()
			),
			t.returnStatement(
				t.callExpression(
					state[TRACKER_VAR_NODE],
					scopes.map(({scopeIdVarNode, varNames}) => (
						t.arrayExpression([
							scopeIdVarNode,
							...[...varNames].map(name => (
								superIsTemp && name === superVarName ? superVarNode : internalIdentifier(name)
							))
						])
					))
				)
			)
		)
	);

	// Revert function vars back to as was before entering function
	state[PARENT_FUNCTION_PATH] = fnPath[PARENT_FUNCTION_PATH];
	state[PARENT_FULL_FUNCTION_PATH] = fnPath[PARENT_FULL_FUNCTION_PATH];
}

/**
 * Visitor to convert `for` and `while` with single statement to statement block.
 * This is in case:
 *
 * `for`: variables defined in the init node are referenced in functions created in the body,
 * in which case a scope var statement will need to be inserted.
 * `for (const x of [1, 2, 3]) fns.push(() => x);` -> `for (const x of [1, 2, 3]) { fns.push(() => x); }`
 *
 * `while`: object or class with method using `super` defined in loop and requires temp var scoped
 * to inside loop.
 * e.g. `while (x) fn(class extends C {m() { super.m() }})`
 *
 * @param {Object} forOrWhilePath - Babel path object for `for` / `while` statement
 * @returns {undefined}
 */
function forOrWhileVisitor(forOrWhilePath) {
	const bodyPath = forOrWhilePath.get('body');
	if (!bodyPath.isBlockStatement()) bodyPath.replaceWith(t.blockStatement([bodyPath.node]));
}

/**
 * Visitor to set a block ID on every block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function blockStatementEnterVisitor(blockPath, state) {
	// Skip function bodies - `functionVisitor` adds block ID to function's body
	if (!blockPath.parentPath.isFunction()) enterBlock(blockPath, state);
}

/**
 * Visitor to add `const scopeId_3 = tracker();` at start of block if block is a scope.
 * Also adds any temp var declarations to start of block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function blockStatementExitVisitor(blockPath, state) {
	const scopeIdVarNode = blockPath[SCOPE_ID_VAR_NODE];
	if (!scopeIdVarNode) return;

	// Insert `const scopeId_3 = tracker();` statement at top of block
	const insertNodes = [
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					scopeIdVarNode,
					t.callExpression(state[TRACKER_VAR_NODE], [])
				)
			]
		)
	];

	// Insert temp vars declaration at top of block
	const tempVarNodes = blockPath[TEMP_VAR_NODES];
	if (tempVarNodes) {
		insertNodes.push(
			t.variableDeclaration('let', tempVarNodes.map(node => t.variableDeclarator(node)))
		);
	}

	blockPath.unshiftContainer('body', insertNodes);
}

/**
 * Visitor to track a variable used which is in an upper scope.
 * @param {Object} identifierPath - Babel path object for identifer
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function identifierVisitor(identifierPath, state) {
	// Skip internally-created identifiers
	const {node, parentPath} = identifierPath;
	if (node[IS_INTERNAL]) return;

	// Skip identifiers not used as vars e.g. `{a: 1}`
	if (!identifierIsVariable(identifierPath)) return;

	// If var name could clash with tracker, scopeId, or temp var names, record this
	const {name} = node;
	const trackerMatch = name.match(TRACKER_NAME_REGEXP);
	if (trackerMatch) state[TRACKER_VAR_NUMS_USED].push(trackerMatch[1] * 1 || 0);

	const scopeIdMatch = name.match(SCOPE_ID_NAME_REGEXP);
	if (scopeIdMatch) state[SCOPE_ID_VAR_NUMS_USED].push(scopeIdMatch[1] * 1 || 0);

	const tempMatch = name.match(TEMP_NAME_REGEXP);
	if (tempMatch) state[TEMP_VAR_NUMS_USED].push(tempMatch[1] * 1 || 0);

	// Find enclosing function
	let functionPath = state[PARENT_FUNCTION_PATH];
	if (!functionPath) {
		// If is top-level var declaration, record it
		// This is a hack to work around Babel not seeing vars created by
		// `@babel/plugin-transform-modules-commonjs` when binding is searched for later.
		// `.scope.getBinding()` returns undefined. So catalog them here and use the list
		// to identify their scope when they're encountered later.
		// https://stackoverflow.com/questions/63508492/babels-path-unshiftcontainer-does-not-add-newly-created-vars-to-scope
		// TODO Find a better way to do this.
		if (
			parentPath.isVariableDeclarator() && identifierPath.key === 'id'
			&& parentPath.parentPath.parentPath.isProgram()
		) {
			state[TOP_LEVEL_VAR_NAMES].add(name);
		}

		return;
	}

	// If is method key (e.g. `{ [x]() {} }`), treat as used in parent function
	if (functionPath.isMethod() && functionPath.node.computed) {
		const methodKeyPath = functionPath.get('key');
		if (
			identifierPath === methodKeyPath
			|| identifierPath.findParent(
				path => path === methodKeyPath || path === functionPath
			) === methodKeyPath
		) {
			functionPath = functionPath[PARENT_FUNCTION_PATH];
			if (!functionPath) return;
		}
	}

	// Skip function's own name
	if (parentPath === functionPath && identifierPath.key === 'id') return;

	// Skip class's own name in constructor
	if (functionPath.node.kind === 'constructor') {
		const classPath = functionPath.parentPath.parentPath;
		assert(classPath.isClass());
		const classIdNode = classPath.node.id;
		if (classIdNode && classIdNode.name === identifierPath.node.name) return;
	}

	// Handle `arguments` where refers to implicit `arguments` var created by function.
	// NB In non-strict mode, could also refer to an external user-defined var.
	const binding = identifierPath.scope.getBinding(name);
	if (name === 'arguments') {
		const fullFunctionPath = state[PARENT_FULL_FUNCTION_PATH];
		if (!binding || (fullFunctionPath && !binding.path.findParent(path => path === fullFunctionPath))) {
			processArguments(state);
			return;
		}
	}

	// Find scope where var is defined (i.e. `const`, `let`, `var`, `function` statement).
	// Skip if is global (no binding found).
	let bindingBlockPath;
	if (!binding) {
		if (state[TOP_LEVEL_VAR_NAMES].has(name) || COMMON_JS_VARS.has(name)) {
			// Treat `exports` etc as external vars, not globals + identify top-level vars.
			bindingBlockPath = state[PROGRAM_PATH];
		} else {
			// Global var
			return;
		}
	} else {
		// Skip if var not defined outside function where it's used
		const bindingPath = binding.path;
		if (bindingPath === functionPath || bindingPath.findParent(path => path === functionPath)) return;

		// Locate statement block containing var declaration
		bindingBlockPath = locateBindingBlockPath(bindingPath, name, state);

		assertWithLocation(
			bindingBlockPath.isBlockStatement() || bindingBlockPath.isProgram(), bindingBlockPath, state,
			`Unexpected variable binding block type '${bindingBlockPath.node.type}' for var '${name}'`
		);
	}

	// Record variable use
	recordVarUse(name, functionPath, bindingBlockPath, state);
}

function locateBindingBlockPath(bindingPath, name, state) {
	if (bindingPath.isFunctionDeclaration() || bindingPath.isClassDeclaration()) {
		// Function declaration
		// Traverse down past label prefix(es) e.g. `a: function x() {}`
		let bindingParentPath = bindingPath.parentPath;
		while (bindingParentPath.isLabeledStatement()) {
			bindingParentPath = bindingParentPath.parentPath;
		}
		return bindingParentPath;
	}

	if (bindingPath.isFunctionExpression()) {
		// Function name - scoped to function body
		return bindingPath.get('body');
	}

	if (bindingPath.isCatchClause()) return bindingPath.get('body');

	const bindingParentPath = bindingPath.findParent(
		path => path.isVariableDeclaration() || path.isFunction()
	);
	if (bindingParentPath.isFunction()) {
		// Function parameter - scoped to function body
		assertWithLocation(
			bindingPath.isIdentifier() || bindingPath.isObjectPattern() || bindingPath.isArrayPattern()
				|| bindingPath.isAssignmentPattern() || bindingPath.isRestElement(),
			bindingPath, state,
			`Unexpected variable binding type '${bindingPath.node.type}' for var '${name}'`
		);

		return bindingParentPath.get('body');
	}

	if (bindingParentPath.node.kind === 'var') {
		// `var` statement - scoped to parent function
		const bindingFnPath = bindingParentPath.findParent(path => path.isFunction() || path.isProgram());
		if (bindingFnPath.isFunction()) return bindingFnPath.get('body');
		return bindingFnPath;
	}

	// `const` or `let` statement - scoped to block
	const varParentPath = bindingParentPath.parentPath;
	if (varParentPath.isFor()) {
		// `for (const x = ...) {}` - var scoped to `for` statement block
		return varParentPath.get('body');
	}

	return varParentPath;
}

/**
 * Visitor to track use of `this` which refers to an upper scope.
 * Record the var same as for identifiers.
 * (only applies inside arrow functions)
 * @param {Object} thisPath - Babel path object for `this`
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function thisExpressionVisitor(thisPath, state) {
	processThisOrArguments('this', state);
}

/**
 * Visitor to track use of `super` in methods.
 * @param {Object} superPath - Babel path object for `super`
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function superVisitor(superPath, state) {
	// Find method `super` is in
	const fnPath = state[PARENT_FULL_FUNCTION_PATH];
	assertWithLocation(fnPath.isMethod(), fnPath, state);

	// Skip if another incidence of `super` in this method already encountered
	const fnProps = fnPath[FUNCTION_PROPS];
	if (fnProps.superVarNode) return;

	// Get var node for enclosing class/object
	const isClass = fnPath.isClassMethod(),
		encloserPath = isClass ? fnPath.parentPath.parentPath : fnPath.parentPath,
		encloserNode = encloserPath.node,
		blockPath = encloserPath.findParent(path => path.isBlockStatement() || path.isProgram());

	let varNode = encloserNode[SUPER_VAR_NODE];
	if (!varNode) {
		varNode = getEncloserVarNode(superPath, encloserPath, encloserNode, blockPath, isClass, state);
		encloserNode[SUPER_VAR_NODE] = varNode;
	}

	// Record var use (unless is class name in class constructor where it acts as an internal var)
	if (!isClass || fnPath.node.kind !== 'constructor' || varNode !== encloserNode.id) {
		recordVarUse(varNode.name, fnPath, blockPath, state);
	}

	fnProps.superVarNode = varNode;
}

function getEncloserVarNode(superPath, encloserPath, encloserNode, blockPath, isClass, state) {
	// If class method, use class name (if not overridden in local scope)
	const {parentPath} = encloserPath;
	if (isClass) {
		assertWithLocation(encloserPath.isClass(), encloserPath, state);
		const idNode = encloserNode.id;
		if (idNode) {
			// Class is named - use class name if not overridden in local scope.
			// NB Need to check for existence of binding, as Babel doesn't populate it in some cases
			// if this constructor has been created (in `classExitVisitor`).
			const binding = superPath.scope.getBinding(idNode.name);
			if (!binding || binding.path === encloserPath) return idNode;
		} else if (parentPath.isVariableDeclarator()) {
			// Class is not named.
			// If class is named implicitly by `var C = class {}` and name not overridden in local scope,
			// name class explicitly and use name.
			const varNode = parentPath.node.id;
			if (t.isIdentifier(varNode) && superPath.scope.getBinding(varNode.name).path === parentPath) {
				encloserNode.id = varNode;
				return varNode;
			}
		}
	}

	// If defined with `const x = ...`, and var not overridden in local scope, use var name
	// (`const` only, so value cannot change)
	if (parentPath.isVariableDeclarator() && parentPath.parentPath.node.kind === 'const') {
		const idNode = parentPath.node.id;
		if (t.isIdentifier(idNode) && superPath.scope.getBinding(idNode.name).path === parentPath) {
			return idNode;
		}
	}

	// Assign to temp var.
	// `{ ... }` -> `temp_0 = { ... }`
	// Class declarations are converted to var declaration
	// `class X { foo() { const X = 1; super.foo() } }`
	// -> `let X = temp_0 = class X { foo() { const X = 1; super.foo() } };`
	const varNode = createTempVarNode(state);
	const tempVarNodes = [varNode];

	let replacementNode = encloserNode,
		tempType = 'assign';
	if (isClass && !encloserNode.id) {
		// Ensure class name is preserved if gained implicitly from assignment
		let idNode,
			keyIsComputed = false,
			accessIsComputed = false;
		if (parentPath.isAssignmentExpression()) {
			if (encloserPath.key === 'right') {
				const parentNode = parentPath.node;
				if (parentNode.operator === '=') {
					const leftNode = parentNode.left;
					if (t.isIdentifier(leftNode)) idNode = leftNode;
				}
			}
		} else if (parentPath.isVariableDeclarator()) {
			if (encloserPath.key === 'init') {
				const assignedToNode = parentPath.node.id;
				if (t.isIdentifier(assignedToNode)) idNode = assignedToNode;
			}
		} else if (parentPath.isProperty()) {
			if (encloserPath.key === 'value') {
				const keyPath = parentPath.get('key'),
					keyNode = keyPath.node;
				keyIsComputed = parentPath.node.computed;

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
					idNode = createTempVarNode(state);
					tagTempVarWithType(idNode, 'key');

					tempVarNodes.push(idNode);
					accessIsComputed = true;
					keyPath.replaceWith(
						t.assignmentExpression(
							'=',
							idNode,
							t.binaryExpression('+', keyNode, t.stringLiteral(''))
						)
					);
				}
			}
		}

		if (idNode) {
			// Class will be named by assignment
			// `let C = class {};` -> `let C = temp_3 = {C: class {}}.C;`
			// Using object prop to provide class name rather than setting directly, as that
			// would add a variable to scope which could potentially interfere with a var
			// with same name in an upper scope.
			replacementNode = t.memberExpression(
				t.objectExpression([t.objectProperty(idNode, replacementNode, keyIsComputed)]),
				idNode,
				accessIsComputed
			);
			tempType = 'object';
		} else {
			// Class will remain anonymous
			// `class {}` -> `temp_3 = (0, class {})`
			replacementNode = t.sequenceExpression([t.numericLiteral(0), replacementNode]);
			tempType = 'anon';
		}
	}

	replacementNode = t.assignmentExpression('=', varNode, replacementNode);

	// If class declaration, replace with `let ... = ...`.
	// `class X {}` -> `let X = temp_3 = class X {}`
	// Will only happen if var with same name as class name is in scope inside method using `super`.
	if (t.isClassDeclaration(encloserNode)) {
		encloserNode.type = 'ClassExpression';
		replacementNode = t.variableDeclaration(
			'let', [t.variableDeclarator(encloserNode.id, replacementNode)]
		);
		tempType = `let,${tempType}`;
	}

	// Not using Babel's `.replaceWith()` to avoid remaking `path`s
	// which would then lose internal properties set on them
	replaceWith(encloserPath, replacementNode);

	// Create temp vars at start of block (will be inserted in `blockStatementExitVisitor()`)
	tagTempVarWithType(varNode, tempType);
	(blockPath[TEMP_VAR_NODES] || (blockPath[TEMP_VAR_NODES] = [])).push(...tempVarNodes);

	return varNode;
}

function createTempVarNode(state) {
	const varNode = internalIdentifier(`${TEMP_VAR_NAME}_${createBlockId(state)}`);
	state[TEMP_VAR_NODES].push(varNode);
	return varNode;
}

function tagTempVarWithType(node, type) {
	node.leadingComments = [{
		type: 'CommentBlock',
		value: `${TEMP_COMMENT_PREFIX}${type}`
	}];
}

/**
 * Visitor to track use of `arguments` which refers to an upper scope.
 * Record the var same as for identifiers, and also record an array of
 * argument names in call to `tracker()`.
 * (only applies inside arrow functions)
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function processArguments(state) {
	const res = processThisOrArguments('arguments', state);
	if (!res) return;

	// Add arguments names to scope objects.
	// When all params are simple vars (i.e. `function(a, b, c) {}`), values of `a` and `arguments[0]`
	// are linked. Setting `a` results in `arguments[0]` also being set to same value + vica versa.
	// If params use default values, destructuring or spreading, they are not linked.
	// So only record `argNames` if all params are simple vars.
	// TODO `arguments` is also not linked to param vars in strict mode functions.
	// TODO Strict mode is automatic in ESM modules - detect this.
	const {scopes, bindingFunctionPath} = res;
	const argNames = [];
	for (const paramNode of bindingFunctionPath.node.params) {
		if (!t.isIdentifier(paramNode)) return;
		argNames.push(paramNode.name);
	}

	for (const scope of scopes) {
		if (scope.argNames === undefined) scope.argNames = argNames;
	}
}

/**
 * Find what function a use of `this`/`arguments` derives from.
 * (only applies to arrow functions, where `this` in the arrow function
 * refers to `this` in enclosing function)
 * @param {string} name - Var name (i.e 'this' or 'arguments')
 * @param {Object} state - Babel state object for file
 * @returns {Object|undefined}
 * @returns {Array<Object>} .scopes - Array of scope objects
 * @returns {Object} .bindingFunctionPath - Babel path for function where `this`/`arguments derives from
 */
function processThisOrArguments(name, state) {
	// Find nearest non-arrow function above
	const bindingFunctionPath = state[PARENT_FULL_FUNCTION_PATH];
	if (!bindingFunctionPath) return;

	// Skip if enclosing function is not arrow function (i.e. `this`/`arguments` is local)
	const functionPath = state[PARENT_FUNCTION_PATH];
	if (functionPath === bindingFunctionPath) return;

	// Get function's statement block
	const bindingBlockPath = bindingFunctionPath.get('body');
	assertWithLocation(
		bindingBlockPath.isBlockStatement(), bindingBlockPath, state,
		`Unexpected variable binding block type '${bindingBlockPath.node.type}' for var '${name}'`
	);

	// Record variable use
	const scopes = recordVarUse(name, functionPath, bindingBlockPath, state);

	// Return scopes + bindingFunctionPath (used in `processArguments()`)
	return {scopes, bindingFunctionPath}; // eslint-disable-line consistent-return
}

/**
 * Record use of var in call to `tracker()`.
 * @param {string} name - Var name
 * @param {Object} functionPath - Babel path for function in which the use of var occurs
 * @param {Object} bindingBlockPath - Babel path for statement block which includes var definition
 * @param {Object} state - Babel state object for file
 * @returns {Array<Object>} - Array of scope objects
 */
function recordVarUse(name, functionPath, bindingBlockPath, state) {
	// Init scope on statement block which includes var definition
	const blockId = bindingBlockPath[BLOCK_ID];
	let scopeIdVarNode = bindingBlockPath[SCOPE_ID_VAR_NODE];
	if (!scopeIdVarNode) scopeIdVarNode = initScope(bindingBlockPath, blockId, state);

	// Record var use on all functions above
	const scopes = [];
	do {
		// Record var use in function props
		const fnScopes = functionPath[FUNCTION_PROPS].scopes;
		let scope = fnScopes.get(blockId);
		if (!scope) {
			const blockName = bindingBlockPath[BLOCK_NAME];
			scope = {blockId, scopeIdVarNode, varNames: new Set(), blockName, argNames: undefined};
			fnScopes.set(blockId, scope);
		}
		scope.varNames.add(name);

		scopes.push(scope);

		functionPath = functionPath.findParent(path => path.isFunction() || path === bindingBlockPath);
	} while (functionPath !== bindingBlockPath);

	// Return array of scopes (used in `processArguments()`)
	return scopes;
}

/**
 * Insert tracker comment at start of body.
 * @param {Object} bodyPath - Babel path object for body
 * @param {number} id - Block ID
 * @param {Array<object>} scopes - Array of scopes
 * @param {boolean} isMethod - `true` if is method
 * @param {boolean} isProtoMethod - `true` if is class prototype method
 * @param {string|undefined} superVarName - Var name referred to by `super`
 * @param {boolean} superIsTemp - `true` if super var is temp (should be substituted with `super`)
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function insertTrackerComment(
	bodyPath, id, scopes, isMethod, isProtoMethod, superVarName, superIsTemp, state
) {
	// eslint-disable-next-line max-len
	// `/*livepack_track:{"id":3,"scopes":[{"blockId":1,"varNames":["a"],"blockName":"index"}, {"blockId":2,"varNames":["b", "arguments"],"blockName":"outer",argNames:["b"]}],"filename":"/path/to/file.js","isMethod":true,"superVarName":"b"}*/`
	const {filename} = state.file.opts;
	const substituteSuper = superIsTemp ? superVarName : undefined;
	const propsStr = JSON.stringify({
		id,
		scopes: scopes.map(({blockId, varNames, blockName, argNames}) => ({
			blockId,
			varNames: [...varNames].map(varName => (varName === substituteSuper ? 'super' : varName)),
			...(blockName ? {blockName} : null),
			...(argNames ? {argNames} : null)
		})),
		...(filename ? {filename} : null),
		...(isMethod ? {[isProtoMethod ? 'isProtoMethod' : 'isMethod']: true} : null),
		...(superVarName && !superIsTemp ? {superVarName} : null)
	});

	const blockNode = bodyPath.node;
	(blockNode.innerComments || (blockNode.innerComments = [])).unshift({
		type: 'CommentBlock',
		value: `${TRACKER_COMMENT_PREFIX}${propsStr}`
	});
}

/**
 * Set unique block ID on path.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - Babel state object for file
 * @returns {number} - Block ID
 */
function enterBlock(blockPath, state) {
	const blockId = createBlockId(state);
	blockPath[BLOCK_ID] = blockId;
	return blockId;
}

/**
 * Create unique block ID.
 * @param {Object} state - Babel state object for file
 * @returns {number} - Block ID
 */
function createBlockId(state) {
	return state[BLOCK_ID]++;
}

/**
 * Init scope on statement block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {number} blockId - Block ID
 * @param {Object} state - Babel state object for file
 * @returns {Object} - `scopeId` var node (named e.g. 'scopeId_100')
 */
function initScope(blockPath, blockId, state) {
	// Create scopeId var node + record on path
	const scopeIdVarNode = internalIdentifier(`${SCOPE_ID_VAR_NAME}_${blockId}`);
	state[SCOPE_ID_VAR_NODES].push(scopeIdVarNode);
	blockPath[SCOPE_ID_VAR_NODE] = scopeIdVarNode;

	// Get block name and record on path
	let blockName;
	const parentBindingPath = blockPath.parentPath;
	if (!parentBindingPath) {
		const {filename} = state.file.opts;
		if (filename) blockName = pathParse(filename).name;
	} else if (parentBindingPath.isFunction()) {
		const idNode = parentBindingPath.node.id;
		if (idNode) blockName = idNode.name;
	}
	blockPath[BLOCK_NAME] = blockName;

	return scopeIdVarNode;
}

/**
 * Find first integer (positive or zero) which is not in array.
 * @param {Array<number>} nums - Array of integers (positive or zero)
 * @returns {number} - First unused number
 */
function getUnusedNum(nums) {
	nums.sort();

	let num = 0;
	for (const usedNum of nums) {
		if (usedNum > num) break;
		num = usedNum + 1;
	}
	return num;
}

/**
 * Create identifier node, flagged as internal.
 * Flag prevents identifier visitor acting on identifiers which livepack has created.
 * @param {string} name - Identifier name
 * @returns {Object} - AST Node object
 */
function internalIdentifier(name) {
	const node = t.identifier(name);
	node[IS_INTERNAL] = true;
	return node;
}

/**
 * Assert with error message including reference to code location which caused the error.
 * NB Babel includes file path in error output itself.
 * @param {*} condition - Condition - if falsy, error will be thrown
 * @param {Object} nodeOrPath - AST Node object or Babel path object
 * @param {Object} state - Babel state object
 * @param {string} message
 * @throws {Error} - If assertion fails
 */
function assertWithLocation(condition, nodeOrPath, state, message) {
	if (condition) return;

	const {filename} = state.file.opts;
	const node = nodeOrPath.node || nodeOrPath;
	const {start} = node.loc || {start: {line: '?', column: '?'}};

	if (!message) message = 'Invariant failed';
	message += ` (${filename ? `${filename}:` : ''}${start.line}:${start.column})`;
	throw new Error(message);
}
