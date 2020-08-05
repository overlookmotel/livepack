/* --------------------
 * livepack module
 * Babel plugin
 * ------------------*/

'use strict';

// Modules
const {join: pathJoin, parse: pathParse, sep: pathSep} = require('path'),
	assert = require('assert'),
	{AssertionError} = assert,
	{isString} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {identifierIsVariable, TRACKER_COMMENT_PREFIX} = require('./shared.js');

// Constants
const TRACKER_PATH = pathJoin(__dirname, 'tracker.js'),
	INIT_PATH = pathJoin(__dirname, 'init.js'),
	LIVEPACK_DIR_PATH = pathJoin(__dirname, pathSep),
	LIVEPACK_EXTERNALS_PATH = pathJoin(__dirname, 'serialize', 'external.js'),
	TRACKER_VAR_NAME = 'tracker',
	TRACKER_VAR_NUMS_USED = Symbol('livepack.TRACKER_VAR_NUMS_USED'),
	TRACKER_VAR_NODE = Symbol('livepack.TRACKER_VAR_NODE'),
	SCOPE_ID_VAR_NAME = 'scopeId',
	SCOPE_ID_VAR_NUMS_USED = Symbol('livepack.SCOPE_ID_VAR_NUMS_USED'),
	SCOPE_ID_VAR_NODES = Symbol('livepack.SCOPE_ID_VAR_NODES'),
	SCOPE_ID_VAR_NODE = Symbol('livepack.SCOPE_ID_VAR_NODE'),
	BLOCK_ID = Symbol('livepack.BLOCK_ID'),
	BLOCK_NAME = Symbol('livepack.BLOCK_NAME'),
	FUNCTION_PROPS = Symbol('livepack.FUNCTION_PROPS'),
	HAS_CONSTRUCTOR = Symbol('livepack.HAS_CONSTRUCTOR'),
	PARENT_FUNCTION_PATH = Symbol('livepack.PARENT_FUNCTION_PATH'),
	PARENT_FULL_FUNCTION_PATH = Symbol('livepack.PARENT_FULL_FUNCTION_PATH'),
	IS_INTERNAL = Symbol('livepack.IS_INTERNAL');

// Exports

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
	let {trackerPath, initPath} = options;
	if (trackerPath == null) {
		trackerPath = TRACKER_PATH;
	} else {
		assert(isString(trackerPath), 'options.trackerPath must be a string if provided');
	}
	if (initPath == null) {
		initPath = INIT_PATH;
	} else {
		assert(isString(initPath), 'options.initPath must be a string if provided');
	}

	// Return visitors
	// TODO Define a visitor for class definitions to ensure tracker comment block comes at start
	// of class definition (before its methods) rather than in constructor function body,
	// or move constructor to before all methods. Purpose is that when the function code is extracted with
	// `.toString()` and parsed, the tracker comment block for constructor must be found first.
	return {
		visitor: {
			Program: {
				enter: programEnterVisitor,
				exit: (path, state) => programExitVisitor(path, state, trackerPath, initPath)
			},
			Class: {
				enter: classEnterVisitor,
				exit: classExitVisitor
			},
			Function: {
				enter: functionEnterVisitor,
				exit: functionExitVisitor
			},
			For: forVisitor,
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
	state[TRACKER_VAR_NODE] = internalIdentifier(TRACKER_VAR_NAME);
	state[TRACKER_VAR_NUMS_USED] = [];

	// Init arrays to track scopeId vars
	state[SCOPE_ID_VAR_NUMS_USED] = [];
	state[SCOPE_ID_VAR_NODES] = [];

	// Init parent function state vars
	state[PARENT_FUNCTION_PATH] = null;
	state[PARENT_FULL_FUNCTION_PATH] = null;

	// Init block ID counter
	state[BLOCK_ID] = 1;

	// Set block ID
	enterBlock(path, state);
}

/**
 * Visitor to insert tracker + init import statements at top of file.
 * @param {Object} path - Babel path object for program
 * @param {Object} state - Babel state object for file
 * @param {string} trackerPath - Import path for tracker
 * @param {string} initPath - Import path for init
 * @returns {undefined}
 */
function programExitVisitor(path, state, trackerPath, initPath) {
	// Insert `const scopeId_1 = tracker();` at top of file if file scope referenced
	blockStatementExitVisitor(path, state);

	// Insert init + tracker import statements at top of file (above `scopeId` definition)
	// `require('/path/to/app/node_modules/livepack/lib/init.js');`
	// `const tracker = require('/path/to/app/node_modules/livepack/lib/tracker.js');`
	const trackerVarNode = state[TRACKER_VAR_NODE];
	path.unshiftContainer('body', [
		t.expressionStatement(
			t.callExpression(internalIdentifier('require'), [t.stringLiteral(initPath)])
		),
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					trackerVarNode,
					t.callExpression(internalIdentifier('require'), [t.stringLiteral(trackerPath)])
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
 * Visitor to init `HAS_CONSTRUCTOR` flag.
 * @param {Object} classPath - Babel path object for class
 * @returns {undefined}
 */
function classEnterVisitor(classPath) {
	classPath[HAS_CONSTRUCTOR] = false;
}

/**
 * Visitor to add tracker comment to classes without constructors.
 * @param {Object} classPath - Babel path object for class
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function classExitVisitor(classPath, state) {
	if (classPath[HAS_CONSTRUCTOR]) return;
	insertTrackerComment(classPath.get('body'), createBlockId(state), [], false, state);
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
	const blockId = enterBlock(bodyPath, state);
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
	// Insert tracking info comment at start of function body (or start of class body for constructors)
	const isCtor = fnPath.node.kind === 'constructor';
	const bodyPath = fnPath.get('body');
	let commentBodyPath, isMethod;
	if (isCtor) {
		commentBodyPath = fnPath.parentPath;
		commentBodyPath.parentPath[HAS_CONSTRUCTOR] = true;
		isMethod = false;
	} else {
		commentBodyPath = bodyPath;
		isMethod = fnPath.isMethod();
	}

	const props = fnPath[FUNCTION_PROPS];
	const scopes = [...props.scopes.values()]
		.sort((a, b) => (a.blockId > b.blockId ? 1 : -1)); // Sort by block ID in ascending order

	insertTrackerComment(commentBodyPath, props.id, scopes, isMethod, state);

	// Insert reveal code
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
							...[...varNames].map(name => internalIdentifier(name))
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
 * Visitor to convert `for` statement body from single statement to statement block.
 * This is in case variables defined in the init node are referenced in functions created in the body,
 * in which case a scope var statement will need to be inserted.
 * `for (const x of [1, 2, 3]) fns.push(() => x);` -> `for (const x of [1, 2, 3]) { fns.push(() => x); }`
 * @param {Object} forPath - Babel path object for `for` statement
 * @returns {undefined}
 */
function forVisitor(forPath) {
	const bodyPath = forPath.get('body');
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

	// Find enclosing function
	let functionPath = state[PARENT_FUNCTION_PATH];
	if (!functionPath) return;

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
	if (identifierPath.parentPath === functionPath && identifierPath.key === 'id') return;

	// Skip class's own name in constructor
	if (functionPath.node.kind === 'constructor') {
		const classPath = functionPath.parentPath.parentPath;
		assert(classPath.isClass());
		const classIdNode = classPath.node.id;
		if (classIdNode && classIdNode.name === identifierPath.node.name) return;
	}

	// Find scope where var is defined (i.e. `const`, `let`, `var`, `function` statement)
	const binding = identifierPath.scope.getBinding(name);
	if (!binding) {
		// Handle `arguments`
		// NB At this point we know `arguments` does not refer to a user-defined var.
		if (name === 'arguments') processArguments(state);
		return;
	}

	// Skip if var not defined outside function where it's used
	const bindingPath = binding.path;
	if (bindingPath === functionPath || bindingPath.findParent(path => path === functionPath)) return;

	// Locate statement block containing var declaration
	let bindingBlockPath;
	if (bindingPath.isFunctionDeclaration() || bindingPath.isClassDeclaration()) {
		// Function declaration
		// Traverse down past label prefix(es) e.g. `a: function x() {}`
		let bindingParentPath = bindingPath.parentPath;
		while (bindingParentPath.isLabeledStatement()) {
			bindingParentPath = bindingParentPath.parentPath;
		}
		bindingBlockPath = bindingParentPath;
	} else if (bindingPath.isFunctionExpression()) {
		// Function name - scoped to function body
		bindingBlockPath = bindingPath.get('body');
	} else if (bindingPath.isCatchClause()) {
		bindingBlockPath = bindingPath.get('body');
	} else {
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

			bindingBlockPath = bindingParentPath.get('body');
		} else if (bindingParentPath.node.kind === 'var') {
			// `var` statement - scoped to parent function
			const bindingFnPath = bindingParentPath.findParent(path => path.isFunction() || path.isProgram());
			if (bindingFnPath.isFunction()) {
				bindingBlockPath = bindingFnPath.get('body');
			} else {
				bindingBlockPath = bindingFnPath;
			}
		} else {
			// `const` or `let` statement - scoped to block
			const varParentPath = bindingParentPath.parentPath;
			if (varParentPath.isFor()) {
				// `for (const x = ...) {}` - var scoped to `for` statement block
				bindingBlockPath = varParentPath.get('body');
			} else {
				bindingBlockPath = varParentPath;
			}
		}

		assertWithLocation(
			bindingBlockPath.isBlockStatement() || bindingBlockPath.isProgram(), bindingBlockPath, state,
			`Unexpected variable binding block type '${bindingBlockPath.node.type}' for var '${name}'`
		);
	}

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
	// eslint-disable-next-line consistent-return
	return {scopes, bindingFunctionPath};
}

/**
 * Record use of var in call to `tracker()`
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
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function insertTrackerComment(bodyPath, id, scopes, isMethod, state) {
	// eslint-disable-next-line max-len
	// `/*livepack_track:{"id":3,"scopes":[{"blockId":1,"varNames":["a"],"blockName":"index"}, {"blockId":2,"varNames":["b", "arguments"],"blockName":"outer",argNames:["b"]}],"filename":"/path/to/file.js","isMethod":true}*/`
	const {filename} = state.file.opts;
	const propsStr = JSON.stringify({
		id,
		scopes: scopes.map(({blockId, varNames, blockName, argNames}) => ({
			blockId,
			varNames: [...varNames],
			...(blockName ? {blockName} : null),
			...(argNames ? {argNames} : null)
		})),
		...(filename ? {filename} : null),
		...(isMethod ? {isMethod: true} : null)
	});

	const blockNode = bodyPath.node;
	let comments = blockNode.innerComments;
	if (!comments) comments = blockNode.innerComments = []; // eslint-disable-line no-multi-assign

	comments.unshift({
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
 * Check if file is in livepack's internal code (in `lib` dir).
 * `serialize/external.js` is excluded as it contains code which is used in output.
 * @param {Object} state - Babel state object
 * @returns {boolean} - `true` if code comes from within livepack codebase
 */
function isLivepackCode(state) {
	const {filename} = state.file.opts;
	return !!filename && filename.startsWith(LIVEPACK_DIR_PATH)
		&& filename !== LIVEPACK_EXTERNALS_PATH;
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
