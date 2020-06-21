/* --------------------
 * livepack module
 * Babel plugin
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, sep: pathSep} = require('path'),
	assert = require('assert'),
	{AssertionError} = assert,
	{isString} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {identifierIsVariable, TRACKER_COMMENT_PREFIX} = require('./shared.js');

// Constants
const TRACKER_PATH = pathJoin(__dirname, 'tracker.js'),
	LIVEPACK_DIR_PATH = pathJoin(__dirname, pathSep),
	TRACKER_VAR_NAME = 'tracker',
	TRACKER_VAR_NUMS_USED = Symbol('livepack.TRACKER_VAR_NUMS_USED'),
	TRACKER_VAR_NODE = Symbol('livepack.TRACKER_VAR_NODE'),
	SCOPE_ID_VAR_NAME = 'scopeId',
	SCOPE_ID_VAR_NUMS_USED = Symbol('livepack.SCOPE_ID_VAR_NUMS_USED'),
	SCOPE_ID_VAR_NODES = Symbol('livepack.SCOPE_ID_VAR_NODES'),
	SCOPE_ID_VAR_NODE = Symbol('livepack.SCOPE_ID_VAR_NODE'),
	BLOCK_ID = Symbol('livepack.BLOCK_ID'),
	FUNCTION_PROPS = Symbol('livepack.FUNCTION_PROPS'),
	PARENT_FUNCTION_PATH = Symbol('livepack.PARENT_FUNCTION_PATH'),
	PARENT_FULL_FUNCTION_PATH = Symbol('livepack.PARENT_FULL_FUNCTION_PATH'),
	IS_INTERNAL = Symbol('livepack.IS_INTERNAL');

// Exports

let nextBlockId = 1;
const TRACKER_NAME_REGEXP = new RegExp(`^${TRACKER_VAR_NAME}([1-9]\\d*)?$`),
	SCOPE_ID_NAME_REGEXP = new RegExp(`^${SCOPE_ID_VAR_NAME}(\\d*)?_\\d+$`);

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
 * @returns {Object} - Babel plugin object
 */
module.exports = function livepackBabelPlugin(api, options) {
	// Get tracker require path
	let {trackerPath} = options;
	if (trackerPath == null) {
		trackerPath = TRACKER_PATH;
	} else {
		assert(isString(trackerPath), 'options.trackerPath must be a string if provided');
	}

	// Return visitors
	// TODO Define a visitor for class definitions to ensure tracker comment block comes at start
	// of class definition (before its methods) and covers all vars used in class
	return {
		visitor: {
			Program: {
				enter: programEnterVisitor,
				exit: (path, state) => programExitVisitor(path, state, trackerPath)
			},
			Function: {
				enter: functionEnterVisitor,
				exit: functionExitVisitor
			},
			BlockStatement: {
				enter: blockStatementEnterVisitor,
				exit: blockStatementExitVisitor
			},
			Identifier: identifierVisitor,
			ThisExpression: thisExpressionVisitor
		}
	};
};

/**
 * Visitor to determine var names for tracker and scopeId vars in this file.
 * @param {Object} path - Babel path object for program
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function programEnterVisitor(path, state) {
	// Avoid adding tracking code to livepack's own codebase
	if (isLivepackCode(state)) {
		path.stop();
		return;
	}

	// Create node for tracker var + init array to track invalid names
	const trackerVarNode = t.identifier(TRACKER_VAR_NAME);
	trackerVarNode[IS_INTERNAL] = true;
	state[TRACKER_VAR_NODE] = trackerVarNode;
	state[TRACKER_VAR_NUMS_USED] = [];

	// Init arrays to track scopeId vars
	state[SCOPE_ID_VAR_NUMS_USED] = [];
	state[SCOPE_ID_VAR_NODES] = [];

	// Init parent function state vars
	state[PARENT_FUNCTION_PATH] = null;
	state[PARENT_FULL_FUNCTION_PATH] = null;

	// Set block ID
	enterBlock(path);
}

/**
 * Visitor to insert tracker import statement at top of file.
 * @param {Object} path - Babel path object for program
 * @param {Object} state - Babel state object for file
 * @param {string} trackerPath - Import path for tracker
 * @returns {undefined}
 */
function programExitVisitor(path, state, trackerPath) {
	// Insert `const scopeId_1 = tracker();` at top of file if file scope referenced
	blockStatementExitVisitor(path, state);

	// Insert tracker import statement at top of file (above `scopeId` definition)
	// `const tracker = require('/path/to/app/node_modules/livepack/lib/tracker.js');`
	const trackerVarNode = state[TRACKER_VAR_NODE];
	path.unshiftContainer('body', [
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					trackerVarNode,
					t.callExpression(t.identifier('require'), [t.stringLiteral(trackerPath)])
				)
			]
		)
	]);

	// Determine unique name for tracker var
	const trackerNum = getUnusedNum(state[TRACKER_VAR_NUMS_USED]);
	if (trackerNum !== 0) trackerVarNode.name = `tracker${trackerNum}`;

	// Determine unique name prefix for scopeId vars and set all vars to use this prefix
	const scopeIdNum = getUnusedNum(state[SCOPE_ID_VAR_NUMS_USED]);
	if (scopeIdNum !== 0) {
		const scopeIdName = `${SCOPE_ID_VAR_NAME}${scopeIdNum}`;
		const pos = SCOPE_ID_VAR_NAME.length;
		for (const node of state[SCOPE_ID_VAR_NODES]) {
			node.name = `${scopeIdName}${node.name.slice(pos)}`;
		}
	}
}

/**
 * Visitor to add `scopeId` var definition at start of function body.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function functionEnterVisitor(fnPath, state) {
	// If arrow function with no body statement block, convert into block
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
	const blockId = enterBlock(bodyPath);
	initScope(bodyPath, blockId, state);

	// Init functions props
	fnPath[FUNCTION_PROPS] = {id: blockId, scopes: new Map()};

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
	// Insert tracking info comment at start of function body
	// eslint-disable-next-line max-len
	// `/*livepack_track:{"id":3,"scopes":[{"blockId":1,"varNames":["a"]}, {"blockId":2,"varNames":["b", "arguments"],argNames:["b"]}],"isMethod":true}*/`
	const props = fnPath[FUNCTION_PROPS];
	const scopes = [...props.scopes.values()]
		.sort((a, b) => (a.blockId > b.blockId ? 1 : -1)); // Sort by block ID in ascending order

	const propsStr = JSON.stringify({
		id: props.id,
		scopes: scopes.map(({blockId, varNames, argNames}) => ({
			blockId,
			varNames: [...varNames],
			...(argNames ? {argNames} : null)
		})),
		...(fnPath.isMethod() ? {isMethod: true} : null)
	});

	const blockNode = fnPath.get('body').node;
	let comments = blockNode.innerComments;
	if (!comments) comments = blockNode.innerComments = []; // eslint-disable-line no-multi-assign

	comments.unshift({
		type: 'CommentBlock',
		value: `${TRACKER_COMMENT_PREFIX}${propsStr}`
	});

	// Insert reveal code
	// `if (scopeId_3 === null) return tracker([scopeId_1, a], [scopeId_2, b, arguments]);`
	const bodyPath = fnPath.get('body');
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
							...[...varNames].map(name => t.identifier(name))
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
 * Visitor to set a block ID on every block.
 * @param {Object} blockPath - Babel path object for statement block
 * @returns {undefined}
 */
function blockStatementEnterVisitor(blockPath) {
	// Skip function bodies - `functionVisitor` adds block ID to function's body
	if (!blockPath.parentPath.isFunction()) enterBlock(blockPath);
}

/**
 * Visitor to add `const scopeId_100 = tracker();` at start of block if block is a scope.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function blockStatementExitVisitor(blockPath, state) {
	const scopeIdVarNode = blockPath[SCOPE_ID_VAR_NODE];
	if (!scopeIdVarNode) return;

	// Insert `const scopeId_0 = tracker();` statement at top of block
	blockPath.unshiftContainer('body', [
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					scopeIdVarNode,
					t.callExpression(state[TRACKER_VAR_NODE], [])
				)
			]
		)
	]);
}

/**
 * Visitor to track a variable used which is in an upper scope.
 * @param {Object} identifierPath - Babel path object for identifer
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function identifierVisitor(identifierPath, state) {
	// Skip internally-created identifiers
	const {node} = identifierPath;
	if (node[IS_INTERNAL]) return;

	// Skip identifiers not used as vars e.g. `{a: 1}`
	if (!identifierIsVariable(identifierPath)) return;

	// If var name could clash with tracker or scopeId var names, record this
	const {name} = node;
	const trackerMatch = name.match(TRACKER_NAME_REGEXP);
	if (trackerMatch) state[TRACKER_VAR_NUMS_USED].push(trackerMatch[1] * 1 || 0);

	const scopeIdMatch = name.match(SCOPE_ID_NAME_REGEXP);
	if (scopeIdMatch) state[SCOPE_ID_VAR_NUMS_USED].push(scopeIdMatch[1] * 1 || 0);

	// Handle `arguments`
	// TODO `arguments` could also be a defined var
	// TODO `arguments` could also be over-written with another value
	// (which could be the arguments object generated in *another* function)
	if (name === 'arguments') {
		processArguments(identifierPath, state);
		return;
	}

	// Find enclosing function
	// TODO Handle where identifer used as default in params
	const functionPath = state[PARENT_FUNCTION_PATH];
	if (!functionPath) return;

	// Skip function's own name
	if (identifierPath.parentPath === functionPath && identifierPath.key === 'id') return;

	// Find scope where var is defined (i.e. `const`, `let`, `var`, `function` statement)
	const binding = identifierPath.scope.getBinding(name);
	if (!binding) return;

	// Skip if var not defined outside function where it's used
	const bindingPath = binding.path;
	if (bindingPath === functionPath || bindingPath.findParent(path => path === functionPath)) return;

	// Locate statement block containing var declaration
	let bindingBlockPath;
	if (bindingPath.isIdentifier()) {
		// Function parameter - locate function body
		assertWithLocation(
			bindingPath.listKey === 'params', bindingPath, state,
			`Unexpected binding path listKey '${bindingPath.listKey}' for var '${name}'`
		);

		const bindingFnPath = bindingPath.parentPath;
		assertWithLocation(
			bindingFnPath.isFunction(), bindingFnPath, state,
			`Unexpected binding path listKey '${bindingFnPath.listKey}' for var '${name}'`
		);

		bindingBlockPath = bindingFnPath.get('body');
	} else if (bindingPath.isFunctionDeclaration()) {
		// Function declaration
		bindingBlockPath = bindingPath.parentPath;
	} else {
		// Variable declaration
		assertWithLocation(
			bindingPath.isVariableDeclarator(), bindingPath, state,
			`Unexpected variable declarator type '${bindingPath.node.type}' for var '${name}'`
		);
		const varPath = bindingPath.parentPath;
		assertWithLocation(
			varPath.isVariableDeclaration(), varPath, state,
			`Unexpected variable declaration type '${varPath.node.type}' for var '${name}'`
		);
		bindingBlockPath = varPath.parentPath;
	}

	assertWithLocation(
		bindingBlockPath.isBlockStatement() || bindingBlockPath.isProgram(), bindingBlockPath, state,
		`Unexpected variable binding block type '${bindingBlockPath.node.type}' for var '${name}'`
	);

	// Record variable use
	recordVarUse(name, functionPath, bindingBlockPath, state);
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
 * Visitor to track use of `arguments` which refers to an upper scope.
 * Record the var same as for identifiers, and also record an array of
 * argument names in call to `tracker()`.
 * (only applies inside arrow functions)
 * @param {Object} argsPath - Babel path object for `arguments`
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function processArguments(argsPath, state) {
	const res = processThisOrArguments('arguments', state);
	if (!res) return;

	// If arguments var names already recorded, exit
	const {scope, bindingFunctionPath} = res;
	if (scope.argNames) return;

	// Add arguments names to scope object
	// TODO `arguments` behaves differently in strict / non-strict mode
	scope.argNames = bindingFunctionPath.node.params.map((paramNode) => {
		if (t.isIdentifier(paramNode)) return paramNode.name;
		// TODO Handle destructured params (`function ({a, b: {c}}) {}`)
		// TODO Handle rest params (`function (...args) {}`)
		assertWithLocation(
			t.isAssignmentPattern(paramNode) && t.isIdentifier(paramNode.left), paramNode, state,
			`Unexpected function parameter type ${paramNode.type} / ${paramNode.left.type}`
		);
		return paramNode.left.name;
	});
}

/**
 * Find what function a use of `this`/`arguments` derives from.
 * (only applies to arrow functions, where `this` in the arrow function
 * refers to `this` in enclosing function)
 * @param {string} name - Var name (i.e 'this' or 'arguments')
 * @param {Object} state - Babel state object for file
 * @returns {Object|undefined}
 * @returns {Object} .scope - Scope object
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
	const scope = recordVarUse(name, functionPath, bindingBlockPath, state);

	// Return scope + bindingFunctionPath (used in `processArguments()`)
	// eslint-disable-next-line consistent-return
	return {scope, bindingFunctionPath};
}

/**
 * Record use of var in call to `tracker()`
 * @param {string} name - Var name
 * @param {Object} functionPath - Babel path for function in which the use of var occurs
 * @param {Object} bindingBlockPath - Babel path for statement block which includes var definition
 * @param {Object} state - Babel state object for file
 * @returns {Object} - Scope object
 */
function recordVarUse(name, functionPath, bindingBlockPath, state) {
	// Init scope on statement block which includes var definition
	const blockId = bindingBlockPath[BLOCK_ID];
	let scopeIdVarNode = bindingBlockPath[SCOPE_ID_VAR_NODE];
	if (!scopeIdVarNode) scopeIdVarNode = initScope(bindingBlockPath, blockId, state);

	// Record var use in function props
	const {scopes} = functionPath[FUNCTION_PROPS];
	let scope = scopes.get(blockId);
	if (!scope) {
		scope = {blockId, scopeIdVarNode, varNames: new Set(), argNames: undefined};
		scopes.set(blockId, scope);
	}
	scope.varNames.add(name);

	return scope;
}

/**
 * Set unique block ID on path.
 * @param {Object} blockPath - Babel path object for statement block
 * @returns {undefined}
 */
function enterBlock(blockPath) {
	const blockId = nextBlockId++;
	blockPath[BLOCK_ID] = blockId;
	return blockId;
}

/**
 * Init scope on statement block.
 * @param {Object} blockPath - Babel path object for identifer
 * @param {number} blockId - Block ID
 * @param {Object} state - Babel state object for file
 * @returns {Object} - `scopeId` var node (named e.g. 'scopeId_100')
 */
function initScope(blockPath, blockId, state) {
	// Create scopeId var node + record on path
	const scopeIdVarNode = t.identifier(`${SCOPE_ID_VAR_NAME}_${blockId}`);
	scopeIdVarNode[IS_INTERNAL] = true;
	state[SCOPE_ID_VAR_NODES].push(scopeIdVarNode);
	blockPath[SCOPE_ID_VAR_NODE] = scopeIdVarNode;
	return scopeIdVarNode;
}

/**
 * Check if file is in livepack's internal code (in `lib` dir).
 * @param {Object} state - Babel state object
 * @returns {boolean} - `true` if code comes from within livepack codebase
 */
function isLivepackCode(state) {
	const {filename} = state.file.opts;
	return !!filename && filename.startsWith(LIVEPACK_DIR_PATH);
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
	const {start} = node.loc;

	if (!message) message = 'Assertion failure';
	message += ` (${filename ? `${filename}:` : ''}${start.line}:${start.column})`;
	throw new AssertionError({message});
}

// TODO Remove this once finished developing
function logPath(name, path) { // eslint-disable-line no-unused-vars
	path = {...path};
	for (const key of [
		'parent', 'parentPath', 'scope', 'container', 'context', 'opts', 'contexts', 'hub'
	]) {
		delete path[key];
	}
	console.log(`${name}:`, path); // eslint-disable-line no-console
}
