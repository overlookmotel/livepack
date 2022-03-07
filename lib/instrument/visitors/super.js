/* --------------------
 * livepack module
 * Code instrumentation visitor for `super`
 * ------------------*/

'use strict';

// Export
module.exports = {
	Super,
	recordSuper,
	activateSuperBinding,
	createInternalVarForThis,
	createExternalVarForThis,
	setSuperIsProtoOnFunctions,
	getSuperVarNode,
	getParentFullFunction
};

// Imports
const {
		createBindingWithoutNameCheck, getOrCreateExternalVar, activateBlock, createBlockTempVar
	} = require('../blocks.js'),
	{getProp} = require('../../shared/functions.js'),
	{SUPER_CALL, SUPER_EXPRESSION} = require('../../shared/constants.js');

// Constants
const NONE = 0,
	INTERNAL = 1,
	EXTERNAL = 2;

// Exports

/**
 * Visitor for `super`.
 * @param {Object} node - `super` AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function Super(node, state, parent, key) {
	// Exit if not in a function. Must be inside `eval()` within class or object method.
	const fn = state.currentFunction;
	if (!fn) return;

	// Determine if is `super()` call or other use of `super` and if in a nested arrow function.
	const isSuperCall = key === 'callee' && parent.type === 'CallExpression',
		isInArrowFunction = fn.node.type === 'ArrowFunctionExpression';

	// If `super()` call, check its position within class constructor
	// and determine if transpiled super requires `this$0` var too
	let thisVarType = NONE;
	if (isSuperCall) {
		// `super()` call.
		// We must be inside class constructor as `super()` is illegal anywhere else,
		// however could be inside an arrow function nested within the constructor.
		// TODO Handle `super()` in class constructor params
		const {trail} = state,
			// `trail[3] === 'body'` ensures `super()` is not in constructor's params
			isTopLevelStatement = !isInArrowFunction && trail.length === 8 && trail[3] === 'body';
		if (isTopLevelStatement && trail[6] === 'expression') {
			// Top-level `super()` expression statement in constructor body.
			// NB `ExpressionStatement` is only kind of statement node with a key 'expression'.
			const statementIndex = trail[5];
			if (statementIndex === getProp(fn.node, trail, 5).length - 1) {
				// Last statement is `super()` - will be transpiled to `return Reflect.construct(...)`
				fn.returnsSuper = true;
			} else if (fn.firstSuperStatementIndex === undefined) {
				// First `super()` statement - record statement index
				fn.firstSuperStatementIndex = statementIndex;
				thisVarType = INTERNAL;
			}
		} else if (
			// Need to check parent node type as `ThrowStatement` also has an `argument` property
			isTopLevelStatement && trail[6] === 'argument'
			&& getProp(fn.node, trail, 6).type === 'ReturnStatement'
		) {
			// `return super()`
			fn.returnsSuper = true;
		} else if (isInArrowFunction) {
			// `super()` appears within a nested arrow function
			const classFn = getParentFullFunction(fn);
			if (classFn) classFn.firstSuperStatementIndex = -1;
			thisVarType = EXTERNAL;
		} else {
			// `super()` appears in constructor, but not as top level statement
			fn.firstSuperStatementIndex = -1;
			thisVarType = INTERNAL;
		}
	} else {
		// `super` expression - `this$0` will be needed
		thisVarType = isInArrowFunction ? EXTERNAL : INTERNAL;
	}

	// Create external var for `super`
	const superBlock = state.currentSuperBlock;
	recordSuper(superBlock, fn, state);

	// Create internal/external var for `this` if required
	if (thisVarType === INTERNAL) {
		createInternalVarForThis(fn);
	} else if (thisVarType === EXTERNAL) {
		createExternalVarForThis(fn, state);
	}

	// Set `superIsProto` on all functions between this one and the `super` target
	setSuperIsProtoOnFunctions(superBlock, fn, state);

	// Schedule recording usage of `super` in 2nd pass
	state.secondPass(recordAmendmentForSuper, node, superBlock, isSuperCall, fn, [...state.trail]);
}

/**
 * Record usage of `super` in function.
 * Activate `super` target binding + create external var for `super` (`super` is always an external var).
 * @param {Object} superBlock - `super` target block
 * @param {Object} fn - Function object
 * @param {*} state - State object
 * @returns {undefined}
 */
function recordSuper(superBlock, fn, state) {
	const binding = activateSuperBinding(superBlock, state);
	const superExternalVar = getOrCreateExternalVar(fn.externalVars, superBlock, 'super', binding);
	superExternalVar.isReadFrom = true;
}

/**
 * Activate `super` target binding.
 * Create binding for `super` target + a temp var node to have `super` target assigned to it.
 * Binding is created lazily when `super` is encountered - most methods won't use `super`.
 * @param {Object} superBlock - `super` target block object
 * @param {Object} state - State object
 * @returns {Object} - Binding for `super` target
 */
function activateSuperBinding(superBlock, state) {
	activateBlock(superBlock, state);
	let binding = superBlock.bindings.super;
	if (!binding) {
		binding = createBindingWithoutNameCheck(superBlock, 'super', {
			varNode: createBlockTempVar(superBlock, state),
			isConst: true
		});
	}
	return binding;
}

/**
 * Create internal var for `this` on function.
 * @param {Object} fn - Function object
 * @returns {undefined}
 */
function createInternalVarForThis(fn) {
	const {internalVars} = fn;
	if (!internalVars.this) internalVars.this = [];
}

/**
 * Create external var for `this` on function.
 * @param {Object} fn - Function object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function createExternalVarForThis(fn, state) {
	const thisBlock = state.currentThisBlock;
	activateBlock(thisBlock, state);
	const thisExternalVar = getOrCreateExternalVar(
		fn.externalVars, thisBlock, 'this', thisBlock.bindings.this
	);
	thisExternalVar.isReadFrom = true;
}

/**
 * Set `superIsProto` on all functions between this one and the `super` target
 * @param {Object} superBlock - `super` target block object
 * @param {Object} fn - Function object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function setSuperIsProtoOnFunctions(superBlock, fn, state) {
	if (!state.currentSuperIsProto) return;

	const superBlockId = superBlock.id;
	while (!fn.superIsProto) {
		fn.superIsProto = true;
		fn = fn.parent;
		if (!fn || fn.id < superBlockId) break;
	}
}

/**
 * Record amendment for `super`.
 * Used in serializer to transpile `super`.
 * Done in 2nd pass so the amendment that's recorded is in correct order relative to other amendments.
 * @param {Object} node - `super` AST node (not needed but passed for debug reasons)
 * @param {Object} superBlock - `super` block object
 * @param {boolean} isSuperCall - `true` if is a `super()` call
 * @param {Object} fn - Function object
 * @param {Array<string|number>} trail - Trail
 * @returns {undefined}
 */
function recordAmendmentForSuper(node, superBlock, isSuperCall, fn, trail) {
	// Record amendment for `super`
	fn.amendments.push({
		type: isSuperCall ? SUPER_CALL : SUPER_EXPRESSION,
		blockId: superBlock.id,
		trail
	});
}

/**
 * Get temp var node for `super` target.
 * @param {Object} superBlock - `super` target block object
 * @returns {Object|undefined} - Temp var identifier AST node, or `undefined` if binding not used
 */
function getSuperVarNode(superBlock) {
	const binding = superBlock.bindings.super;
	return binding ? binding.varNode : undefined;
}

/**
 * Get parent function which is a full function/class.
 * @param {Object} fn - Function object
 * @returns {Object|undefined} - Full function object (or `undefined` if none found)
 */
function getParentFullFunction(fn) {
	do {
		fn = fn.parent;
	} while (fn && fn.node.type === 'ArrowFunctionExpression');
	return fn;
}
