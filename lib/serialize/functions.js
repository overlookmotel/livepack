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
const tracker = require('../tracker.js'),
	Circular = require('./circular.js'),
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
		assert(infoStr, `Function was not tracked: ${js}`);

		const {id: fnId, scopes: scopeDefs, isMethod} = JSON.parse(infoStr);

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

		// Record scope values
		const {blocks, scopes} = this;
		let previousBlock = this.topBlock;
		let previousScope = this.topScope;
		for (let i = 0; i < scopeDefs.length; i++) {
			const {blockId, varNames, argNames} = scopeDefs[i],
				[scopeId, ...values] = scopeVars[i];

			// Get/create block
			let block = blocks.get(blockId);
			if (!block) {
				block = this.createBlock(blockId);
				previousBlock.children.push(block);
			}

			// Get/create scope
			let scope = scopes.get(scopeId);
			if (!scope) scope = this.createScope(scopeId, block, previousScope);

			// Add values to scope
			const {params, circularParams} = block;
			const {values: scopeValues} = scope;
			for (let j = 0; j < varNames.length; j++) {
				const varName = varNames[j];

				if (!(varName in scopeValues)) {
					const val = values[j];
					let node = this.serializeValue(val);
					let isCircular = false;
					if (node instanceof Circular) {
						node = node.node;
						isCircular = true;
						if (!circularParams.includes(varName)) circularParams.push(varName);
					}
					scopeValues[varName] = {val, node, isCircular};
					if (!params.includes(varName)) {
						params.push(varName);
						if (varName === 'arguments' && !block.argNames) block.argNames = argNames;
					}
				}
			}

			if (argNames && !block.argNames) block.argNames = argNames;

			previousBlock = block;
			previousScope = scope;
		}

		// Create function record
		const {functions} = this;
		let functionDef = functions.get(fnId);
		if (!functionDef) {
			// Parse function code to AST and remove tracker code
			const fnNode = parseFunction(fn, js, isClass, isMethod);

			functionDef = {id: fnId, node: fnNode, scopes: new Map(), hasDuplicateScopes: false};
			functions.set(fnId, functionDef);

			previousBlock.functions.push(functionDef);
		}

		// Record function instance
		const functionScopes = functionDef.scopes;
		const functionValues = functionScopes.get(previousScope);
		if (functionValues) {
			functionValues.push(fn);
			functionDef.hasDuplicateScopes = true;
		} else {
			functionScopes.set(previousScope, [fn]);
		}

		return {fnId}; // TODO Is it neccesary to return `fnId`?
	},

	createBlock(id) {
		const block = {
			id, children: [], functions: [], scopes: [], params: [], circularParams: [], argNames: undefined
		};
		this.blocks.set(id, block);
		return block;
	},

	createScope(id, block, parentScope) {
		const scope = {id, values: {}, parentScope, record: undefined};

		const record = this.createRecord(scope, t.identifier(`scope${id}`)); // TODO Change name to 'x'
		record.dependencies = [];
		scope.record = record;

		this.scopes.set(id, scope);
		block.scopes.push(scope);
		return scope;
	}
};

function parseFunction(fn, js, isClass, isMethod) {
	// Parse - either as function expression, or class method
	// NB Cannot use `parseExpression()` as then `traverse()` errors on removing nodes
	const ast = parse(isMethod ? `(class {${js}});` : `(${js});`);

	// Remove tracker code
	traverse(ast, {
		Function(path) {
			const bodyPath = path.get('body');
			let firstStatementPath = bodyPath.get('body.0');
			firstStatementPath.node.leadingComments.shift();
			firstStatementPath.remove();
			bodyPath.get('body.0').remove();

			// Convert `x => { return x; }` to `x => x`
			if (path.isArrowFunctionExpression()) {
				firstStatementPath = bodyPath.get('body.0');
				if (firstStatementPath.isReturnStatement()) {
					const {argument} = firstStatementPath.node;
					if (argument !== null) bodyPath.replaceWith(argument);
				}
			}
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
