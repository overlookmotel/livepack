/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default;

// Imports
const tracker = require('../tracker.js');

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

		// Check if function already parsed
		let node;
		const {functions, scopes} = this;
		const existingFn = functions.get(fnId);
		if (existingFn) {
			node = this.records.get(existingFn).node;
		} else {
			functions.set(fnId, fn);
		}

		// Record scope values
		let parentScopeId = null;
		const fnScopeVars = scopeVars.map(([scopeId, values, blockId]) => {
			let scope = scopes.get(scopeId);
			if (!scope) {
				scope = {id: scopeId, values: {}, blockId, parentScopeId, argNames: undefined};
				scopes.set(scopeId, scope);
			}

			const scopeValues = scope.values;
			const varNames = Object.keys(values);
			for (const varName of varNames) {
				if (!(varName in scopeValues)) scopeValues[varName] = this.serializeValue(values[varName]);
			}

			if (values.arguments) scope.argNames = argNames;

			parentScopeId = scopeId;

			return {scopeId, varNames};
		});

		// If function not already parsed, parse it, and record as located in scope
		if (!node) {
			// Parse to AST and remove tracker code
			node = parseFunction(fn);

			// Convert function declarations to expressions
			if (node.type === 'FunctionDeclaration') node.type = 'FunctionExpression';
		}

		return {node, fnId, scopeVars: fnScopeVars};
	}
};

const functionToString = Function.prototype.toString;

function parseFunction(fn) {
	// Get function code
	const js = functionToString.call(fn);

	// Parse - either as function expression, or class method
	// NB Cannot use `parseExpression()` as then `traverse()` errors on removing nodes
	let ast, isMethod;
	try {
		ast = parse(`(${js});`);
		isMethod = false;
	} catch (err) {
		ast = parse(`(class {${js}});`);
		isMethod = true;
	}

	// Remove tracker code
	traverse(ast, {
		Function(path) {
			const bodyPath = path.get('body');
			bodyPath.get('body.0').remove();
			bodyPath.get('body.0').remove();
		},
		BlockStatement(path) {
			// TODO It's theoretically possible (but very unlikely)
			// this could mis-identify user code and remove it. Fix!
			if (path.parentPath.isFunction()) return;
			const firstStatementPath = path.get('body.0');
			if (!firstStatementPath || !firstStatementPath.isVariableDeclaration()) return;
			const declarationsPath = firstStatementPath.get('declarations');
			if (declarationsPath.length !== 1) return;
			const declarationPath = declarationsPath[0];
			if (!declarationPath || !declarationPath.isVariableDeclarator()) return;
			const identifierPath = declarationPath.get('id');
			if (!identifierPath.isIdentifier()) return;
			if (!identifierPath.node.name.match(/^scopeId\d*_\d+$/)) return;
			const initPath = declarationPath.get('init');
			if (!initPath || !initPath.isCallExpression()) return;
			const calleePath = initPath.get('callee');
			if (!calleePath || !calleePath.isIdentifier()) return;
			if (!calleePath.node.name.match(/^tracker\d*$/)) return;

			firstStatementPath.remove();
		}
	});

	// Return node for function
	let node = ast.program.body[0].expression;
	if (isMethod) {
		node = node.body.body[0];
		assert(node.type === 'ClassMethod', `Unexpected class method node type '${node.type}'`);
	}
	return node;
}
