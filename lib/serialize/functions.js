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
	{boundFunctions} = require('../init.js'),
	{identifierIsVariable, TRACKER_COMMENT_PREFIX} = require('../shared.js'),
	{createFile, createBlock, createScope, createDependency} = require('./records.js'),
	{createUnmangledVarNameTransform} = require('./varNames.js'),
	{createArguments} = require('./external.js');

// Exports

const functionToString = Function.prototype.toString,
	objectToString = Object.prototype.toString,
	arraySlice = Array.prototype.slice;

const trackerCommentRegex = new RegExp(`/\\*${TRACKER_COMMENT_PREFIX}(\\{.+?\\})\\*/`);

module.exports = {
	serializeFunction(fn, record) {
		// Handle bound functions
		const binding = boundFunctions.get(fn);
		if (binding) return this.serializeBoundFunction(binding, record);

		// Get function code + determine type
		const js = functionToString.call(fn);
		const isClass = /^class\s*[^(*]/.test(js);
		const isGenerator = !isClass && fnIsGenerator(fn);

		// Get info from tracker comment
		// TODO For classes, make sure get comment from constructor
		// - constructor not necessarily first in class definition
		const [, infoStr] = js.match(trackerCommentRegex) || [];
		assert(infoStr, `Function was not tracked: ${js}`);

		const info = JSON.parse(infoStr);
		const {id: fnId, scopes: scopeDefs, isMethod} = info;
		const filename = info.filename || '';

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

		// Create file
		const {files} = this;
		const {blocks, functions} = files[filename] || createFile(filename, files);

		// Record scope values
		let block = this.rootBlock,
			scope = this.rootScope;
		for (let i = 0; i < scopeDefs.length; i++) {
			const {blockId, varNames, blockName, argNames} = scopeDefs[i],
				[scopeId, ...values] = scopeVars[i];

			const parentBlock = block,
				parentScope = scope;

			// Get/create block
			block = blocks.get(blockId);
			if (!block) block = createBlock(blockId, blockName || 'anon', parentBlock, blocks);

			// Get/create scope
			scope = block.scopes.get(scopeId);
			if (!scope) scope = createScope(scopeId, block, parentScope);

			// Add values to scope
			const {paramNames} = block;
			const {values: scopeValues} = scope;
			for (let j = 0; j < varNames.length; j++) {
				const varName = varNames[j];

				if (!(varName in scopeValues)) {
					const val = values[j];
					const valRecord = this.serializeValue(val, varName);
					scopeValues[varName] = {record: valRecord, isCircular: valRecord.node === undefined};
					paramNames.add(varName);
				}
			}

			if (argNames && !block.argNames) block.argNames = argNames;
		}

		// Place function in block
		let fnDef = functions.get(fnId);
		let fnScopes;
		if (!fnDef) {
			// Function not encountered before.
			// Parse function code to AST and remove tracker code.
			const {
				node: fnNode, externalVars, internalVars, functionNames
			} = parseFunction(fn, js, isClass, isMethod);

			// Create function record
			fnScopes = new Map(); // Keyed by scope object, value of each is function instance's record
			fnDef = {
				id: fnId,
				node: fnNode,
				scopes: fnScopes,
				externalVars,
				internalVars,
				functionNames,
				virtualBlock: undefined
			};
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
				virtualBlock = createBlock(null, fn.name || 'anonymous', block);
				fnDef.virtualBlock = virtualBlock;

				// Move function into new block
				virtualBlock.functions.push(fnDef);
				block.functions = block.functions.filter(thisFnDef => thisFnDef !== fnDef);

				// Move all previous instances into virtual scopes (one virtual scope for each parent scope)
				const oldFnScopes = fnScopes;
				fnScopes = new Map();
				for (const [instanceScope, instanceRecord] of oldFnScopes) {
					const virtualScope = createScope(null, virtualBlock, instanceScope);
					fnScopes.set(virtualScope, instanceRecord);
				}
				fnDef.scopes = fnScopes;
			}

			// If some scopes hold multiple instances of this function, use virtual block to hold scope
			if (virtualBlock) scope = createScope(null, virtualBlock, scope);
		}

		// Record this instance of function's record, along with scope
		fnScopes.set(scope, record);

		// Record scope on record
		record.scope = scope;

		// Return null as node - will be created later
		return null;
	},

	/**
	 * Serialize a bound function.
	 * If there are no circular vars, output `fn.bind(ctx, var0, var1)`.
	 * If there are circular vars, create a scope into which bound values can be injected.
	 *
	 * @param {Object} binding - Binding record
	 * @param {Object} record - Record for bound function instance
	 * @returns {null}
	 */
	serializeBoundFunction(binding, record) {
		// Serialize unbound function
		const fnVarName = record.varNode.name;

		const unboundFnRecord = this.serializeValue(binding.fn, `${fnVarName}Unbound`);
		const fnIsCircular = unboundFnRecord.node === undefined;

		// Serialize binding values
		let isCircular = fnIsCircular;
		const valRecords = binding.vars.map((val, index) => {
			const varName = `${fnVarName}${index === 0 ? 'BoundCtx' : `BoundValue${index - 1}`}`;
			const valRecord = this.serializeValue(val, varName);
			if (valRecord.node === undefined) isCircular = true;
			return valRecord;
		});

		// If no circular references, output `fn.bind(ctx, var0, var1)`
		if (!isCircular) {
			const bindNode = t.memberExpression(unboundFnRecord.varNode, t.identifier('bind'));
			createDependency(record, unboundFnRecord, bindNode, 'object');

			const args = [];
			valRecords.forEach((valRecord, index) => {
				createDependency(record, valRecord, args, index);
				args[index] = valRecord.varNode || valRecord.node;
			});

			return t.callExpression(bindNode, args);
		}

		// There are circular references - create scope into which vars can be injected later
		// Create block and scope
		const block = createBlock(null, `${fnVarName}Binding`, this.rootBlock);
		const scope = createScope(null, block, this.rootScope);

		// Create param for unbound function
		const {paramNames} = block;
		const {values: scopeValues} = scope;

		const varNameTransform = createUnmangledVarNameTransform(new Set());

		const fnParamName = varNameTransform(fnVarName);
		const fnParamNode = t.identifier(fnParamName);
		scopeValues[fnParamName] = {record: unboundFnRecord, isCircular: fnIsCircular};
		paramNames.add(fnParamName);

		const externalVars = {[fnParamName]: [fnParamNode]};

		// Create params for binding values
		const argumentNodes = valRecords.map((valRecord) => {
			// Add primitives to arguments directly
			if (!valRecord.varNode) return valRecord.node;

			const paramName = varNameTransform(valRecord.varNode.name);
			scopeValues[paramName] = {record: valRecord, isCircular: valRecord.node === undefined};
			paramNames.add(paramName);

			const argumentNode = t.identifier(paramName);
			externalVars[paramName] = [argumentNode];
			return argumentNode;
		});

		// Create function which calls `.bind()`
		// `(...vars) => fn.bind(ctx, var1, var2)(...vars)`
		const callVarsName = varNameTransform('vars');
		const callVarsNode = t.identifier(callVarsName);
		const fnNode = t.arrowFunctionExpression(
			[t.restElement(callVarsNode)],
			t.callExpression(
				t.callExpression(
					t.memberExpression(fnParamNode, t.identifier('bind')),
					argumentNodes
				),
				[t.spreadElement(callVarsNode)]
			)
		);

		// Nest function in block
		block.functions.push({
			id: null,
			node: fnNode,
			scopes: new Map([[scope, record]]),
			externalVars,
			internalVars: {[callVarsName]: [callVarsNode]},
			functionNames: new Set(),
			virtualBlock: undefined
		});

		// Record scope on record
		record.scope = scope;

		// Return null as node - will be created later
		return null;
	},

	serializeArguments(args, record) {
		// Serialize as array
		args = arraySlice.call(args);
		const arrayNode = this.serializeArray(args, record, 'arguments');

		// Create call to `createArguments` function
		const createArgumentsRecord = this.serializeValue(createArguments, 'createArguments');
		const node = t.callExpression(createArgumentsRecord.varNode, arrayNode.elements);
		createDependency(record, createArgumentsRecord, node, 'callee');

		return node;
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
 * @returns {Object} .internalVars - Object keyed by var name, values are arrays of identifier nodes
 * @returns {Set} . functionNames - Set of function names used
 */
function parseFunction(fn, js, isClass, isMethod) {
	// Parse - either as function expression, or class method
	// NB Cannot use `parseExpression()` as then `traverse()` errors on removing nodes
	const ast = parse(isMethod ? `(class {${js}});` : `(${js});`);

	// Remove tracker code + get nodes for external vars
	const externalVars = {},
		internalVars = {},
		functionNames = new Set();
	let enclosingFunctionPath = null;

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

				const idNode = path.node.id;
				if (idNode) functionNames.add(idNode.name);
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

			// Skip functions' names
			if (path.parentPath.isFunction() && path.key === 'id') return;

			// Add to internal / external vars
			// Is external if:
			// 1. not bound within function and
			// 2. not `arguments` which refers to outside function
			const idNode = path.node,
				{name} = idNode;
			const binding = path.scope.getBinding(name);
			if (binding) {
				// Skip if binding is function name - will not be renamed - tracked in `functionNames` instead
				if (!binding.path.isFunction()) addToVars(name, idNode, internalVars);
			} else if (name !== 'arguments' || !enclosingFunctionPath) {
				addToVars(name, idNode, externalVars);
			}
		},
		ThisExpression(path) {
			// Add to external vars if `this` refers to `this` from a higher function
			if (!enclosingFunctionPath) {
				path.replaceWith(t.identifier('this'));
				addToVars('this', path.node, externalVars);
			}
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

	// Return AST for function + external + internal vars objects + function names set
	return {node, externalVars, internalVars, functionNames};
}

function addToVars(name, node, externalVars) {
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
