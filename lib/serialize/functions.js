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

const functionToString = Function.prototype.toString,
	objectToString = Object.prototype.toString;

module.exports = {
	serializeFunction(fn) {
		// Get function code + determine type
		const js = functionToString.call(fn);
		const isClass = /^class\s*[^(*]/.test(js);
		const isGenerator = !isClass && fnIsGenerator(fn);

		// Call function
		let fnId, scopeVars, argNames;
		tracker.callback = (_fnId, _scopeVars, _argNames) => {
			fnId = _fnId;
			scopeVars = _scopeVars;
			argNames = _argNames;
		};

		try {
			if (isClass) {
				new fn(); // eslint-disable-line no-new, new-cap
			} else {
				const res = fn();
				// Generator functions return generator object, rather than executing function immediately.
				// Call `.next()` to execute function code.
				if (isGenerator) res.next();
			}
		} catch (err) {
			// Ignore error - `assert()` below will throw if function wasn't tracked.
			// NB `new fn()` will throw if class extends another class
			// due to tracker code causing return before `super()` is called.
		}

		tracker.callback = undefined;

		assert(fnId !== undefined, 'Function was not tracked');

		// Create function record
		const {functions} = this;
		let functionRecord = functions.get(fnId);
		const existingFunctionRecord = !!functionRecord;
		if (!existingFunctionRecord) {
			// Parse function code to AST and remove tracker code
			const fnNode = parseFunction(fn, js, isClass);

			functionRecord = {id: fnId, node: fnNode, values: []};
			functions.set(fnId, functionRecord);
		}
		functionRecord.values.push(fn);

		// Record scope values
		let previousScope = this.globalScope,
			previousBlock = this.globalBlock;
		const {scopes, blocks} = this;
		for (const [scopeId, values, blockId] of scopeVars) {
			let block;
			let scope = scopes.get(scopeId);
			if (scope) {
				block = scope.block;
			} else {
				block = blocks.get(blockId);
				if (!block) block = this.createBlock(blockId);

				previousBlock.children.add(block);

				scope = this.createScope(scopeId, block, previousScope);
			}

			const {params} = block;
			const scopeValues = scope.values;
			const varNames = Object.keys(values);
			for (const varName of varNames) {
				if (!(varName in scopeValues)) {
					scopeValues[varName] = this.serializeValue(values[varName]);
					if (!params.includes(varName)) params.push(varName);
				}
			}

			if (values.arguments) block.argNames = argNames;

			previousScope = scope;
			previousBlock = block;

			return {scopeId, varNames};
		}

		// Add function to block
		if (!existingFunctionRecord) previousBlock.functions.push(functionRecord);

		return {fnId, scope: previousScope};
	},

	createBlock(id) {
		const record = this.createRecord({}, t.identifier(`createScope${id}`)); // TODO Change to 'x'
		const block = {
			id, record, children: new Set(), functions: [], scopes: [], params: [], argNames: undefined
		};
		this.blocks.set(id, block);
		return block;
	},

	createScope(id, block, parentScope) {
		const record = this.createRecord({}, t.identifier(`scope${id}`)); // TODO Change to 'x'
		const scope = {id, record, values: {}, block, parentScope};
		this.scopes.set(id, scope);
		block.scopes.push(scope);
		return scope;
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

function fnIsGenerator(fn) {
	const typeStr = objectToString.call(fn);
	return typeStr === '[object GeneratorFunction]' || typeStr === '[object AsyncGeneratorFunction]';
}
