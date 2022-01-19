/* --------------------
 * livepack module
 * Babel plugin super visitor
 * ------------------*/

'use strict';

// Modules
const last = require('lodash/last'),
	t = require('@babel/types');

// Imports
const recordVarUse = require('./vars.js'),
	{createTempVarNode} = require('./internalVars.js'),
	{assertWithLocation} = require('./utils.js'),
	{SUPER_BLOCK, PARAMS_BLOCK, SUPER_VAR_NODE, SUPER_VARS} = require('./symbols.js'),
	{SUPER_CALL, SUPER_EXPRESSION} = require('../shared/constants.js');

// Exports

/**
 * Visitor to track use of `super` in methods.
 * @param {Object} superPath - Babel path object for `super`
 * @param {Object} state - State object
 * @returns {undefined}
 */
module.exports = function superVisitor(superPath, state) {
	// Find method `super` is in
	const {currentFunction, currentFullFunction} = state,
		methodPath = currentFullFunction.path;
	assertWithLocation(
		methodPath.isMethod(), methodPath, state, `Unexpected super target type '${methodPath.type}'`
	);

	// Record location of `super` for transpiling
	const isClassMethod = methodPath.isClassMethod(),
		encloserPath = isClassMethod ? methodPath.parentPath.parentPath : methodPath.parentPath,
		superBlock = encloserPath[SUPER_BLOCK],
		{parentPath} = superPath,
		isSuperCall = parentPath.isCallExpression();
	currentFunction.amendments.unshift({
		type: isSuperCall ? SUPER_CALL : SUPER_EXPRESSION,
		blockId: superBlock.id,
		trail: [...state.trail]
	});

	if (isSuperCall) {
		// `super()` call - record whether is a top-level statement or return statement
		const classFn = currentFullFunction.parent,
			statementPath = parentPath.parentPath,
			isTopLevelStatement = statementPath.parentPath.parentPath === methodPath;
		if (isTopLevelStatement && statementPath.isExpressionStatement()) {
			// Top-level `super()` statement in constructor body
			const statementIndex = statementPath.key;
			if (statementIndex === statementPath.parentPath.node.body.length - 1) {
				// Last statement is `super()` - will be transpiled to `return Reflect.construct(...)`
				classFn.returnsSuper = true;
			} else if (classFn.firstSuperStatementIndex === undefined) {
				// First `super()` statement - record statement index
				classFn.firstSuperStatementIndex = statementIndex;
				createInternalVarForThis(currentFunction);
			}
		} else if (isTopLevelStatement && statementPath.isReturnStatement()) {
			// `return super()`
			classFn.returnsSuper = true;
		} else {
			// `super()` appears not as top level statement
			classFn.firstSuperStatementIndex = -1;
			createInternalOrExternalVarForThis(currentFunction, currentFullFunction, state);
		}
	} else {
		// `super` expression - `this$0` will be needed
		createInternalOrExternalVarForThis(currentFunction, currentFullFunction, state);
	}

	// Skip if another incidence of `super` in this function already encountered
	if (currentFunction.superVarNode !== undefined) return;

	// Record var use
	const fns = recordVarUse('super', superBlock, true, false, false, false, state);
	if (fns.length === 0) return;

	// Record super var node on functions
	const methodNode = methodPath.node;
	let superIsProto;
	if (isClassMethod && methodNode.kind === 'constructor') {
		// No need for a super var node for class constructor as serializer can just use the reference
		// to the class it already has
		currentFullFunction.superVarNode = null;

		if (last(fns) === currentFullFunction) {
			if (fns.length === 1) return;
			fns.pop();
		}

		superIsProto = true;
	} else {
		superIsProto = isClassMethod ? !methodNode.static : false;
	}

	const superVarNode = getSuperVarNode(encloserPath, currentFunction, isClassMethod, state);
	for (const fn of fns) {
		fn.superVarNode = superVarNode;
		if (superIsProto) fn.superIsProto = true;
	}
};

/**
 * Create internal/external var for `this$0`.
 * @param {Object} currentFunction - Function props object for current function
 * @param {Object} currentFullFunction - Function props object for current full function
 * @param {Object} state - State object
 * @returns {undefined}
 */
function createInternalOrExternalVarForThis(currentFunction, currentFullFunction, state) {
	if (currentFunction === currentFullFunction) {
		createInternalVarForThis(currentFunction);
	} else {
		recordVarUse('this', currentFullFunction.path[PARAMS_BLOCK], true, false, false, false, state);
	}
}

/**
 * Create internal var for `this$0`.
 * @param {Object} fn - Function props object for current function
 * @returns {undefined}
 */
function createInternalVarForThis(fn) {
	const {internalVars} = fn;
	if (!internalVars.this) internalVars.this = [];
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
 * @param {Object} currentFunction - Current function object
 * @param {boolean} isClass - `true` if encloser is class
 * @param {Object} state - State object
 * @returns {Object} - AST node for var to be used as super
 */
function getSuperVarNode(encloserPath, currentFunction, isClass, state) {
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
		const functionBodyScope = currentFunction.path.get('body').scope;
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
