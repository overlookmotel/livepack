/* --------------------
 * livepack module
 * Code instrumentation visitor for `import` / `export` statements and `import` expression
 * ------------------*/

'use strict';

// Export
module.exports = {
	ImportDeclaration,
	ExportDefaultDeclaration,
	ExportNamedDeclaration,
	ExportAllDeclaration,
	ImportOrMetaProperty
};

// Imports
const Expression = require('./expression.js'),
	VariableDeclaration = require('./variableDeclaration.js'),
	{FunctionDeclaration} = require('./function.js'),
	{ClassDeclaration} = require('./class.js'),
	{createBinding} = require('../blocks.js'),
	{visitKey, visitKeyMaybe, visitKeyContainer, visitWith} = require('../visit.js'),
	{flagAllAncestorFunctions} = require('../utils.js');

// Exports

/**
 * Visitor for import declaration.
 * @param {Object} node - Import declaration AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ImportDeclaration(node, state) {
	visitKeyContainer(node, 'specifiers', ImportSpecifierAny, state);
	// No need to visit `source` as it's always StringLiteral
}

/**
 * Visitor for import declaration specifier.
 * @param {Object} node - Import specifier AST node
 * @param {Object} state - State object
 * @param {Array} parent - Import declaration specifiers AST container
 * @param {number} key - Node's index in specifiers AST container
 * @returns {undefined}
 */
function ImportSpecifierAny(node, state, parent, key) {
	// eslint-disable-next-line no-use-before-define
	visitWith(node, importSpecifierVisitors, 'import specifier', state, parent, key);
}

const importSpecifierVisitors = {
	ImportSpecifier,
	ImportDefaultSpecifier: ImportSpecifier,
	ImportNamespaceSpecifier: ImportSpecifier
};

/**
 * Visitor for import specifier.
 * @param {Object} node - Import specifier AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ImportSpecifier(node, state) {
	// No need to visit `imported` as it's always Identifier or StringLiteral
	createBinding(state.currentBlock, node.local.name, {isConst: true}, state);
}

/**
 * Visitor for export default declaration.
 * @param {Object} node - Export default declaration AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ExportDefaultDeclaration(node, state) {
	visitKey(node, 'declaration', ExportDefaultDeclarationValue, state);
}

/**
 * Visitor for export default declaration value.
 * @param {Object} node - Export default declaration value AST node
 * @param {Object} state - State object
 * @param {Object} parent - Export default declaration AST node
 * @returns {undefined}
 */
function ExportDefaultDeclarationValue(node, state, parent) {
	// eslint-disable-next-line no-use-before-define
	(exportDefaultDeclarationValueVisitors[node.type] || Expression)(node, state, parent, 'declaration');
}

const exportDefaultDeclarationValueVisitors = {
	FunctionDeclaration,
	ClassDeclaration
};

/**
 * Visitor for export named declaration.
 * @param {Object} node - Export named declaration AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ExportNamedDeclaration(node, state) {
	// No need to visit `specifiers` as only contains Identifiers.
	// No need to visit `source` as is only a StringLiteral.
	visitKeyMaybe(node, 'declaration', ExportNamedDeclarationValue, state);
}

/**
 * Visitor for export named declaration value.
 * @param {Object} node - Export named declaration value AST node
 * @param {Object} state - State object
 * @param {Object} parent - Export default declaration AST node
 * @returns {undefined}
 */
function ExportNamedDeclarationValue(node, state, parent) {
	visitWith(
		// eslint-disable-next-line no-use-before-define
		node, exportNamedDeclarationVisitors, 'named export declaration', state, parent, 'declaration'
	);
}

const exportNamedDeclarationVisitors = {
	VariableDeclaration,
	FunctionDeclaration,
	ClassDeclaration
};

/**
 * Visitor for export all declaration.
 * @returns {undefined}
 */
function ExportAllDeclaration() {
	// No-op - no need to visit `source` as is only a StringLiteral
}

/**
 * Visitor for `import` expression or meta property.
 * @param {Object} node - `import` expression or meta property AST node
 * @param {Object} state - State object
 * @returns {undefined}
 */
function ImportOrMetaProperty(node, state) {
	flagAllAncestorFunctions(state.currentFunction, 'containsImport');
}
