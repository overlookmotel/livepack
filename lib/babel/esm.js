/* --------------------
 * livepack module
 * Babel plugin ES Modules transform functions
 * ------------------*/

'use strict';

// Modules
const pathJoin = require('path').join,
	assert = require('simple-invariant'),
	t = require('@babel/types');

// Imports
const {
		getOrCreateImportVarNode, getOrCreateImportAsyncVarNode,
		createModuleVarNode, createExportsVarNode, createMakeDefaultVarNode
	} = require('./internalVars.js'),
	{internalIdentifier, flagAsInternal} = require('./utils.js'),
	{
		IS_ESM, IMPORT_VAR_NODE, IMPORT_ASYNC_VAR_NODE, EXPORTS_VAR_NODE, GLOBAL_VAR_NODE,
		MODULE_VARS, EVAL_IS_USED
	} = require('./symbols.js'),
	{identifierIsVariable} = require('../shared/functions.js'),
	{COMMON_JS_VAR_NAMES} = require('../shared/constants.js');

// Constants
const IMPORT_PATH = pathJoin(__dirname, '../init/import.js');

// Exports

// TODO Handle `export from`
// TODO Pass through details of import vars to `eval()` statements
// TODO Use of `eval()` causing errors
// TODO Support `import.meta.url` + `import.meta.resolve` (`MetaProperty` babel node type)

module.exports = {
	transformEsModule,
	wrapInBlockIfReservedVars,
	getEsmHeaders
};

function transformEsModule(programPath, state) {
	// Init module vars
	const moduleVars = state[MODULE_VARS],
		moduleVarNodes = new Map(); // Keyed by URL

	// Create exports var
	const exportsVarNode = createExportsVarNode(state);
	state[EXPORTS_VAR_NODE] = exportsVarNode;

	// Init array of exports statements
	const exportStatements = [];
	function addExportStatement(keyNode, valueNode, isDefault) {
		exportStatements[isDefault ? 'unshift' : 'push'](
			createAssignmentStatement(
				exportsVarNode,
				keyNode,
				valueNode || t.unaryExpression('void', t.numericLiteral(0))
			)
		);
	}

	// Add 'use strict' declaration
	addStrictModeDeclaration(programPath);

	// Transform import/export statements
	const {body} = programPath.node;
	for (let index = 0; index < body.length; index++) {
		const statementPath = programPath.get(`body.${index}`);
		if (statementPath.isImportDeclaration()) {
			// Import
			const importVarNode = getOrCreateImportVarNode(state);
			const statementRemoved = transformImport(
				statementPath, moduleVarNodes, moduleVars, importVarNode, state
			);
			if (statementRemoved) index--;
		} else if (statementPath.isExportDefaultDeclaration() || statementPath.isExportNamedDeclaration()) {
			// Export
			transformExport(statementPath, exportsVarNode, moduleVars, addExportStatement, state);
		}
	}

	// Write exports statements
	programPath.unshiftContainer('body', exportStatements);
}

function transformImport(statementPath, moduleVarNodes, moduleVars, importVarNode, state) {
	const statementNode = statementPath.node,
		url = statementNode.source.value;
	let statementRemoved = false;

	// Get/create module var.
	// Multiple imports from same URL are replaced by 1 single import.
	let moduleVarNode = moduleVarNodes.get(url);
	if (!moduleVarNode) {
		moduleVarNode = createModuleVarNode(moduleVarNodes.size, state);
		moduleVarNodes.set(url, moduleVarNode);

		statementPath.replaceWith(
			// `const livepack_module_0 = livepack_import('./foo.js');`
			t.variableDeclaration('const', [
				t.variableDeclarator(
					moduleVarNode,
					t.callExpression(importVarNode, [t.stringLiteral(url)])
				)
			])
		);
	} else {
		statementPath.remove();
		statementRemoved = true;
	}

	// Get imported vars
	for (const specifierNode of statementNode.specifiers) {
		const {name} = specifierNode.local;
		assert(!moduleVars.has(name), `Duplicate identifier '${name}' in import statements`);

		const {type} = specifierNode;
		let key;
		if (type === 'ImportDefaultSpecifier') {
			key = 'default';
		} else if (type === 'ImportSpecifier') {
			key = specifierNode.imported.name;
		} else {
			assert(type === 'ImportNamespaceSpecifier');
			key = null;
		}

		moduleVars.set(name, {key, moduleVarNode, isExport: false});
	}

	return statementRemoved;
}

function transformExport(statementPath, exportsVarNode, moduleVars, addExportStatement, state) {
	const statementNode = statementPath.node,
		declarationNode = statementNode.declaration;
	if (declarationNode) {
		const isDefault = statementPath.isExportDefaultDeclaration();
		if (t.isFunctionDeclaration(declarationNode) || t.isClassDeclaration(declarationNode)) {
			// Function or class declaration
			// e.g. `export default function() {}` / `export function x() {}`
			transformExportFunction(
				statementPath, exportsVarNode, moduleVars, isDefault, addExportStatement, state
			);
		} else if (isDefault) {
			// Default expression e.g. `export default 123;`
			transformDefaultExpression(statementPath, exportsVarNode, addExportStatement);
		} else {
			// Var statement e.g. `export const x = 1, {y} = obj;`
			transformExportVarDeclaration(statementPath, exportsVarNode, moduleVars, addExportStatement);
		}
	} else {
		// Variables export e.g. `export {x, q as y}`
		transformExportVars(statementPath, exportsVarNode, moduleVars, addExportStatement);
	}
}

function transformExportFunction(
	statementPath, moduleVarNode, moduleVars, isDefault, addExportStatement, state
) {
	let declarationNode = statementPath.node.declaration,
		keyNode,
		valueNode = declarationNode.id,
		valueName;
	const isFunction = t.isFunctionDeclaration(declarationNode);
	if (isDefault) {
		keyNode = t.identifier('default');
		if (!valueNode) {
			// Un-named default function.
			// Wrap in `makeDefault` function to ensure function's name retained as 'default'.
			assert(isDefault);

			const makeDefaultVarNode = createMakeDefaultVarNode(state);

			declarationNode.type = isFunction ? 'FunctionExpression' : 'ClassExpression';

			// `function livepack_makeDefault() { return {default: function(...) {...}}.default; }`
			declarationNode = t.functionDeclaration(
				makeDefaultVarNode,
				[],
				t.blockStatement([t.returnStatement(wrapInDefaultObject(declarationNode))])
			);

			valueNode = t.callExpression(makeDefaultVarNode, []);
		} else {
			flagAsInternal(valueNode);
			valueName = valueNode.name;
		}
	} else {
		flagAsInternal(valueNode);
		keyNode = valueNode;
		valueName = valueNode.name;
	}

	if (isFunction) {
		statementPath.replaceWith(declarationNode);
	} else {
		// Class
		statementPath.replaceWithMultiple([
			declarationNode,
			createAssignmentStatement(moduleVarNode, keyNode, valueNode)
		]);
		valueNode = undefined;
	}

	addExportStatement(keyNode, valueNode, isDefault);

	if (valueName) moduleVars.set(valueName, {key: valueName, moduleVarNode, isExport: true});
}

function transformDefaultExpression(statementPath, moduleVarNode, addExportStatement) {
	let declarationNode = statementPath.node.declaration;

	// Wrap arrow function in `{default: ...}.default` to maintain function name
	if (t.isArrowFunctionExpression(declarationNode)) {
		declarationNode = wrapInDefaultObject(declarationNode);
	}

	const keyNode = t.identifier('default');
	statementPath.replaceWith(
		createAssignmentStatement(moduleVarNode, keyNode, declarationNode)
	);

	addExportStatement(keyNode, undefined, true);
}

function transformExportVarDeclaration(statementPath, moduleVarNode, moduleVars, addExportStatement) {
	const declarationPath = statementPath.get('declaration'),
		declarationNode = declarationPath.node,
		declarationNodes = declarationNode.declarations,
		idNodes = [];
	for (let index = 0; index < declarationNodes.length; index++) {
		const sectionPath = declarationPath.get(`declarations.${index}.id`);
		if (sectionPath.isIdentifier()) {
			idNodes.push(sectionPath.node);
		} else {
			sectionPath.traverse({
				Identifier(identifierPath) {
					if (identifierIsVariable(identifierPath)) idNodes.push(identifierPath.node);
				}
			});
		}
	}

	statementPath.replaceWithMultiple([
		declarationNode,
		...idNodes.map((idNode) => {
			addExportStatement(idNode);

			const {name} = idNode;
			moduleVars.set(name, {key: name, moduleVarNode, isExport: true});

			flagAsInternal(idNode);
			return createAssignmentStatement(moduleVarNode, idNode, idNode);
		})
	]);
}

function transformExportVars(statementPath, moduleVarNode, moduleVars, addExportStatement) {
	statementPath.replaceWithMultiple(
		statementPath.node.specifiers.map((specifierNode) => {
			assert(t.isExportSpecifier(specifierNode));

			const {exported: keyNode, local: valueNode} = specifierNode;
			addExportStatement(keyNode);

			moduleVars.set(valueNode.name, {key: keyNode.name, moduleVarNode, isExport: true});

			flagAsInternal(valueNode);
			return createAssignmentStatement(moduleVarNode, keyNode, valueNode);
		})
	);
}

function createAssignmentStatement(moduleVarNode, keyNode, valueNode) {
	return t.expressionStatement(
		t.assignmentExpression(
			'=',
			t.memberExpression(moduleVarNode, keyNode),
			valueNode
		)
	);
}

function wrapInDefaultObject(node) {
	// `{default: ...}.default`
	return t.memberExpression(
		t.objectExpression([
			t.objectProperty(t.identifier('default'), node)
		]),
		t.identifier('default')
	);
}

function wrapInBlockIfReservedVars(programPath, state) {
	if (!state[IS_ESM]) return;

	// If uses CommonJS vars or other vars used in headers at top level, wrap whole program in block
	const {bindings} = programPath.scope;
	if ([...COMMON_JS_VAR_NAMES, 'global', 'Object'].some(varName => bindings[varName])) {
		programPath.node.body = [t.blockStatement(programPath.node.body)];
	}
}

function getEsmHeaders(state) {
	return [
		getImportHeader(state),
		...getExportsHeaders(state),
		getGlobalHeader(state)
	].filter(node => node !== null);
}

function getImportHeader(state) {
	// `importAsync` var is needed if `eval()` is used, as eval could contain dynamic `import()`.
	const importVarNode = state[IMPORT_VAR_NODE],
		importAsyncVarNode = state[EVAL_IS_USED]
			? getOrCreateImportAsyncVarNode(state)
			: state[IMPORT_ASYNC_VAR_NODE];
	if (!importVarNode && !importAsyncVarNode) return null;

	// eslint-disable-next-line max-len
	// `const [livepack_import, livpack_importAsync] = require('/path/to/app/node_modules/livepack/lib/init/import.js')(__dirname);`
	return t.variableDeclaration(
		'const', [
			t.variableDeclarator(
				t.arrayPattern([
					importVarNode || null,
					...(importAsyncVarNode ? [importAsyncVarNode] : [])
				]),
				t.callExpression(
					t.callExpression(internalIdentifier('require'), [t.stringLiteral(IMPORT_PATH)]),
					[t.identifier('__dirname')]
				)
			)
		]
	);
}

function getExportsHeaders(state) {
	const exportsVarNode = state[EXPORTS_VAR_NODE];
	if (!exportsVarNode) return [];

	return [
		// `const livepack_exports = exports;`
		t.variableDeclaration('const', [
			t.variableDeclarator(
				exportsVarNode,
				t.identifier('exports')
			)
		]),
		// `Object.defineProperties(livepack_exports, {__esModule: {value: true}});`
		t.expressionStatement(
			t.callExpression(
				t.memberExpression(t.identifier('Object'), t.identifier('defineProperties')),
				[
					exportsVarNode,
					t.stringLiteral('__esModule'),
					t.objectExpression([t.objectProperty(t.identifier('value'), t.booleanLiteral(true))])
				]
			)
		)
	];
}

function getGlobalHeader(state) {
	const globalVarNode = state[GLOBAL_VAR_NODE];
	if (!globalVarNode) return null;

	return t.variableDeclaration('const', [
		// `const livepack_global = global;`
		t.variableDeclarator(globalVarNode, t.identifier('global'))
	]);
}

// Code copied from @babel/helper-module-transforms
function addStrictModeDeclaration(path) {
	const hasStrict = path.node.directives.some(directive => directive.value.value === 'use strict');
	if (hasStrict) return;

	path.unshiftContainer(
		'directives',
		t.directive(t.directiveLiteral('use strict'))
	);
}
