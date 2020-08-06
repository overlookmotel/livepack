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
const {
	identifierIsVariable, replaceWith,
	TRACKER_COMMENT_PREFIX, TEMP_COMMENT_PREFIX
} = require('./shared.js');

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
	TEMP_VAR_NAME = 'temp',
	TEMP_VAR_NUMS_USED = Symbol('livepack.TEMP_VAR_NUMS_USED'),
	TEMP_VAR_NODES = Symbol('livepack.TEMP_VAR_NODES'),
	BLOCK_ID = Symbol('livepack.BLOCK_ID'),
	BLOCK_NAME = Symbol('livepack.BLOCK_NAME'),
	FUNCTION_PROPS = Symbol('livepack.FUNCTION_PROPS'),
	HAS_CONSTRUCTOR = Symbol('livepack.HAS_CONSTRUCTOR'),
	PARENT_FUNCTION_PATH = Symbol('livepack.PARENT_FUNCTION_PATH'),
	PARENT_FULL_FUNCTION_PATH = Symbol('livepack.PARENT_FULL_FUNCTION_PATH'),
	SUPER_VAR_NODE = Symbol('livepack.SUPER_VAR_NODE'),
	IS_INTERNAL = Symbol('livepack.IS_INTERNAL');

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
			For: forOrWhileVisitor,
			While: forOrWhileVisitor,
			BlockStatement: {
				enter: blockStatementEnterVisitor,
				exit: blockStatementExitVisitor
			},
			Identifier: identifierVisitor,
			ThisExpression: thisExpressionVisitor,
			Super: superVisitor
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

	// Init arrays to track temp vars
	state[TEMP_VAR_NUMS_USED] = [];
	state[TEMP_VAR_NODES] = [];

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

	// Determine unique name prefix for temp vars and set all vars to use this prefix
	const tempNum = getUnusedNum(state[TEMP_VAR_NUMS_USED]);
	if (tempNum !== 0) {
		const tempName = `${TEMP_VAR_NAME}${tempNum}`;
		const pos = TEMP_VAR_NAME.length;
		for (const node of state[TEMP_VAR_NODES]) {
			node.name = `${tempName}${node.name.slice(pos)}`;
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
		commentBodyPath, props.id, scopes, isMethod, isProtoMethod, superVarName, superIsTemp, state
	);

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
 * Visitor to convert `for` and `while` with single statement to statement block. This is in case:
 *
 * `for`: variables defined in the init node are referenced in functions created in the body,
 * in which case a scope var statement will need to be inserted.
 * `for (const x of [1, 2, 3]) fns.push(() => x);` -> `for (const x of [1, 2, 3]) { fns.push(() => x); }`
 *
 * `while`: object or class with method using `super` defined in loop and requires temp var scoped
 * to inside loop.
 * `while (x) fn(class extends C {m() { super.m() }})`
 *
 * @param {Object} forPath - Babel path object for `for` statement
 * @returns {undefined}
 */
function forOrWhileVisitor(forPath) {
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
	const {node} = identifierPath;
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

	// Skip if `super.prop = ...` - will be replaced with `this.prop = ...` so super not needed
	const {parentPath} = superPath;
	if (
		parentPath.isMemberExpression()
		&& parentPath.parentPath.isAssignmentExpression() && parentPath.key === 'left'
	) {
		return;
	}

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
			// Class is named - use class name if not overridden in local scope
			if (superPath.scope.getBinding(idNode.name).path === encloserPath) return idNode;
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

	const isClassDeclaration = encloserPath.isClassDeclaration();
	if (isClassDeclaration) encloserNode.type = 'ClassExpression';

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
					// `.toString()` is added in case `.toString()` method has side effects,
					// so need to prevent it being called multiple times too.
					// `{[f()]: class {}}`
					// -> `{[temp_2 = fn().toString()]: temp_1 = {[temp_2]: class {}}[temp_2]}`
					idNode = createTempVarNode(state);
					tagTempVarWithType(idNode, 'key');

					tempVarNodes.push(idNode);
					accessIsComputed = true;
					keyPath.replaceWith(
						t.assignmentExpression(
							'=',
							idNode,
							t.callExpression(t.memberExpression(keyNode, t.identifier('toString')), [])
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

	if (isClassDeclaration) {
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
	// `/*livepack_track:{"id":3,"scopes":[{"blockId":1,"varNames":["a"],"blockName":"index"}, {"blockId":2,"varNames":["b", "arguments"],"blockName":"outer",argNames:["b"]}],"filename":"/path/to/file.js","isMethod":true,"isProtoMethod":true,"superVarName":"b"}*/`
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
		...(isMethod ? {isMethod: true} : null),
		...(isProtoMethod ? {isProtoMethod: true} : null),
		...(superVarName && !superIsTemp ? {superVarName} : null)
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
