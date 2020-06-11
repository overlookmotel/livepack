/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{isObject, isArray} = require('is-it-type');

// Imports
const tracker = require('../tracker.js'),
	{IS_INTERNAL} = require('../shared.js'),
	{functionAsts} = tracker;

// Exports

module.exports = {
	serializeFunction(fn) {
		// Call function
		let fnId, scopeVars, argNames;
		tracker.callback = (_fnId, _scopeVars, _argNames) => {
			fnId = _fnId;
			scopeVars = _scopeVars;
			argNames = _argNames;
		};
		// TODO If returns generator object, call `.next()` on generator
		fn();
		tracker.callback = undefined;

		assert(fnId !== undefined, 'Function was not tracked');

		// Get AST and remove tracker code
		const node = functionAsts[fnId];
		cleanAst(node);

		// Convert function declarations to expressions
		if (node.type === 'FunctionDeclaration') node.type = 'FunctionExpression';

		// Record scope values
		const {scopes} = this;
		const fnScopeVars = scopeVars.map(([scopeId, values]) => {
			let scope = scopes.get(scopeId);
			if (!scope) {
				scope = {id: scopeId, values: {}, argNames: undefined};
				scopes.set(scopeId, scope);
			}

			const scopeValues = scope.values;
			const varNames = Object.keys(values);
			for (const varName of varNames) {
				scopeValues[varName] = this.serializeValue(values[varName]);
			}

			if (values.arguments) scope.argNames = argNames;

			return {scopeId, varNames};
		});

		return {node, scopeVars: fnScopeVars};
	}
};

function cleanAst(node) {
	for (const key in node) {
		if (
			key === 'loc'
			|| key === 'trailingComments' || key === 'leadingComments' || key === 'innerComments'
		) continue;

		const value = node[key];
		if (isArray(value)) {
			node[key] = value.filter((childNode) => {
				if (childNode[IS_INTERNAL]) return false;
				if (isObject(childNode)) cleanAst(childNode);
				return true;
			});
		} else if (isObject(value)) {
			cleanAst(value);
		}
	}
}
