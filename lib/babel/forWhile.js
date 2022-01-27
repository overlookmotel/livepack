/* --------------------
 * livepack module
 * Babel plugin for/while visitors
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createBlockProps, exitBlock, insertBlockVars} = require('./blocks.js'),
	{PARAMS_BLOCK, BODY_BLOCK} = require('./symbols.js');

// Exports

module.exports = {
	forEnterVisitor,
	forExitVisitor,
	whileEnterVisitor,
	whileExitVisitor
};

// TODO How to handle classes containing `super` created in `while (...)` clause of `do {} while (...)`?
// Temp var needs to be defined in body of loop, and evaluated at the end,
// but need to handle `continue` / `break` in loop body.
// Probably need to convert to a `for (...; ...; ...) {}` loop.

/**
 * Visitor to create block for `for` statements.
 * @param {Object} forPath - Babel path object for `for` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function forEnterVisitor(forPath, state) {
	// Create blocks for `for`. 2 separate blocks:
	// 1. "params" block for vars defined in init clause
	// 2. body block
	const paramsBlock = createBlockProps('for', true, state);
	forPath[PARAMS_BLOCK] = paramsBlock;

	if (!t.isBlockStatement(forPath.node.body)) {
		forPath[BODY_BLOCK] = paramsBlock;
	} else {
		const bodyBlock = createBlockProps(undefined, true, state);
		bodyBlock.parent = paramsBlock;
		paramsBlock.varsBlock = bodyBlock;
		forPath[BODY_BLOCK] = bodyBlock;
	}

	// Enter params block
	state.currentBlock = paramsBlock;
}

/**
 * Visitor to create body block statement for `for` statements
 * which have no body block and one is required.
 * It's needed where variables defined in the init node are referenced in functions
 * in the init clause or body, in which case a scope var statement will need to be inserted
 * in the body block.
 * `for (const x of [1, 2, 3]) fns.push(() => x);` -> `for (const x of [1, 2, 3]) { fns.push(() => x); }`
 * @param {Object} forPath - Babel path object for `for` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function forExitVisitor(forPath, state) {
	// Create body block statement if required
	const {node} = forPath;
	let bodyNode = node.body;
	if (!t.isBlockStatement(bodyNode) && state.currentBlock.scopeIdVarNode) {
		bodyNode = t.blockStatement([bodyNode]);
		node.body = bodyNode;
		insertBlockVars(bodyNode, state);
	}

	// Exit params block
	exitBlock(state);
}

/**
 * Visitor to create block for `while` / `do while` statements.
 * @param {Object} whilePath - Babel path object for `while` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function whileEnterVisitor(whilePath, state) {
	const block = createBlockProps(undefined, true, state);
	whilePath[BODY_BLOCK] = block;
	state.currentBlock = block;
}

/**
 * Visitor to create body block statement for `while` / `do while` statements
 * which have no body block and one is required.
 * It's needed if object or class with method using `super` defined in loop
 * and requires temp var scoped to inside loop.
 * e.g. `while (x) fn(class extends C {m() { super.m() }})`
 * `do fn(class extends C {m() { super.m() }}); while (x)`
 * @param {Object} whilePath - Babel path object for `for` / `while` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function whileExitVisitor(whilePath, state) {
	const {node} = whilePath;
	let bodyNode = node.body;
	if (!t.isBlockStatement(bodyNode)) {
		if (state.currentBlock.scopeIdVarNode) {
			bodyNode = t.blockStatement([bodyNode]);
			node.body = bodyNode;
			insertBlockVars(bodyNode, state);
		}

		// Exit body block.
		// NB If loop body was a block statement, it'd already been exited in `blockStatementExitVisitor()`.
		exitBlock(state);
	}
}
