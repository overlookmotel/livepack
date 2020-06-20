/* --------------------
 * livepack module
 * Babel plugin
 * ------------------*/

'use strict';

// Modules
const pathSep = require('path').sep,
	{AssertionError} = require('assert'),
	t = require('@babel/types');

// Imports
const {identifierIsVariable, TRACKER_COMMENT_PREFIX} = require('./shared.js');

// Constants
const TRACKER_PATH = `${__dirname}/tracker.js`,
	LIVEPACK_DIR_PATH = `${__dirname}${pathSep}`,
	TRACKER_VAR_NAME = Symbol('livepack.TRACKER_VAR_NAME'),
	SCOPE_ID_BASE_VAR_NAME = Symbol('livepack.SCOPE_ID_BASE_VAR_NAME'),
	SCOPE_ID_VAR_NAME = Symbol('livepack.SCOPE_ID_VAR_NAME'),
	BLOCK_ID = Symbol('livepack.BLOCK_ID'),
	FUNCTION_PROPS = Symbol('livepack.FUNCTION_PROPS');

// Exports

let nextBlockId = 1;

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
	if (!trackerPath) trackerPath = TRACKER_PATH;

	// Return visitors
	// TODO Define a visitor for class definitions to ensure tracker comment block comes at start
	// of class definition (before its methods) and covers all vars used in class
	return {
		visitor: {
			Program(path, state) {
				programVisitor(path, state, trackerPath);
			},
			BlockStatement: blockStatementVisitor,
			Function: {
				enter: functionEnterVisitor,
				exit: functionExitVisitor
			},
			Identifier: identifierVisitor,
			ThisExpression: thisExpressionVisitor
		}
	};
};

/**
 * Visitor to:
 *   1. determine var names for tracker and scopeId vars in this file
 *   2. insert tracker import statement at top of file
 *
 * @param {Object} path - Babel path object for program
 * @param {Object} state - Babel state object for file
 * @param {string} trackerPath - Import path for tracker (usually 'livepack/tracker')
 * @returns {undefined}
 */
function programVisitor(path, state, trackerPath) {
	// Avoid adding tracking code to livepack's own codebase
	if (isLivepackCode(state)) {
		path.stop();
		return;
	}

	// Get unique names for tracker and scopeId vars
	const trackerVarName = getTrackerVarName(path, trackerPath);
	state[TRACKER_VAR_NAME] = trackerVarName;
	state[SCOPE_ID_BASE_VAR_NAME] = getScopeIdVarName(path);

	// Insert tracker import statement at top of file
	// `const tracker = require('livepack/tracker');`
	path.unshiftContainer('body', [
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					t.identifier(trackerVarName),
					t.callExpression(t.identifier('require'), [t.stringLiteral(trackerPath)])
				)
			]
		)
	]);

	// Set block ID
	enterBlock(path);
}

/**
 * Visitor to set a block ID on every block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function blockStatementVisitor(blockPath) {
	// Skip function bodies - `functionVisitor` adds block ID to function's body
	if (!blockPath.parentPath.isFunction()) enterBlock(blockPath);
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

	// Insert `scopeId` var definition at start of function body
	const blockId = enterBlock(bodyPath);
	addScopeNode(bodyPath, blockId, state);

	// Init functions props
	fnPath.node[FUNCTION_PROPS] = {id: blockId, scopes: new Map()};
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
	const props = fnPath.node[FUNCTION_PROPS];
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
				t.identifier(bodyPath.node[SCOPE_ID_VAR_NAME]),
				t.nullLiteral()
			),
			t.returnStatement(
				t.callExpression(
					t.identifier(state[TRACKER_VAR_NAME]),
					scopes.map(({scopeIdVarName, varNames}) => (
						t.arrayExpression([
							t.identifier(scopeIdVarName),
							...[...varNames].map(name => t.identifier(name))
						])
					))
				)
			)
		)
	);
}

/**
 * Visitor to track a variable used which is in an upper scope.
 * @param {Object} identifierPath - Babel path object for identifer
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function identifierVisitor(identifierPath, state) {
	// Skip tracker and scopeId vars
	const {node} = identifierPath;
	const {name} = node;
	if (name === state[TRACKER_VAR_NAME]) return;
	if (name.startsWith(state[SCOPE_ID_BASE_VAR_NAME])) return;

	// Skip identifiers not used as vars e.g. `{a: 1}`
	if (!identifierIsVariable(identifierPath)) return;

	// Handle `arguments`
	// TODO `arguments` could also be a defined var
	// TODO `arguments` could also be over-written with another value
	// (which could be the arguments object generated in *another* function)
	if (name === 'arguments') {
		processArguments(identifierPath, state);
		return;
	}

	// Find enclosing function
	const functionPath = identifierPath.findParent(path => path.isFunction());
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
	processThisOrArguments('this', thisPath, state);
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
	const res = processThisOrArguments('arguments', argsPath, state);
	if (!res) return;

	// If arguments var names already recorded, exit
	const {scope, bindingFunctionPath} = res;
	if (scope.argNames) return;

	// Add arguments names to scope object
	// TODO `arguments` behaves differently in strict / non-strict mode
	scope.argNames = bindingFunctionPath.node.params.map((paramNode) => {
		if (t.isIdentifier(paramNode)) return paramNode.name;
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
 * @param {Object} varPath - Babel path object for `this` or `arguments`
 * @param {Object} state - Babel state object for file
 * @returns {Object|undefined}
 * @returns {Object} .scope - Scope object
 * @returns {Object} .bindingFunctionPath - Babel path for function where `this`/`arguments derives from
 */
function processThisOrArguments(name, varPath, state) {
	// Find enclosing function
	const functionPath = varPath.findParent(path => path.isFunction());
	if (!functionPath) return;

	// Skip if enclosing function is not arrow function (i.e. `this`/`arguments` is local)
	if (!functionPath.isArrowFunctionExpression()) return;

	// Find nearest non-arrow function above
	const bindingFunctionPath = functionPath.findParent(
		path => path.isFunction() && !path.isArrowFunctionExpression()
	);
	if (!bindingFunctionPath) return;

	// Get function's statement block
	const bindingBlockPath = bindingFunctionPath.get('body');
	assertWithLocation(
		bindingBlockPath.isBlockStatement(), bindingBlockPath, state,
		`Unexpected variable binding block type '${bindingBlockPath.node.type}' for var 'this'`
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
	// Insert `scopeId` var definition at start of statement block which includes var definition
	const {node} = bindingBlockPath;
	const blockId = node[BLOCK_ID];
	let scopeIdVarName = node[SCOPE_ID_VAR_NAME];
	if (!scopeIdVarName) scopeIdVarName = addScopeNode(bindingBlockPath, blockId, state);

	// Record var use in function props
	const {scopes} = functionPath.node[FUNCTION_PROPS];
	let scope = scopes.get(blockId);
	if (!scope) {
		scope = {blockId, scopeIdVarName, varNames: new Set(), argNames: undefined};
		scopes.set(blockId, scope);
	}
	scope.varNames.add(name);

	return scope;
}

/**
 * Set unique block ID on node.
 * @param {Object} blockPath - Babel path object for statement block
 * @returns {undefined}
 */
function enterBlock(blockPath) {
	const blockId = nextBlockId++;
	blockPath.node[BLOCK_ID] = blockId;
	return blockId;
}

/**
 * Add `const scopeId_0 = tracker();` at top of statement block.
 * @param {Object} blockPath - Babel path object for identifer
 * @param {number} blockId - Block ID
 * @param {Object} state - Babel state object for file
 * @returns {string} - `scopeId` var name e.g. 'scopeId_100'
 */
function addScopeNode(blockPath, blockId, state) {
	// Get var name for scopeId + record on node
	const {node} = blockPath;
	const scopeIdVarName = `${state[SCOPE_ID_BASE_VAR_NAME]}${blockId}`;
	node[SCOPE_ID_VAR_NAME] = scopeIdVarName;

	// Insert `const scopeId_0 = tracker();` statement at top of block
	const scopeNode = t.variableDeclaration(
		'const', [
			t.variableDeclarator(
				t.identifier(scopeIdVarName),
				t.callExpression(t.identifier(state[TRACKER_VAR_NAME]), [])
			)
		]
	);

	if (blockPath.isProgram()) {
		// Insert after tracker import statement
		blockPath.get('body.0').insertAfter(scopeNode);
	} else {
		blockPath.unshiftContainer('body', [scopeNode]);
	}

	// Return `scopeId` var name
	return scopeIdVarName;
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
 * Get unique var name for tracker import.
 * Will return 'tracker' is that var is not used anywhere in file.
 * Otherwise, selects the first var name with digits suffix e.g. 'tracker2'.
 *
 * @param {Object} path - Babel path object for file
 * @returns {string} - Var name
 */
function getTrackerVarName(path) {
	const usedNums = [];
	path.traverse({
		Identifier(identifierPath) {
			const match = identifierPath.node.name.match(/^tracker([1-9]\d*)?$/);
			if (match) usedNums.push(match[1] * 1 || 0);
		}
	});

	usedNums.sort();
	let lastNum = -1;
	for (const usedNum of usedNums) {
		if (usedNum > lastNum + 1) break;
		lastNum = usedNum;
	}

	return `tracker${(lastNum + 1) || ''}`;
}

/**
 * Get unique base var name for scopeId vars.
 * Will return 'scopeId_' if no vars called 'scopeId_<digits>' in file.
 * Otherwise adds digits before the '_' to ensure unique e.g. 'scopeId2_'.
 *
 * @param {Object} path - Babel path object for file
 * @returns {string} - Base var name
 */
function getScopeIdVarName(path) {
	const usedNums = [];
	path.traverse({
		Identifier(identifierPath) {
			const match = identifierPath.node.name.match(/^scopeId(\d*)?_\d+$/);
			if (match) usedNums.push(match[1] * 1 || 0);
		}
	});

	usedNums.sort();
	let lastNum = -1;
	for (const usedNum of usedNums) {
		if (usedNum > lastNum + 1) break;
		lastNum = usedNum;
	}

	return `scopeId${(lastNum + 1) || ''}_`;
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
