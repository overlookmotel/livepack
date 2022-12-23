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
	{visitKeyContainer} = require('../visit.js');

// Exports

/**
 * Visitor for program.
 * @param {Object} node - AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function Program(node, state) {
	visitKeyContainer(node, 'body', TopLevelStatement, state);
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
