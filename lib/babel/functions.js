/* --------------------
 * livepack module
 * Babel plugin functions visitors
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createBlockProps, exitBlock, insertBlockVars} = require('./blocks.js'),
	{serializeFunctionAst} = require('./ast.js'),
	{replaceWith, insertComment, containsUseStrictDirective, assertWithLocation} = require('./utils.js'),
	{createFnInfoVarNode} = require('./internalVars.js'),
	{FUNCTION_PROPS, NAME_BLOCK, PARAMS_BLOCK, BODY_BLOCK} = require('./symbols.js'),
	{
		FN_TYPE_FUNCTION, FN_TYPE_ASYNC_FUNCTION,
		FN_TYPE_GENERATOR_FUNCTION, FN_TYPE_ASYNC_GENERATOR_FUNCTION, FN_TYPE_CLASS,
		TRACKER_COMMENT_PREFIX
	} = require('../shared/constants.js');

// Exports

module.exports = {
	functionDeclarationEnterVisitor,
	functionExpressionEnterVisitor,
	arrowFunctionEnterVisitor,
	methodEnterVisitor,
	functionDeclarationExitVisitor,
	functionExpressionExitVisitor,
	arrowFunctionExitVisitor,
	classMethodExitVisitor,
	methodExitVisitor,
	enterFunctionOrClass,
	exitMethodKey,
	exitFunctionOrClass,
	insertTrackerComment,
	createTrackerNode
};

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
	let blockName, classFn;
	if (isClassConstructor) {
		classFn = state.currentFunction;
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
	if (isClassConstructor) {
		classFn.constructorFn = fn;
		state.currentFullFunction = fn;
	}
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
	let {isStrict} = state;
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
	const astJson = isClassConstructor ? undefined : serializeFunctionAst(path.node, state.isStrict);

	// Create function props object
	const parentFunction = state.currentFunction;
	const fn = {
		id,
		path,
		scopes: new Map(),
		internalVars: Object.create(null),
		globalVarNames: new Set(null),
		amendments: [],
		isStrict,
		superVarNode: undefined,
		superIsProto: false,
		argNames: undefined,
		containsEval: false,
		containsImport: false,
		constructorFn: undefined,
		astJson,
		parent: parentFunction,
		fullParent: state.currentFullFunction,
		children: [],
		trail: state.trail,
		numClassChildren: undefined,
		isClassConstructorWithSuperClass: isClassConstructor && parentFunction.hasSuperClass,
		firstSuperStatementIndex: undefined,
		returnsSuper: undefined
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
		state.isStrict = isStrict;

		// Start new trail
		if (!isClassConstructor) state.trail = [];
	}

	return fn;
}

/**
 * Enter method. Called by `nodeExitVisitor()` when exiting the method's key.
 * Entering the method is delayed until after its key,
 * in case is computed key containing other functions.
 * @param {Object} methodPath - Babel path object for method
 * @param {Object} state - State object
 * @returns {undefined}
 */
function exitMethodKey(methodPath, state) {
	const fn = methodPath[FUNCTION_PROPS];
	state.currentFunction = state.currentFullFunction = fn;
	state.isStrict = fn.isStrict;
	fn.trail = state.trail;
	state.trail = [];
	state.currentBlock = methodPath[PARAMS_BLOCK];
}

/**
 * Visitor to add tracking comment + code to function declaration.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function functionDeclarationExitVisitor(fnPath, state) {
	// Exit function
	const fn = exitFullFunction(state);

	// Insert tracker code and comment - comment after `function` keyword
	const callArguments = insertTrackerCode(fnPath, fn, fn.id, state);
	const fnNode = fnPath.node;
	insertTrackerComment(fn.id, getFunctionType(fnNode), callArguments, fnNode, 'inner', state);
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
	const fn = exitFullFunction(state);

	// If contains `eval()`, treat function name as internal to function.
	// Necessary to maintain const violation behavior within `eval()`
	// - throws error in strict mode, silently fails in sloppy mode.
	let fnId;
	const fnNode = fnPath.node;
	if (fn.containsEval && fnNode.id) {
		fnId = fnPath[NAME_BLOCK].id;
		fn.id = fnId;
		fn.scopes.delete(fnId);
	} else {
		fnId = fn.id;
	}

	// Insert tracker code and comment - comment after `function` keyword
	const callArguments = insertTrackerCode(fnPath, fn, fnId, state);
	insertTrackerComment(fnId, getFunctionType(fnNode), callArguments, fnNode, 'inner', state);
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
	const fn = exitFunction(state);

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

	// Insert tracker code + comment.
	// Tracker comment before first param. If no params, before function body.
	const callArguments = insertTrackerCode(fnPath, fn, fn.id, state);
	const paramNodes = fnNode.params,
		commentHolderNode = paramNodes.length > 0 ? paramNodes[0] : bodyNode;
	insertTrackerComment(
		fn.id, fnNode.async ? FN_TYPE_ASYNC_FUNCTION : FN_TYPE_FUNCTION, callArguments,
		commentHolderNode, 'leading', state
	);
}

/**
 * Visitor to add tracking comment + code to class method.
 * @param {Object} methodPath - Babel path object for method
 * @param {Object} state - State object
 * @returns {undefined}
 */
function classMethodExitVisitor(methodPath, state) {
	if (methodPath.node.kind === 'constructor') {
		exitClassConstructor(methodPath, state);
	} else {
		methodExitVisitor(methodPath, state);
	}
}

/**
 * Visitor to add tracking comment + code to class/object method.
 * @param {Object} methodPath - Babel path object for method
 * @param {Object} state - State object
 * @returns {undefined}
 */
function methodExitVisitor(methodPath, state) {
	// Exit function
	const fn = exitFullFunction(state);

	// Insert tracker code + comment.
	// Tracker comment before key if computed key, or after key otherwise.
	const methodNode = methodPath.node,
		fnId = fn.id;
	const callArguments = insertTrackerCode(methodPath, fn, fnId, state);
	insertTrackerComment(
		fnId, getFunctionType(methodNode), callArguments,
		methodNode.key, methodNode.computed ? 'leading' : 'trailing', state
	);
}

/**
 * Exit class constructor.
 * Insert tracker code in class constructor and tracker comment in class.
 * @param {Object} constructorPath - Babel path object for constructor method
 * @param {Object} state - State object
 * @returns {undefined}
 */
function exitClassConstructor(constructorPath, state) {
	// Exit function
	const constructorFn = exitFullFunction(state);

	// If contains `eval()`, treat class name as internal to constructor
	let fnId;
	const classFn = state.currentFunction,
		classPath = classFn.path,
		classNode = classPath.node;
	if (constructorFn.containsEval && classNode.id) {
		fnId = classPath[NAME_BLOCK].id;
		classFn.id = fnId;
		constructorFn.scopes.delete(fnId);
	} else {
		fnId = classFn.id;
	}

	// Insert tracker code + comment.
	// Tracker comment after `class` keyword of class.
	const callArguments = insertTrackerCode(constructorPath, constructorFn, fnId, state);
	insertTrackerComment(fnId, FN_TYPE_CLASS, callArguments, classNode, 'inner', state);
}

/**
 * Exit full function (i.e. any function or method except arrow function).
 * @param {Object} state - State object
 * @returns {Object} - Function props object for function which are exiting
 */
function exitFullFunction(state) {
	const fn = exitFunction(state);
	state.currentFullFunction = fn.fullParent;
	return fn;
}

/**
 * Exit function.
 * @param {Object} state - State object
 * @returns {Object} - Function props object for function which are exiting
 */
function exitFunction(state) {
	const fn = exitFunctionOrClass(state);

	// Clear `.path` to free memory
	fn.path = undefined;

	// Restore `isStrict` to as was before entering function
	const {currentFunction} = state;
	state.isStrict = currentFunction ? currentFunction.isStrict : state.topLevelIsStrict;

	return fn;
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
 * @param {Object} state - State object
 * @returns {Array|undefined} - Arguments to call function with to trigger tracker
 */
function insertTrackerCode(fnPath, fn, fnId, state) {
	// Get scope vars, sorted by block ID in ascending order
	const scopes = [...fn.scopes.values()]
		.sort((scope1, scope2) => (scope1.block.id > scope2.block.id ? 1 : -1));
	fn.scopes = scopes;

	// Insert tracker code in function params
	const trackerNode = createTrackerNode(fnId, scopes, fn.superVarNode, state);
	return insertTrackerNode(fnPath, trackerNode, state);
}

/**
 * Create tracker function call AST node.
 * @param {number} fnId - ID for function being tracked
 * @param {Array<Object>} scopes - Array of scope objects
 * @param {Object} [superVarNode] - AST node for super var (optional)
 * @param {Object} state - State object
 * @returns {Object} - AST node for tracker function call
 */
function createTrackerNode(fnId, scopes, superVarNode, state) {
	// `livepack_tracker(livepack_getFnInfo_2, () => [[scopeId_1, x, y]])`
	return t.callExpression(state.trackerVarNode, [
		createFnInfoVarNode(fnId, state),
		t.arrowFunctionExpression([], t.arrayExpression(
			scopes.map(scope => t.arrayExpression([
				scope.block.varsBlock.scopeIdVarNode,
				...Object.keys(scope.vars).map(name => (name === 'super' ? superVarNode : t.identifier(name)))
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
 * Insert tracker comment.
 * @param {number} fnId - Function ID
 * @param {string} fnType - Function type
 * @param {Array} [callArguments] - Call arguments
 * @param {Object} commentHolderNode - AST node to attach comment to
 * @param {string} commentType - 'leading' / 'inner' / 'trailing'
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function insertTrackerComment(fnId, fnType, callArguments, commentHolderNode, commentType, state) {
	const callArgsStr = callArguments ? JSON.stringify(callArguments) : '';

	// Encode filename as JSON to escape non-ascii chars.
	// Escape `*/` so does not terminate comment early.
	// `JSON.parse('"*\/"')` is `'*/'` so it needs no special unescaping.
	const {filename} = state;
	const filenameEscaped = filename
		? JSON.stringify(filename).slice(1, -1).replace(/\*\//g, '*\\/')
		: '';

	insertComment(
		commentHolderNode, commentType,
		`${TRACKER_COMMENT_PREFIX}${fnId};${fnType};${callArgsStr};${filenameEscaped}`
	);
}

/**
 * Get type code for function.
 * @param {Object} fnNode - AST node for function
 * @returns {string} - Function type code
 */
function getFunctionType(fnNode) {
	return fnNode.async
		? fnNode.generator
			? FN_TYPE_ASYNC_GENERATOR_FUNCTION
			: FN_TYPE_ASYNC_FUNCTION
		: fnNode.generator
			? FN_TYPE_GENERATOR_FUNCTION
			: FN_TYPE_FUNCTION;
}
