/* --------------------
 * livepack module
 * Code instrumentation block functions
 * ------------------*/

'use strict';

// Export
module.exports = {
	createBlock,
	createBlockWithId,
	createAndEnterBlock,
	createBlockId,
	createBinding,
	createBindingWithoutNameCheck,
	createThisBinding,
	createArgumentsBinding,
	createNewTargetBinding,
	getOrCreateExternalVar,
	activateBlock,
	activateBinding,
	createBlockTempVar
};

// Modules
const t = require('@babel/types');

// Imports
const {
		createScopeIdVarNode, createTempVarNode, checkInternalVarNameClash
	} = require('./internalVars.js'),
	{createArrayOrPush} = require('../shared/functions.js');

// Exports

/**
 * Create block.
 * @param {string} [name] - Block name
 * @param {boolean} isVarsBlock - `true` if is a vars block
 * @param {Object} state - State object
 * @returns {Object} - Block object
 */
function createBlock(name, isVarsBlock, state) {
	return createBlockWithId(createBlockId(state), name, isVarsBlock, state);
}

/**
 * Create block with specified ID.
 * @param {number} id - Block ID
 * @param {string} [name] - Block name
 * @param {boolean} isVarsBlock - `true` if is a vars block
 * @param {Object} state - State object
 * @returns {Object} - Block object
 */
function createBlockWithId(id, name, isVarsBlock, state) {
	const parent = state.currentBlock;
	const block = {
		id,
		name,
		parent,
		bindings: new Map(), // Keyed by binding name
		varsBlock: undefined,
		scopeIdVarNode: undefined,
		tempVarNodes: undefined
	};
	block.varsBlock = isVarsBlock ? block : parent.varsBlock;
	return block;
}

/**
 * Create block and enter it.
 * @param {string} [name] - Block name
 * @param {boolean} isVarsBlock - `true` if is a vars block
 * @param {Object} state - State object
 * @returns {Object} - Block object
 */
function createAndEnterBlock(name, isVarsBlock, state) {
	// eslint-disable-next-line no-return-assign
	return state.currentBlock = createBlock(name, isVarsBlock, state);
}

/**
 * Create unique block ID.
 * @param {Object} state - State object
 * @returns {number} - Block ID
 */
function createBlockId(state) {
	return state.nextBlockId++;
}

/**
 * Create binding for variable in block.
 * Also check if `varName` potentially clashes with Livepack's internal vars.
 *
 * @param {Object} block - Block object
 * @param {string} varName - Variable name
 * @param {Object} props - Properties object
 * @param {boolean} [props.isConst=false] - `true` if is const
 * @param {boolean} [props.isSilentConst=false] - `true` if is function expression name,
 *   assignment to which fails silently in sloppy mode
 * @param {boolean} [props.isVar=false] - `true` if defined with `var` statement or function declaration
 * @param {boolean} [props.isFrozenName=false] - `true` if is var which is not renamed when used
 *   inside function in which it's bound
 * @param {Array<string>} [props.argNames] - Linked argument names (only relevant for `arguments`)
 * @param {Object} state - State object
 * @returns {Object} - Binding object
 */
function createBinding(block, varName, props, state) {
	checkInternalVarNameClash(varName, state);
	return createBindingWithoutNameCheck(block, varName, props);
}

/**
 * Create binding for variable in block.
 * Do not check if `varName` potentially clashes with Livepack's internal vars.
 * Intended to be called for vars which it's known are non-clashing e.g. `arguments`.
 *
 * @param {Object} block - Block object
 * @param {string} varName - Variable name
 * @param {Object} props - Properties object
 * @param {Object} [props.varNode] - Identifier AST node for var which will go in tracker function call
 * @param {boolean} [props.isConst=false] - `true` if is const
 * @param {boolean} [props.isSilentConst=false] - `true` if is function expression name,
 *   assignment to which fails silently in sloppy mode
 * @param {boolean} [props.isVar=false] - `true` if defined with `var` statement or function declaration
 * @param {boolean} [props.isFrozenName=false] - `true` if is var which is not renamed when used
 *   inside function in which it's bound
 * @param {Array<string>} [props.argNames] - Linked argument names (only relevant for `arguments`)
 * @returns {Object} - Binding object
 */
function createBindingWithoutNameCheck(block, varName, props) {
	const binding = {
		name: varName,
		varNode: props.varNode,
		isConst: !!props.isConst,
		isSilentConst: !!props.isSilentConst,
		isVar: !!props.isVar,
		isFrozenName: !!props.isFrozenName,
		argNames: props.argNames,
		trails: [] // Trails of usages within same function as binding, where var not frozen
	};
	block.bindings.set(varName, binding);
	return binding;
}

/**
 * Create binding for `this`.
 * @param {Object} block - Block object
 * @returns {Object} - Binding object
 */
function createThisBinding(block) {
	// `isFrozenName: true` because it cannot be renamed within function in which it's created
	return createBindingWithoutNameCheck(
		// eslint-disable-next-line no-use-before-define
		block, 'this', {varNode: thisNode, isConst: true, isFrozenName: true}
	);
}

const thisNode = t.thisExpression();

/**
 * Create binding for function `arguments`.
 * @param {Object} block - Block object
 * @param {boolean} isConst - `true` if is const (strict mode)
 * @param {Array<string>} argNames - Linked argument names
 * @returns {Object} - Binding object
 */
function createArgumentsBinding(block, isConst, argNames) {
	// `isFrozenName: true` because it cannot be renamed within function in which it's created
	return createBindingWithoutNameCheck(block, 'arguments', {isConst, isFrozenName: true, argNames});
}

/**
 * Create binding for `new.target`.
 * @param {Object} block - Block object
 * @returns {Object} - Binding object
 */
function createNewTargetBinding(block) {
	// `isFrozenName: true` because it cannot be renamed within function in which it's created
	/* eslint-disable no-use-before-define */
	newTargetNode ||= t.metaProperty(t.identifier('new'), t.identifier('target'));
	return createBindingWithoutNameCheck(
		block, 'new.target', {varNode: newTargetNode, isConst: true, isFrozenName: true}
	);
	/* eslint-enable no-use-before-define */
}

let newTargetNode;

/**
 * Get or create an external var in a function.
 * @param {Object} fn - Function object
 * @param {Object} block - Block object
 * @param {string} varName - Var name
 * @param {Object} binding - Binding object
 * @returns {Object} - External var object
 */
function getOrCreateExternalVar(fn, block, varName, binding) {
	let blockVars = fn.externalVars.get(block),
		externalVar;
	if (blockVars) {
		externalVar = blockVars[varName];
	} else {
		blockVars = Object.create(null);
		fn.externalVars.set(block, blockVars);
	}

	if (!externalVar) {
		externalVar = {
			binding,
			isReadFrom: false,
			isAssignedTo: false,
			isFrozenName: fn.containsEval,
			trails: []
		};
		blockVars[varName] = externalVar;
	}
	return externalVar;
}

/**
 * Activate block.
 * Called when block contains a binding which is referenced within a function.
 * @param {Object} block - Block object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function activateBlock(block, state) {
	const {varsBlock} = block;
	if (!varsBlock.scopeIdVarNode) varsBlock.scopeIdVarNode = createScopeIdVarNode(varsBlock.id, state);
}

/**
 * Activate binding.
 * Called when a binding is accessed from within a function.
 * @param {Object} binding - Binding object
 * @returns {undefined}
 */
function activateBinding(binding) {
	if (!binding.varNode) binding.varNode = t.identifier(binding.name);
}

/**
 * Create temp var in block.
 * @param {Object} block - Block object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function createBlockTempVar(block, state) {
	const tempVarNode = createTempVarNode(state);
	createArrayOrPush(block.varsBlock, 'tempVarNodes', tempVarNode);
	return tempVarNode;
}
