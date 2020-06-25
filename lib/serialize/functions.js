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
	{identifierIsVariable, TRACKER_COMMENT_PREFIX} = require('../shared.js'),
	{createArguments} = require('./external.js');

// Exports

const functionToString = Function.prototype.toString,
	objectToString = Object.prototype.toString,
	arraySlice = Array.prototype.slice;

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
		let block = this.rootBlock,
			scope = this.rootScope;
		for (let i = 0; i < scopeDefs.length; i++) {
			const {blockId, varNames, argNames} = scopeDefs[i],
				[scopeId, ...values] = scopeVars[i];

			const parentBlock = block,
				parentScope = scope;

			// Get/create block
			block = blocks.get(blockId);
			if (!block) {
				block = this.createBlock(blockId);
				parentBlock.children.push(block);
			}

			// Get/create scope
			scope = scopes.get(scopeId);
			if (!scope) scope = this.createScope(scopeId, block, parentScope);

			// Add values to scope
			const {params} = block;
			const {values: scopeValues} = scope;
			for (let j = 0; j < varNames.length; j++) {
				const varName = varNames[j];

				if (!(varName in scopeValues)) {
					const val = values[j];
					let node = this.serializeValue(val, varName);
					const isCircular = node instanceof Circular;
					if (isCircular) node = node.node;
					scopeValues[varName] = {val, node, isCircular};
					if (!params.includes(varName)) {
						params.push(varName);
						if (varName === 'arguments' && !block.argNames) block.argNames = argNames;
					}
				}
			}

			if (argNames && !block.argNames) block.argNames = argNames;
		}

		// Place function in block
		const {functions} = this;
		let fnDef = functions.get(fnId);
		let fnScopes;
		if (!fnDef) {
			// Function not encountered before.
			// Parse function code to AST and remove tracker code.
			const {node: fnNode, externalVars} = parseFunction(fn, js, isClass, isMethod);

			// Create function record
			fnScopes = new Map(); // Keyed by scope object, value of each is function instance
			fnDef = {id: fnId, node: fnNode, scopes: fnScopes, externalVars, virtualBlock: undefined};
			functions.set(fnId, fnDef);

			// Nest function in block
			block.functions.push(fnDef);
		} else {
			// Instance of function encountered before.
			fnScopes = fnDef.scopes;
			let {virtualBlock} = fnDef;
			if (fnScopes.has(scope)) {
				// Same function instantiated twice in same scope.
				// Create new virtual block to hold function.
				virtualBlock = this.createBlock(`fn${fnId}`);
				fnDef.virtualBlock = virtualBlock;

				block.children.push(virtualBlock);

				// Move function into new block
				virtualBlock.functions.push(fnDef);
				block.functions = block.functions.filter(thisFnDef => thisFnDef !== fnDef);

				// Move all previous instances into virtual scopes (one virtual scope for each parent scope)
				const oldFnScopes = fnScopes;
				fnScopes = new Map();
				for (const [instanceScope, instance] of oldFnScopes) {
					const virtualScope = this.createScope(null, virtualBlock, instanceScope);
					fnScopes.set(virtualScope, instance);
				}
				fnDef.scopes = fnScopes;
			}

			// If some scopes hold multiple instances of this function, use virtual block to hold scope
			if (virtualBlock) scope = this.createScope(null, virtualBlock, scope);
		}

		// Record this instance of function, along with scope
		fnScopes.set(scope, fn);

		return {node: null, scope};
	},

	serializeArguments(args, varNode) {
		// Serialize as array
		args = arraySlice.call(args);
		const {node: arrayNode, dependencies, assignments} = this.serializeArray(args, varNode, 'arguments');

		// Create call to `createArguments` function
		const createArgumentsNode = this.serializeValue(createArguments, 'createArguments');
		const node = t.callExpression(createArgumentsNode, arrayNode.elements);
		dependencies.push({val: createArguments, node, key: 'callee'});

		return {node, dependencies, ...(assignments ? {assignments} : null)};
	},

	createBlock(id) {
		const block = {id, children: [], functions: [], scopes: [], params: [], argNames: undefined};
		this.blocks.set(id, block);
		return block;
	},

	createScope(id, block, parentScope) {
		const scope = {id, values: {}, parentScope, record: undefined};

		const record = this.createRecord(scope, t.identifier(`scope${id}`));
		scope.record = record;

		if (id !== null) this.scopes.set(id, scope);
		block.scopes.push(scope);
		return scope;
	}
};

/**
 * Parse function code to AST and identify nodes referring to external variables.
 * @param {Function} fn - Function
 * @param {string} js - Javascript code for function
 * @param {boolean} isClass - `true` if is a class
 * @param {boolean} isMethod - `true` if is a method
 * @returns {Object}
 * @returns {Object} .node - AST node for function
 * @returns {Object} .externalVars - Object keyed by var name, values are arrays of identifier nodes
 */
function parseFunction(fn, js, isClass, isMethod) {
	// Parse - either as function expression, or class method
	// NB Cannot use `parseExpression()` as then `traverse()` errors on removing nodes
	const ast = parse(isMethod ? `(class {${js}});` : `(${js});`);

	// Remove tracker code + get nodes for external vars
	const externalVars = {};
	let topFunctionPath = null,
		enclosingFunctionPath = null;

	traverse(ast, {
		Function: {
			enter(path) {
				const bodyPath = path.get('body');

				// Remove tracker comment
				let firstStatementPath = bodyPath.get('body.0');
				firstStatementPath.node.leadingComments.shift();

				// Remove `const scopeId100 = tracker();` statement
				firstStatementPath.remove();

				// Remove `if (scopeId100 === null) return tracker(...);` statement
				firstStatementPath = bodyPath.get('body.0');

				const bodyNode = bodyPath.node,
					statements = bodyNode.body;
				if (statements.length === 1) {
					// Block will be left empty - preserve comments
					const {leadingComments} = firstStatementPath.node;
					if (leadingComments && leadingComments.length > 0) {
						const {innerComments} = bodyNode;
						if (innerComments) {
							innerComments.push(...leadingComments);
						} else {
							bodyNode.innerComments = leadingComments;
						}
					}
				}

				firstStatementPath.remove();

				// Convert `x => { return x; }` to `x => x`
				if (path.isArrowFunctionExpression()) {
					if (statements.length === 1) {
						firstStatementPath = bodyPath.get('body.0');
						if (firstStatementPath.isReturnStatement()) {
							const {argument} = firstStatementPath.node;
							if (argument !== null) bodyPath.replaceWith(argument);
						}
					}
				} else if (!enclosingFunctionPath) {
					// Entering a non-arrow function - occurences of `this` don't refer to upper scope
					enclosingFunctionPath = path;
				}

				if (!topFunctionPath) topFunctionPath = path;
			},
			exit(path) {
				if (path === enclosingFunctionPath) enclosingFunctionPath = null;
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
		},
		Identifier(path) {
			// Skip identifiers not used as vars e.g. `{a: 1}`
			if (!identifierIsVariable(path)) return;

			// Skip function's own name
			if (path.parentPath === topFunctionPath && path.key === 'id') return;

			// Skip if refers to internal var
			const idNode = path.node,
				{name} = idNode;
			if (path.scope.getBinding(name)) return;

			// Skip if is `arguments` and doesn't refer to `arguments` from a higher function
			if (name === 'arguments' && enclosingFunctionPath) return;

			// Add node to external vars
			addToExternals(name, idNode, externalVars);
		},
		ThisExpression(path) {
			// Add to external vars if `this` refers to `this` from a higher function
			if (!enclosingFunctionPath) addToExternals('this', path.node, externalVars);
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

	// Return AST for function + external vars object
	return {node, externalVars};
}

function addToExternals(name, node, externalVars) {
	const nodes = externalVars[name];
	if (nodes) {
		nodes.push(node);
	} else {
		externalVars[name] = [node];
	}
}

function fnIsGenerator(fn) {
	const typeStr = objectToString.call(fn);
	return typeStr === '[object GeneratorFunction]' || typeStr === '[object AsyncGeneratorFunction]';
}
