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

const functionToString = Function.prototype.toString;

module.exports = {
	serializeFunction(fn) {
		// Get function code
		const js = functionToString.call(fn);
		const isClass = /^class\s*[^(*]/.test(js);

		// Call function
		let fnId, scopeVars, argNames;
		tracker.callback = (_fnId, _scopeVars, _argNames) => {
			fnId = _fnId;
			scopeVars = _scopeVars;
			argNames = _argNames;
		};

		if (isClass) {
			try {
				new fn(); // eslint-disable-line no-new, new-cap
			} catch (err) {
				// `new fn()` will throw if it's a class which extends another class
				// due to tracker code causing return before `super()` is called
				if (err.message !== "Must call super constructor in derived class before accessing 'this' or returning from derived constructor") throw err;
			}
		} else {
			// TODO If returns generator object, call `.next()` on generator
			fn();
		}

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
			node = parseFunction(fn, js, isClass);

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

function parseFunction(fn, js, isClass) {
	// Parse - either as function expression, or class method
	// NB Cannot use `parseExpression()` as then `traverse()` errors on removing nodes
	const isMethod = isClass ? false : jsIsMethod(js);
	const ast = parse(isMethod ? `(class {${js}});` : `(${js});`);

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

	// Convert methods to functions, reduce classes to just constructor, and set name
	const fnName = fn.name;
	const idNode = fnName ? t.identifier(fnName) : null;

	if (isMethod) {
		// Class/object method - convert to function expression
		// TODO Deal with `super`
		// NB A class method called `function` will be parsed as a function so will result in
		// `isMethod` being false
		node = node.body.body[0];
		assert(
			node.type === 'ClassMethod' || node.type === 'ObjectMethod',
			`Unexpected class method node type '${node.type}'`
		);
		node = t.functionExpression(idNode, node.params, node.body, node.generator, node.async);
	} else {
		if (isClass) {
			// Class - remove all methods except constructor
			assert(node.type === 'ClassExpression', `Unexpected class node type ${node.type}`);

			node.body.body = node.body.body.filter(
				methodNode => methodNode.type === 'ClassMethod'
					&& methodNode.key.type === 'Identifier'
					&& methodNode.key.name === 'constructor'
					&& !methodNode.static
			);

			// TODO Deal with `extends`
			node.superClass = null;
		}

		// Set function name
		node.id = idNode;
	}

	// Return node for function
	return node;
}

function jsIsMethod(js) {
	if (/^static\s/.test(js)) return true;
	if (/^[[*]/.test(js)) return true;

	const match = js.match(/^async\s+([[(*])?/);
	if (match) {
		if (match[1]) return true;
		js = js.slice(match[0].length);
	}

	// NB Could get false negative here in case of a method called 'function'
	// e.g. `class { function() {} }`
	if (/^function[\s(*]/.test(js)) return false;

	return true;
}
