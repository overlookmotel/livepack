/* --------------------
 * livepack module
 * Babel plugin
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Constants
const TRACKER_PATH = 'livepack/tracker',
	TRACKER_VAR_NAME = Symbol('livepack.TRACKER_VAR_NAME'),
	SCOPE_BASE_VAR_NAME = Symbol('livepack.SCOPE_BASE_VAR_NAME'),
	SCOPE_VAR_NAME = Symbol('livepack.SCOPE_VAR_NAME');

// Exports

let nextFunctionId = 0;

/**
 * Babel plugin.
 * Adds tracking code to all functions.
 *
 * Every function gets a unique ID.
 * In addition, every time a function is called, it gets a unique scope ID.
 * The scope ID represents the scope of function for that call.
 * If a function returns (or saves in an external var) another function, that function
 * will inherit the scope of this function.
 * Scope IDs track this, so it's possible to determine value of vars outside scope of a function.
 *
 * When any function is called, it calls `tracker.track()` with the values of vars in scope
 * of it's enclosing function, the scope ID, and parent scope's scope ID.
 *
 * @returns {Object} - Babel plugin object
 */
module.exports = function livepackBabelPlugin(api, options) {
	// Get tracker require path
	let {trackerPath} = options;
	if (!trackerPath) trackerPath = TRACKER_PATH;

	// Return visitors
	return {
		visitor: {
			Program(path, state) {
				programVisitor(path, state, trackerPath);
			},
			Function(path, state) {
				functionVisitor(path, state);
			}
		}
	};
};

/**
 * Visitor to insert tracker import + scope var at top of file.
 * @param {Object} path - Babel path object
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function programVisitor(path, state, trackerPath) {
	// Get unique names for tracker and scope vars
	const trackerVarName = getTrackerVarName(path, trackerPath);
	const scopeBaseVarName = getScopeVarName(path);
	state[TRACKER_VAR_NAME] = trackerVarName;
	state[SCOPE_BASE_VAR_NAME] = scopeBaseVarName;

	// Get var name for scope + record on node
	const id = nextFunctionId++;
	const scopeVarName = `${scopeBaseVarName}${id}`;
	path.node[SCOPE_VAR_NAME] = scopeVarName;

	// Insert tracker import + scope var at top of file
	path.get('body.0').insertBefore([
		// `const tracker = require('livepack/tracker');`
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					t.identifier(trackerVarName),
					t.callExpression(t.identifier('require'), [t.stringLiteral(trackerPath)])
				)
			]
		),
		// `const scope_0 = {};`
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					t.identifier(scopeVarName),
					t.objectExpression([])
				)
			]
		)
	]);
}

/**
 * Visitor to insert tracking code at start of every function.
 * Tracking code calls `tracker()` with details of the call.
 *
 * @param {Object} path - Babel path object
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function functionVisitor(fnPath, state) {
	// Get var name for scope + record on node
	const id = nextFunctionId++;
	const scopeVarName = `${state[SCOPE_BASE_VAR_NAME]}${id}`;
	const {node} = fnPath;
	node[SCOPE_VAR_NAME] = scopeVarName;

	// Find parent function
	const parentScopePath = fnPath.findParent(path => path.isFunction() || path.isProgram());
	const parentScopeVarName = parentScopePath.node[SCOPE_VAR_NAME];

	// Find variables in use in this function which derive from parent function's scope
	// (or file scope if is a top-level function)
	const vars = [];
	fnPath.traverse({
		Function(path) {
			path.stop();
		},
		Identifier(identifierPath) {
			if (!identifierPath.isReferencedIdentifier()) return;
			const {name} = identifierPath.node;
			const binding = identifierPath.scope.getBinding(name);
			if (!binding) return;

			const bindingScopePath = binding.path.findParent(path => path.isFunction() || path.isProgram());
			if (bindingScopePath !== parentScopePath) return;

			vars.push(name);
		}
	});

	/*
	 * Insert tracking code.
	 * e.g. for a function:
	 *   - using vars `a` and `b` from scope above
	 *   - with ID 200
	 *   - parent function ID 199
	 *
	 * ```
	 * const scope_200 = { parent: scope_199, parentValues: {a, b} };
	 * if (tracker.track) tracker.track( 200, scope_200 );
	 * ```
	 *
	 * TODO Handle arrow functions without a statement block (e.g. `x => x`)
	 * TODO Check works with async functions + generators
	 */
	const trackerVarName = state[TRACKER_VAR_NAME];
	fnPath.get('body.body.0').insertBefore([
		// `const scope_200 = { fnId: 200, parent: scope_199, parentValues: {a, b} };`
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					t.identifier(scopeVarName),
					t.objectExpression([
						t.objectProperty(t.identifier('parent'), t.identifier(parentScopeVarName)),
						t.objectProperty(
							t.identifier('parentValues'),
							t.objectExpression(
								vars.map(
									name => t.objectProperty(t.identifier(name), t.identifier(name), false, true)
								)
							)
						)
					])
				)
			]
		),
		// `if (tracker.track) tracker.track( 200, scope_200 );`
		t.ifStatement(
			t.memberExpression(
				t.identifier(trackerVarName),
				t.identifier('track')
			),
			t.returnStatement(
				t.callExpression(
					t.memberExpression(
						t.identifier(trackerVarName),
						t.identifier('track')
					),
					[
						t.numericLiteral(id),
						t.identifier(scopeVarName)
					]
				)
			)
		)
	]);
}

/**
 * Get unique var name for tracker import.
 * Will return 'tracker' is that var is not used anywhere in file.
 * Otherwise, selects the first var name with digits suffix e.g. 'tracker2'.
 *
 * @param {Object} path - Babel path object for file
 * @returns {string} - Var name
 */
function getTrackerVarName(path) {
	const usedNums = [];
	path.traverse({
		Identifier(identifierPath) {
			const match = identifierPath.node.name.match(/^tracker([1-9]\d*)?$/);
			if (match) usedNums.push(match[1] * 1 || 0);
		}
	});

	usedNums.sort();
	let lastNum = -1;
	for (const usedNum of usedNums) {
		if (usedNum > lastNum + 1) break;
		lastNum = usedNum;
	}

	return `tracker${(lastNum + 1) || ''}`;
}

/**
 * Get unique base var name for scope vars.
 * Will return 'scope_' if no vars called 'scope_<digits>' in file.
 * Otherwise adds digits before the '_' to ensure unique e.g. 'scope2_'.
 *
 * @param {Object} path - Babel path object for file
 * @returns {string} - Base var name
 */
function getScopeVarName(path) {
	const usedNums = [];
	path.traverse({
		Identifier(identifierPath) {
			const match = identifierPath.node.name.match(/^scope(\d*)?_\d+$/);
			if (match) usedNums.push(match[1] * 1 || 0);
		}
	});

	usedNums.sort();
	let lastNum = -1;
	for (const usedNum of usedNums) {
		if (usedNum > lastNum + 1) break;
		lastNum = usedNum;
	}

	return `scope${(lastNum + 1) || ''}_`;
}

/*
function debugPath(name, path) { // eslint-disable-line no-unused-vars
	path = {...path};
	for (const key of [
		'parent', 'parentPath', 'scope', 'container', 'context', 'opts', 'contexts', 'hub'
	]) {
		delete path[key];
	}
	console.log(`${name}:`, path); // eslint-disable-line no-console
}
*/
