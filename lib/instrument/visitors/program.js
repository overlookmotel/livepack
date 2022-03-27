/* --------------------
 * livepack module
 * Code instrumentation visitor for program
 * ------------------*/

'use strict';

// Export
module.exports = Program;

// Imports
const Statement = require('./statement.js'),
	{ImportDeclaration, ExportDefaultDeclaration, ExportNamedDeclaration} = require('./module.js'),
	{createAndEnterBlock} = require('../blocks.js'),
	{visitKeyContainer} = require('../visit.js'),
	{hasUseStrictDirective} = require('../utils.js');

// Exports

/**
 * Visitor for program.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function Program(node, state) {
	// Determine if strict mode
	if (!state.isStrict && (node.sourceType === 'module' || hasUseStrictDirective(node))) {
		state.isStrict = true;
	}

	// Create program block
	const fileBlock = state.currentBlock;
	const programBlock = createAndEnterBlock(fileBlock.name, true, state);
	state.programBlock = programBlock;
	// TODO If code is a script or in indirect `(0, eval)(...)`,
	// `var` declarations and function declarations (including async functions + generator functions)
	// create globals, not local bindings.
	// In direct `eval()` they create bindings in hoist block external to the `eval()`.
	// So in both cases, there shouldn't be a hoist block.
	state.currentHoistBlock = programBlock;
	fileBlock.varsBlock = programBlock;

	// Visit statements
	visitKeyContainer(node, 'body', TopLevelStatement, state);

	// Exit program block
	state.currentBlock = fileBlock;
	state.currentHoistBlock = undefined;
}

/**
 * Visitor for top level statement.
 * Module import/export statements are only legal at top level.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @param {Object|Array} parent - Parent AST node/container
 * @param {string|number} key - Node's key on parent AST node/container
 * @returns {undefined}
 */
function TopLevelStatement(node, state, parent, key) {
	switch (node.type) {
		case 'ImportDeclaration': return ImportDeclaration(node, state);
		case 'ExportDefaultDeclaration': return ExportDefaultDeclaration(node, state);
		case 'ExportNamedDeclaration': return ExportNamedDeclaration(node, state);
		case 'ExportAllDeclaration': return; // eslint-disable-line consistent-return
		default: return Statement(node, state, parent, key);
	}
}
