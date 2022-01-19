/* --------------------
 * livepack module
 * Babel plugin blocks visitors
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {BODY_BLOCK} = require('./symbols.js');

// Exports

module.exports = {
	blockStatementEnterVisitor,
	blockStatementExitVisitor,
	exitBlock,
	createBlockId,
	createBlockProps,
	insertBlockVars,
	initBlockScope
};

// Import after exports to avoid circular require
const {createScopeIdVarNode} = require('./internalVars.js');

/**
 * Visitor to set a block ID on every block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - State object
 * @returns {undefined}
 */
function blockStatementEnterVisitor(blockPath, state) {
	// If is body of function or `for` / `while` statement, use block already created
	const {parentPath} = blockPath,
		{type} = parentPath;
	const block = (
		type === 'FunctionDeclaration' || type === 'FunctionExpression'
		|| type === 'ArrowFunctionExpression' || type === 'ClassMethod' || type === 'ObjectMethod'
		|| type === 'ForStatement' || type === 'ForInStatement' || type === 'ForOfStatement'
		|| type === 'WhileStatement' || type === 'DoWhileStatement'
		|| type === 'CatchClause'
	) ? parentPath[BODY_BLOCK] : createBlockProps(undefined, true, state);
	blockPath[BODY_BLOCK] = block;
	state.currentBlock = block;
}

/**
 * Visitor to add `const scopeId_3 = livepack_getScopeId();` at start of block if block is a scope.
 * Also adds any temp var declarations to start of block.
 * @param {Object} blockPath - Babel path object for statement block
 * @param {Object} state - State object
 * @returns {undefined}
 */
function blockStatementExitVisitor(blockPath, state) {
	insertBlockVars(blockPath.node, state);
	exitBlock(state);
}

/**
 * Exit block.
 * @param {Object} state - State object
 * @returns {undefined}
 */
function exitBlock(state) {
	state.currentBlock = state.currentBlock.parent;
}

/**
 * Create unique block ID.
 * @param {Object} state - State object
 * @returns {number} - Block ID
 */
function createBlockId(state) {
	return state.blockId++;
}

/**
 * Create block props object.
 * @param {string} [name] - Block name
 * @param {boolean} canHoldVars - `true` if block can hold vars e.g. statement block
 * @param {Object} state - State object
 * @returns {Object} - Block props object
 */
function createBlockProps(name, canHoldVars, state) {
	const parentBlock = state.currentBlock;
	const block = {
		id: createBlockId(state),
		name,
		scopeIdVarNode: undefined,
		tempVarNodes: undefined,
		parent: parentBlock,
		varsBlock: undefined
	};
	block.varsBlock = canHoldVars ? block : parentBlock;
	return block;
}

/**
 * Insert scope ID var and temp vars at start of statement block.
 * @param {Object} blockNode - AST node for block statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function insertBlockVars(blockNode, state) {
	const block = state.currentBlock,
		{scopeIdVarNode} = block;
	if (!scopeIdVarNode) return;

	// Insert `const scopeId_3 = livepack_getScopeId();` statement at top of block
	const insertNodes = [
		t.variableDeclaration(
			'const', [t.variableDeclarator(scopeIdVarNode, t.callExpression(state.getScopeIdVarNode, []))]
		)
	];

	// Insert temp vars declaration at top of block
	const {tempVarNodes} = block;
	if (tempVarNodes) {
		insertNodes.push(t.variableDeclaration('let', tempVarNodes.map(node => t.variableDeclarator(node))));
	}

	blockNode.body.unshift(...insertNodes);
}

/**
 * Init scope on statement block.
 * @param {Object} block - Block props object
 * @param {Object} state - State object
 * @returns {undefined}
 */
function initBlockScope(block, state) {
	const {varsBlock} = block;
	if (!varsBlock.scopeIdVarNode) varsBlock.scopeIdVarNode = createScopeIdVarNode(varsBlock.id, state);
}
