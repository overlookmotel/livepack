/* --------------------
 * livepack module
 * Babel plugin functions visitors
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createBlockProps, exitBlock, insertBlockVars} = require('./blocks.js'),
	{moveFunctionParams} = require('./params.js'),
	{serializeFunctionAst} = require('./ast.js'),
	{insertComment, containsUseStrictDirective} = require('./utils.js'),
	{createFnInfoVarNode} = require('./internalVars.js'),
	{FUNCTION_PROPS, NAME_BLOCK, PARAMS_BLOCK, BODY_BLOCK} = require('./symbols.js'),
	{createArrayOrPush, setAddFrom} = require('../shared/functions.js'),
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
	classMethodEnterVisitor,
	methodEnterVisitor,
	functionDeclarationExitVisitor,
	functionExpressionExitVisitor,
	arrowFunctionExitVisitor,
	classMethodExitVisitor,
	methodExitVisitor,
	enterFunctionOrClass,
	exitMethodKey,
	exitFunctionParams,
	exitFunctionOrClass,
	insertTrackerComment,
	createTrackerNode
};

/**
 * Visitor to init scope + state for function declaration.
 * Does not create a block for function name as function declarations are scoped to enclosing block,
 * even when referred to from within the function.
 * e.g. `function f() { return f; }` - `f` in `return f` refers to var in parent scope.
 * If declaration creates a var which clashes with an external/global var used in function params,
 * record this for later processing in `moveFunctionParams()`.
 *
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function functionDeclarationEnterVisitor(fnPath, state) {
	// Enter function
	const fnName = fnPath.node.id.name;
	const fn = enterFunctionOrMethod(fnPath, fnName, false, false, false, undefined, state);
	state.currentFullFunction = fn;

	// If function name clashes with an external/global var used in parent function's params, record this
	const parentFunction = fn.parent;
	if (!parentFunction) return;

	// Ignore if function is nested in another block.
	// NB Need to use `.findParent()` as function could be prefixed with one or more labels
	// e.g. `label1: label2: function x() {}`.
	// TODO Handle where function is hoisted from nested block (in sloppy mode).
	// See https://github.com/overlookmotel/livepack/issues/224
	const parentBlockPath = fnPath.findParent(path => path.isBlockStatement());
	if (parentBlockPath.parentPath !== parentFunction.path) return;

	const {clashingVarNames} = parentFunction;
	if (clashingVarNames && clashingVarNames.has(fnName)) {
		createArrayOrPush(parentFunction, 'varDeclarations', {
			parentNode: fnPath.container,
			key: fnPath.key,
			varNames: [fnName]
		});
	}
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
	let blockName, nameBlock, functionNameClash;
	const idNode = fnPath.node.id;
	if (idNode) {
		blockName = idNode.name;
		nameBlock = createBlockProps(blockName, false, state);
		functionNameClash = getFunctionNameClash(blockName, fnPath);
	}

	state.currentFullFunction = enterFunctionOrMethod(
		fnPath, blockName, false, false, false, functionNameClash, state
	);

	fnPath[NAME_BLOCK] = nameBlock;
}

/**
 * Determine if there's a name clash between function name and a var defined in function body.
 * This is a workaround for a bug in Babel where a var is defined in body of function expression
 * with same name as the function itself.
 * When fetching the binding for a reference to the internal var, Babel erroneously
 * returns a `local` binding. Babel records the var declaration as a const violation.
 * e.g. `function f() { const f = 1; return () => f; }`
 * `function f() { function f() {} return () => f; }`
 * For the last `f` in both above examples, Babel returns a `local` binding, referring to outer function.
 * https://github.com/babel/babel/issues/14023
 * This function is to determine if this problem can arise in this function, so it can corrected later.
 *
 * @param {string} name - Function name
 * @param {Object} fnPath - Babel path object for function expression
 * @returns {Object|undefined} - If there is a clash, object with props:
 *   {boolean} .isConst - `true` if clashing var is a constant
 *   {boolean} .isFunction - `true` if clashing var is a function/class declaration
 *   {boolean} .isHoisted - `true` if clashing var will is hoisted to top scope within function body
 *     (`var` statement or function declaration in sloppy mode)
 */
function getFunctionNameClash(name, fnPath) {
	let hasClash = false,
		isFunction = false;
	for (const path of fnPath.scope.bindings[name].constantViolations) {
		if (path.isClassDeclaration()) return {isConst: false, isFunction: true, isHoisted: false};
		if (path.isFunctionDeclaration()) {
			hasClash = true;
			isFunction = true;
		} else if (path.isVariableDeclarator()) {
			const varKind = path.parentPath.node.kind;
			if (varKind === 'const') return {isConst: true, isFunction: false, isHoisted: false};
			if (varKind === 'let') return {isConst: false, isFunction: false, isHoisted: false};
			hasClash = true;
		}
	}

	return hasClash ? {isConst: true, isFunction, isHoisted: true} : undefined;
}

/**
 * Visitor to init scope + state for arrow function expression.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function arrowFunctionEnterVisitor(fnPath, state) {
	const hasNoBodyBlock = !t.isBlockStatement(fnPath.node.body);
	enterFunctionOrMethod(fnPath, undefined, false, false, hasNoBodyBlock, undefined, state);
}

/**
 * Visitor to init scope + state for class method.
 * @param {Object} methodPath - Babel path object for method
 * @param {Object} state - State object
 * @returns {undefined}
 */
function classMethodEnterVisitor(methodPath, state) {
	if (methodPath.node.kind === 'constructor') {
		enterClassConstructor(methodPath, state);
	} else {
		methodEnterVisitor(methodPath, state);
	}
}

/**
 * Visitor to init scope + state for method.
 * Function props is created at this point, and added to `state.fns`,
 * but function is not set as current function yet.
 * This is done after exiting key (in `nodeExitVisitor()`), as code in a computed key cannot access vars
 * defined within the method, and don't inherit the method's strict/sloppy status.
 *
 * @param {Object} methodPath - Babel path object for method
 * @param {Object} state - State object
 * @returns {undefined}
 */
function methodEnterVisitor(methodPath, state) {
	// Get block name
	let blockName;
	const methodNode = methodPath.node;
	if (!methodNode.computed) {
		const keyNode = methodNode.key;
		if (t.isIdentifier(keyNode)) {
			blockName = keyNode.name;
		} else if (t.isStringLiteral(keyNode)) {
			blockName = keyNode.value;
		} else if (t.isNumericLiteral(keyNode)) {
			blockName = `${keyNode.value}`;
		}
	}

	// Create function
	enterFunctionOrMethod(methodPath, blockName, true, false, false, undefined, state);
}

/**
 * Enter class constructor.
 * Enter constructor function and record constructor on class function props object.
 * @param {Object} constructorPath - Babel path object for constructor method
 * @param {Object} state - State object
 * @returns {undefined}
 */
function enterClassConstructor(constructorPath, state) {
	const classFn = state.currentFunction;
	const fn = enterFunctionOrMethod(constructorPath, 'constructor', false, true, false, undefined, state);
	classFn.constructorFn = fn;
	state.currentFullFunction = fn;
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
 * @param {boolean} hasNoBodyBlock - `true` if is arrow function with no body block
 * @param {Object} [functionNameClash] - Details of clash between function name and var in function body
 * @param {Object} state - State object
 * @returns {Object} - Function props object
 */
function enterFunctionOrMethod(
	fnPath, blockName, isMethod, isClassConstructor, hasNoBodyBlock, functionNameClash, state
) {
	// Determine if function is strict
	let {isStrict} = state;
	if (!isStrict && !hasNoBodyBlock && containsUseStrictDirective(fnPath.node.body)) isStrict = true;

	// Create blocks for function.
	// 2 separate blocks - 1. params; 2. body block.
	// Function expressions may also have a name block (created in visitors already).
	const paramsBlock = createBlockProps(blockName, true, state);
	fnPath[PARAMS_BLOCK] = paramsBlock;

	if (hasNoBodyBlock) {
		fnPath[BODY_BLOCK] = paramsBlock;
	} else {
		const bodyBlock = createBlockProps(blockName, true, state);
		bodyBlock.parent = paramsBlock;
		paramsBlock.varsBlock = bodyBlock;
		fnPath[BODY_BLOCK] = bodyBlock;
	}

	// Enter params block, unless is method, in which case block is entered after method key
	if (!isMethod) state.currentBlock = paramsBlock;

	// Find first complex param
	const complexParamIndex = getComplexParamIndex(fnPath.node);

	// Find `var` statements or function declarations in body of function with same names as params
	const paramClashes = getParamClashes(fnPath, hasNoBodyBlock);

	// Enter function
	return enterFunctionOrClass(
		fnPath, paramsBlock.id, isStrict, isMethod, isClassConstructor,
		complexParamIndex, paramClashes, functionNameClash, state
	);
}

/**
 * Get index of function's first complex parameter (i.e. param which not just an identifier).
 * A function whose arguments are all simple, except for a final `...x` is treated as having
 * no complex params.
 * @param {Object} fnNode - AST node for function
 * @returns {number|undefined} - Index of first complex param, or undefined if none
 */
function getComplexParamIndex(fnNode) {
	const paramNodes = fnNode.params,
		numParams = paramNodes.length;
	if (numParams === 0) return undefined;

	// Find first complex param
	const complexParamIndex = paramNodes.findIndex(paramNode => !t.isIdentifier(paramNode));
	if (complexParamIndex === -1) return undefined;

	// If first complex param found is `...x`, ignore it
	if (complexParamIndex === numParams - 1) {
		const lastParamNode = paramNodes[numParams - 1];
		if (t.isRestElement(lastParamNode) && t.isIdentifier(lastParamNode.argument)) return undefined;
	}

	return complexParamIndex;
}

/**
 * Find `var` statements or function declarations in body of function with same name as function name.
 * This is a workaround for Babel bug where these are erroneously recorded as const violations.
 * e.g. `(x) => { var x = 1; return () => x; }`
 * or `(x) => { function x() {} return () => x; }`
 * For the last `x` in both above examples, Babel returns a `param` binding.
 * Record any such clashes, so they can be corrected later.
 *
 * Also convert any `var` bindings to `hoisted` if they are later re-declared with a function
 * declaration. e.g. `var x; function x() {}`
 * This ensures the same var is not added to `internalVars` and `functionNames` simultaneously.
 *
 * @param {Object} fnPath - Babel path object for function
 * @param {boolean} hasNoBodyBlock - `true` if function has no body block
 * @returns {Object} - Map of var name to boolean. Bool is `true` if var is a function declaration.
 */
function getParamClashes(fnPath, hasNoBodyBlock) {
	const paramClashes = Object.create(null);
	if (hasNoBodyBlock) return paramClashes;

	for (const [varName, binding] of Object.entries(fnPath.scope.bindings)) {
		const bindingKind = binding.kind,
			isParamBinding = bindingKind === 'param';
		if (!isParamBinding && bindingKind !== 'var') continue;
		for (const path of binding.constantViolations) {
			if (path.isFunctionDeclaration()) {
				if (isParamBinding) {
					paramClashes[varName] = true;
				} else {
					binding.kind = 'hoisted';
				}
				break;
			}
			if (isParamBinding && path.isVariableDeclarator() && path.parentPath.node.kind === 'var') {
				paramClashes[varName] = false;
			}
		}
	}
	return paramClashes;
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
 * @param {number} [complexParamIndex] - Index of first complex parameter (undefined if none)
 * @param {Object} [paramClashes] - Map of var names which are params but also declared in body
 * @param {Object} [functionNameClash] - Details of clash between function name and var in function body
 * @param {Object} state - State object
 * @returns {Object} - Function props object
 */
function enterFunctionOrClass(
	path, id, isStrict, isMethod, isClassConstructor,
	complexParamIndex, paramClashes, functionNameClash, state
) {
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
		complexParamIndex,
		hasClashingVarNames: false,
		clashingVarNames: undefined,
		varDeclarations: undefined,
		paramClashes,
		functionNameClash,
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
 * Exiting function params.
 * If function has complex params, record external/global vars used in params
 * which clash with vars scoped to function body.
 * @param {Object} fnPath - Babel path object for method
 * @param {Object} state - State object
 * @returns {undefined}
 */
function exitFunctionParams(fnPath, state) {
	// Skip if function has no complex params or is arrow function with no body block
	// (in which case there are no vars internal to function to clash with vars used in params)
	const fn = state.currentFunction;
	if (fn.complexParamIndex === undefined || !t.isBlockStatement(fnPath.node.body)) return;

	let hasClashingVarNames = false;
	const clashingVarNames = new Set(),
		{bindings} = fnPath.scope;
	const recordIfClashing = (varName) => {
		const binding = bindings[varName];
		if (!binding) return;

		const {kind} = binding;
		if (kind === 'local') {
			const {functionNameClash} = fn;
			if (functionNameClash) {
				hasClashingVarNames = true;
				if (functionNameClash.isHoisted) clashingVarNames.add(varName);
			}
		} else {
			hasClashingVarNames = true;
			if (kind === 'var' || kind === 'hoisted') clashingVarNames.add(varName);
		}
	};

	// Record clashes with external vars used in params
	for (const {vars} of fn.scopes.values()) {
		Object.keys(vars).forEach(recordIfClashing);
	}

	// Record clashes with global vars used in params (including in functions nested within params)
	const recordClashesWithGlobals = (thisFn) => {
		thisFn.globalVarNames.forEach(recordIfClashing);
		thisFn.children.forEach(recordClashesWithGlobals);
	};
	recordClashesWithGlobals(fn);

	// Record clashes between function params and var / function declarations in function body
	const paramClashVarNames = Object.keys(fn.paramClashes);
	if (paramClashVarNames.length !== 0) {
		hasClashingVarNames = true;
		setAddFrom(clashingVarNames, paramClashVarNames);
	}

	// If clashes found, record them
	if (hasClashingVarNames) {
		fn.hasClashingVarNames = true;
		if (clashingVarNames.size !== 0) fn.clashingVarNames = clashingVarNames;
	}
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
	const fnNode = fnPath.node;
	insertTrackerCode(fnNode, fn, fn.id, state);
	insertTrackerComment(fn.id, getFunctionType(fnNode), fnNode, 'inner', state);
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
	insertTrackerCode(fnNode, fn, fnId, state);
	insertTrackerComment(fnId, getFunctionType(fnNode), fnNode, 'inner', state);
}

/**
 * Visitor to add tracking comment + code to arrow function.
 * Converts body to a statement block if not already.
 * @param {Object} fnPath - Babel path object for function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function arrowFunctionExitVisitor(fnPath, state) {
	// If has no body statement block, convert into block.
	// This is necessary so there's a block to put tracking code into.
	// `x => x` -> `(x) => { return x; }`
	const fnNode = fnPath.node;
	let bodyNode = fnNode.body;
	if (!t.isBlockStatement(bodyNode)) {
		bodyNode = t.blockStatement([t.returnStatement(bodyNode)]);
		fnNode.body = bodyNode;
		moveFunctionParams(state.currentFunction, fnNode, state);
		insertBlockVars(bodyNode, state);
	}

	// Exit function
	const fn = exitFunction(state);

	// Insert tracker code + comment.
	// Tracker comment before first param. If no params, before function body.
	insertTrackerCode(fnNode, fn, fn.id, state);
	const paramNodes = fnNode.params,
		commentHolderNode = paramNodes.length > 0 ? paramNodes[0] : bodyNode;
	insertTrackerComment(
		fn.id, fnNode.async ? FN_TYPE_ASYNC_FUNCTION : FN_TYPE_FUNCTION,
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
	insertTrackerCode(methodNode, fn, fnId, state);
	insertTrackerComment(
		fnId, getFunctionType(methodNode),
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
	insertTrackerCode(constructorPath.node, constructorFn, fnId, state);
	insertTrackerComment(fnId, FN_TYPE_CLASS, classNode, 'inner', state);
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
	// Exit function
	const fn = exitFunctionOrClass(state);

	// Exit params block
	exitBlock(state);

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
 * @param {Object} fnNode - AST node for function
 * @param {Object} fn - Function props object
 * @param {number} fnId - Function ID
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertTrackerCode(fnNode, fn, fnId, state) {
	// Get scope vars, sorted by block ID in ascending order
	const scopes = [...fn.scopes.values()]
		.sort((scope1, scope2) => (scope1.block.id > scope2.block.id ? 1 : -1));
	fn.scopes = scopes;

	// Insert tracker code at start of function body
	const trackerNode = createTrackerNode(fnId, scopes, fn.superVarNode, state);
	fnNode.body.body.unshift(t.expressionStatement(trackerNode));
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
 * Insert tracker comment.
 * @param {number} fnId - Function ID
 * @param {string} fnType - Function type
 * @param {Object} commentHolderNode - AST node to attach comment to
 * @param {string} commentType - 'leading' / 'inner' / 'trailing'
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function insertTrackerComment(fnId, fnType, commentHolderNode, commentType, state) {
	// Encode filename as JSON to escape non-ascii chars.
	// Escape `*/` so does not terminate comment early.
	// `JSON.parse('"*\/"')` is `'*/'` so it needs no special unescaping.
	const {filename} = state;
	const filenameEscaped = filename
		? JSON.stringify(filename).slice(1, -1).replace(/\*\//g, '*\\/')
		: '';

	insertComment(
		commentHolderNode, commentType,
		`${TRACKER_COMMENT_PREFIX}${fnId};${fnType};${filenameEscaped}`
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
