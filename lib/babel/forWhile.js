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
	forOrWhileEnterVisitor,
	forOrWhileExitVisitor
};

/**
 * Visitor to create block for `for` / `while` / `do while` statements.
 * @param {Object} forOrWhilePath - Babel path object for `for` / `while` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function forOrWhileEnterVisitor(forOrWhilePath, state) {
	const block = createBlockProps(undefined, true, state);
	// TODO This isn't correct - initializer and body should be separate blocks
	// https://github.com/overlookmotel/livepack/issues/108
	if (forOrWhilePath.isFor()) forOrWhilePath[PARAMS_BLOCK] = block;
	forOrWhilePath[BODY_BLOCK] = block;
	state.currentBlock = block;
}

/**
 * Visitor to create body block for `for` / `while` / `do while` statements which have no body block
 * where it's required.
 *
 * `for`: variables defined in the init node are referenced in functions created in the body,
 * in which case a scope var statement will need to be inserted in the body block.
 * `for (const x of [1, 2, 3]) fns.push(() => x);` -> `for (const x of [1, 2, 3]) { fns.push(() => x); }`
 *
 * `while` / `do while`: object or class with method using `super` defined in loop
 * and requires temp var scoped to inside loop.
 * e.g. `while (x) fn(class extends C {m() { super.m() }})`
 * `do fn(class extends C {m() { super.m() }}); while (x)`
 *
 * @param {Object} forOrWhilePath - Babel path object for `for` / `while` statement
 * @param {Object} state - State object
 * @returns {undefined}
 */
function forOrWhileExitVisitor(forOrWhilePath, state) {
	const {node} = forOrWhilePath;
	let bodyNode = node.body;
	if (!t.isBlockStatement(bodyNode)) {
		const block = state.currentBlock;
		if (block.scopeIdVarNode) {
			bodyNode = t.blockStatement([bodyNode]);
			node.body = bodyNode;
			insertBlockVars(bodyNode, state);
		}
		exitBlock(state);
	}
}
