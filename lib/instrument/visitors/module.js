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
	ImportOrMetaProperty
};

// Imports
const Expression = require('./expression.js'),
	VariableDeclaration = require('./variableDeclaration.js'),
	{FunctionDeclaration} = require('./function.js'),
	{ClassDeclaration} = require('./class.js'),
	{createBinding} = require('../blocks.js'),
	{visitKey, visitKeyMaybe, visitKeyContainer} = require('../visit.js'),
	{flagAllAncestorFunctions} = require('../utils.js');

// Exports

// NB `ExportAllDeclaration` needs no visitor.
// It's a no-op as no need to visit `source` as is only a StringLiteral.

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
 * @returns {undefined}
 * @throws {Error} - If unexpected AST node type
 */
function ImportSpecifierAny(node, state) {
	switch (node.type) {
		case 'ImportSpecifier':
		case 'ImportDefaultSpecifier':
		case 'ImportNamespaceSpecifier': return ImportSpecifier(node, state);
		default: throw new Error(`Unexpected import specifier type '${node.type}'`);
	}
}

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
	switch (node.type) {
		case 'FunctionDeclaration': return FunctionDeclaration(node, state, parent, 'declaration');
		case 'ClassDeclaration': return ClassDeclaration(node, state, parent, 'declaration');
		default: return Expression(node, state, parent, 'declaration');
	}
}

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
 * @throws {Error} - If unexpected AST node type
 */
function ExportNamedDeclarationValue(node, state, parent) {
	switch (node.type) {
		case 'VariableDeclaration': return VariableDeclaration(node, state);
		case 'FunctionDeclaration': return FunctionDeclaration(node, state, parent, 'declaration');
		case 'ClassDeclaration': return ClassDeclaration(node, state, parent, 'declaration');
		default: throw new Error(`Unexpected named export declaration type '${node.type}'`);
	}
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
