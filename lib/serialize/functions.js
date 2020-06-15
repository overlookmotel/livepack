/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	{last} = require('lodash'),
	t = require('@babel/types');

// Imports
const tracker = require('../tracker.js'),
	{TRACKER_COMMENT_PREFIX} = require('../shared.js');

// Exports

const functionToString = Function.prototype.toString,
	objectToString = Object.prototype.toString;

const trackerCommentRegex = new RegExp(`/\\*${TRACKER_COMMENT_PREFIX}(\\{.+?\\})\\*/`);

module.exports = {
	serializeFunction(fn) {
		// Get function code + determine type
		const js = functionToString.call(fn);
		const isClass = /^class\s*[^(*]/.test(js);
		const isGenerator = !isClass && fnIsGenerator(fn);

		// Get info from tracker comment
		// TODO For classes, make sure get comment from constructor
		// - constructor not necessarily first in class definition
		const [, infoStr] = js.match(trackerCommentRegex) || [];
		assert(infoStr, 'Function was not tracked');

		const {id: fnId, blockIds, scopes: scopeDefs, isMethod} = JSON.parse(infoStr);

		// Call function (unless no scope to extract)
		let scopeVars;
		if (scopeDefs.length > 0) {
			tracker.setCallback((_scopeVars) => {
				scopeVars = _scopeVars;
			});

			if (isClass) {
				try {
					new fn(); // eslint-disable-line no-new, new-cap
				} catch (err) {
					// `new fn()` will throw if class extends another class
					// due to tracker code causing return before `super()` is called.
					if (err.message !== "Must call super constructor in derived class before accessing 'this' or returning from derived constructor") throw err;
				}
			} else {
				const res = fn();
				// Generator functions return generator object, rather than executing function immediately.
				// Call `.next()` to execute function code.
				if (isGenerator) res.next();
			}
		} else {
			scopeVars = [];
		}

		// Create blocks
		const {blocks} = this;
		let previousBlockChildren = this.topBlocks;
		for (const blockId of blockIds) {
			let block = blocks.get(blockId);
			if (!block) {
				block = {
					id: blockId, children: [], functions: [], scopes: [], params: [], argNames: undefined
				};
				blocks.set(blockId, block);
				previousBlockChildren.push(block);
			}
			previousBlockChildren = block.children;
		}

		// Create function record
		const {functions} = this;
		let functionRecord = functions.get(fnId);
		const existingFunctionRecord = !!functionRecord;
		if (!existingFunctionRecord) {
			// Parse function code to AST and remove tracker code
			const fnNode = parseFunction(fn, js, isClass, isMethod);

			functionRecord = {id: fnId, node: fnNode, values: []};
			functions.set(fnId, functionRecord);

			blocks.get(last(blockIds)).functions.push(functionRecord);
		}
		functionRecord.values.push(fn);

		// Record scope values
		const {scopes} = this;
		for (let i = 0; i < scopeDefs.length; i++) {
			const {blockId, varNames, argNames} = scopeDefs[i],
				[scopeId, ...values] = scopeVars[i];

			const block = blocks.get(blockId);
			let scope = scopes.get(scopeId);
			if (!scope) {
				scope = {id: scopeId, values: {}};
				scopes.set(scopeId, scope);
				block.scopes.push(scope);
			}

			const {params} = block;
			const scopeValues = scope.values;
			for (let j = 0; j < varNames.length; j++) {
				const varName = varNames[j];

				if (!(varName in scopeValues)) {
					scopeValues[varName] = this.serializeValue(values[j]);
					if (!params.includes(varName)) {
						params.push(varName);
						if (varName === 'arguments' && !block.argNames) block.argNames = argNames;
					}
				}
			}

			if (argNames && !block.argNames) block.argNames = argNames;
		}

		return {fnId};
	}

	/*
	createScope(id, block, parentScope) {
		const record = this.createRecord({}, t.identifier(`scope${id}`)); // TODO Change to 'x'
		const scope = {id, record, values: {}, block, parentScope};
		this.scopes.set(id, scope);
		block.scopes.push(scope);
		return scope;
	}
	*/
};

function parseFunction(fn, js, isClass, isMethod) {
	// Parse - either as function expression, or class method
	// NB Cannot use `parseExpression()` as then `traverse()` errors on removing nodes
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

function fnIsGenerator(fn) {
	const typeStr = objectToString.call(fn);
	return typeStr === '[object GeneratorFunction]' || typeStr === '[object AsyncGeneratorFunction]';
}
