/* --------------------
 * livepack module
 * Babel plugin
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const tracker = require('./tracker.js');

// Constants
const TRACKER_VAR_NAME = Symbol('livepack.TRACKER_VAR_NAME'),
	INVOCATION_ID_BASE_VAR_NAME = Symbol('livepack.INVOCATION_ID_BASE_VAR_NAME'),
	INVOCATION_ID_VAR_NAME = Symbol('livepack.INVOCATION_ID_VAR_NAME');

// TODO Set this back to 'livepack/tracker' after local testing
// const TRACKER_REQUIRE_PATH = 'livepack/tracker';
// eslint-disable-next-line import/order
const TRACKER_REQUIRE_PATH = require('path').join(__dirname, '../tracker.js');

// Exports

/**
 * Babel plugin.
 * Adds tracking code to all functions.
 *
 * Every function gets a unique ID.
 * In addition, every time a function is called, it gets a unique invocation ID.
 * The invocation ID represents the scope of function for that call.
 * If a function returns (or saves in an external var) another function, that function
 * will inherit the scope of this function.
 * Invocation IDs track this, so it's possible to determine value of vars outside scope of a function.
 *
 * When any function is called, it calls `tracker()` with the values of vars in scope
 * of it's enclosing function, the invocation ID, and parent scope's invocation ID.
 *
 * @returns {Object} - Babel plugin object
 */
module.exports = function livepackBabelPlugin() {
	return {
		visitor: {
			Program(path, state) {
				programVisitor(path, state);
			},
			Function(path, state) {
				functionVisitor(path, state);
			}
		}
	};
};

/**
 * Visitor to insert `const tracker = require('livepack/tracker');` statement at top of file.
 * @param {Object} path - Babel path object
 * @param {Object} state - Babel state object for file
 * @returns {undefined}
 */
function programVisitor(path, state) {
	const trackerVarName = getTrackerVarName(path);
	const invocationIdBaseVarName = getInvocationIdVarName(path);

	path.get('body.0').insertBefore(
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					t.identifier(trackerVarName),
					t.callExpression(t.identifier('require'), [t.stringLiteral(TRACKER_REQUIRE_PATH)])
				)
			]
		)
	);

	state[TRACKER_VAR_NAME] = trackerVarName;
	state[INVOCATION_ID_BASE_VAR_NAME] = invocationIdBaseVarName;
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
	const {node} = fnPath;

	// Record function's AST
	const {fns} = tracker;
	const id = fns.length;
	fns[id] = node;

	// Get var name for invocationId + record on node
	const invocationVarName = `${state[INVOCATION_ID_BASE_VAR_NAME]}${id}`;
	node[INVOCATION_ID_VAR_NAME] = invocationVarName;

	// Find parent function
	const parentFnPath = fnPath.findParent(path => path.isFunction());

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

			if (parentFnPath) {
				const bindingFnPath = binding.path.findParent(path => path.isFunction());
				if (bindingFnPath !== parentFnPath) return;
			}

			vars.push(name);
		}
	});

	/*
	 * Insert tracking code
	 * e.g. for a function:
	 *   - using vars `a` and `b` from scope above
	 *   - with ID 123
	 *   - parent function ID 122
	 *
	 * `const invocationId_123 = tracker( {a, b}, 123, invocationId_122 );`
	 *
	 * TODO Handle arrow functions without a statement block (e.g. `x => x`)
	 * TODO Check works with async functions + generators
	 */
	fnPath.get('body.body.0').insertBefore(
		t.variableDeclaration(
			'const', [
				t.variableDeclarator(
					t.identifier(invocationVarName),
					t.callExpression(
						t.identifier(state[TRACKER_VAR_NAME]),
						[
							t.objectExpression(
								vars.map(
									name => t.objectProperty(t.identifier(name), t.identifier(name), false, true)
								)
							),
							t.numericLiteral(id),
							...(parentFnPath ? [t.identifier(parentFnPath.node[INVOCATION_ID_VAR_NAME])] : [])
						]
					)
				)
			]
		)
	);
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
 * Get unique base var name for invocation vars.
 * Will return 'invocationId_' if no vars called 'invocationId_<digits>' in file.
 * Otherwise adds digits before the '_' to ensure unique e.g. 'invocationId2_'.
 *
 * @param {Object} path - Babel path object for file
 * @returns {string} - Base var name
 */
function getInvocationIdVarName(path) {
	const usedNums = [];
	path.traverse({
		Identifier(identifierPath) {
			const match = identifierPath.node.name.match(/^invocationId([1-9]\d*)?_\d+$/);
			if (match) usedNums.push(match[1] * 1 || 0);
		}
	});

	usedNums.sort();
	let lastNum = -1;
	for (const usedNum of usedNums) {
		if (usedNum > lastNum + 1) break;
		lastNum = usedNum;
	}

	return `invocationId${(lastNum + 1) || ''}_`;
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
