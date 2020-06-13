/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	t = require('@babel/types');

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

		// Record scope values
		let previousScopeBlock;
		const {scopes} = this;
		const fnScopeVars = scopeVars.map(([scopeId, values, blockId]) => {
			let scope = scopes.get(scopeId);
			if (!scope) {
				scope = {id: scopeId, values: {}, blockId, argNames: undefined};
				scopes.set(scopeId, scope);
			}

			const scopeBlock = this.getOrCreateBlock(blockId);
			if (previousScopeBlock) {
				const previousChildren = previousScopeBlock.children;
				if (!previousChildren.includes(scopeBlock)) previousChildren.push(scopeBlock);
			}

			const scopeValues = scope.values;
			const varNames = Object.keys(values);
			for (const varName of varNames) {
				if (!(varName in scopeValues)) scopeValues[varName] = this.serializeValue(values[varName]);
			}

			if (values.arguments) scopeBlock.argNames = argNames;

			previousScopeBlock = scopeBlock;

			return {scopeId, varNames};
		});

		// Create block for function + add a child of closest scope block
		const block = this.getOrCreateBlock(fnId);
		const scopedChildren = previousScopeBlock ? previousScopeBlock.children : this.unscopedFunctions;
		if (!scopedChildren.includes(block)) scopedChildren.push(block);

		// If function not already parsed, parse it, and record as located in scope
		let {node} = block;
		if (!node) {
			// Parse to AST and remove tracker code
			node = parseFunction(fn);

			// Record on block
			block.node = node;
		}

		return {node, fnId, scopeVars: fnScopeVars};
	},

	getOrCreateBlock(blockId) {
		const {blocks} = this;
		let block = blocks.get(blockId);
		if (!block) {
			block = {id: blockId, children: [], node: undefined, argNames: undefined};
			blocks.set(blockId, block);
		}
		return block;
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

	// Extract function node from AST
	let node = ast.program.body[0].expression;

	// Convert to function expression and set name
	const fnName = fn.name;
	const idNode = fnName ? t.identifier(fnName) : null;

	if (isMethod) {
		// Class/object method - convert to function expression
		// TODO Deal with `super`
		node = node.body.body[0];
		assert(
			node.type === 'ClassMethod' || node.type === 'ObjectMethod',
			`Unexpected class method node type '${node.type}'`
		);
		node = t.functionExpression(idNode, node.params, node.body, node.generator, node.async);
	} else {
		// Set function name
		node.id = idNode;
	}

	// Return node for function
	return node;
}
