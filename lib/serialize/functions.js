/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const tracker = require('../tracker.js'),
	{boundFunctions} = require('../init.js'),
	{
		identifierIsVariable, TRACKER_COMMENT_PREFIX, GeneratorFunction, AsyncGeneratorFunction
	} = require('../shared.js'),
	{
		createRecord, createFile, createBlock, createScope, createDependency, createAssignment
	} = require('./records.js'),
	{isJsIdentifier, recordIsCircular} = require('./utils.js'),
	{createArguments, createBinding} = require('./external.js');

// Exports

const functionToString = Function.prototype.toString,
	arraySlice = Array.prototype.slice;

const trackerCommentRegex = new RegExp(`/\\*${TRACKER_COMMENT_PREFIX}(\\{.+?\\})\\*/`);

module.exports = {
	serializeFunction(fn, record) {
		// Rename var if function has name
		if (fn.name) record.varNode.name = fn.name;

		// Handle bound functions
		const binding = boundFunctions.get(fn);
		if (binding) return this.serializeBoundFunction(fn, binding, record);

		// Get function code + info from tracker comment
		// TODO For classes, make sure get comment from constructor
		// - constructor not necessarily first in class definition
		const js = functionToString.call(fn);
		const [, infoStr] = js.match(trackerCommentRegex) || [];
		assert(infoStr, `Function was not tracked: ${js}`);

		const info = JSON.parse(infoStr);
		const {id: fnId, scopes: scopeDefs, isMethod} = info;
		const filename = info.filename || '';

		// Get/create file
		const {files} = this;
		const {blocks, functions} = files[filename] || createFile(filename, files);

		// Parse function code if not encountered before
		let fnDef = functions.get(fnId);
		const isNotParsedBefore = !fnDef;
		if (isNotParsedBefore) {
			// Function not encountered before.
			// Parse function code to AST and remove tracker code.
			const {
				node: fnNode, externalVars, internalVars, functionNames, isClass, isGenerator, isArrow, isAsync
			} = parseFunction(fn, js, isMethod);

			// Create function record
			fnDef = {
				id: fnId,
				node: fnNode,
				scopes: new Map(), // Keyed by scope object, value of each is function instance's record
				externalVars,
				internalVars,
				functionNames,
				virtualBlock: undefined,
				isClass,
				isGenerator,
				isArrow,
				isAsync
			};
			functions.set(fnId, fnDef);
		}

		// Call function to extract scope values (unless no scope to extract)
		const {isClass, isGenerator} = fnDef;
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
					scopeValues[varName] = {record: valRecord, isCircular: recordIsCircular(valRecord)};
					paramNames.add(varName);
				}
			}

			if (argNames && !block.argNames) block.argNames = argNames;
		}

		// Place function in block
		let fnScopes = fnDef.scopes;
		if (isNotParsedBefore) {
			// First instance of this function encountered
			// Nest function in block
			block.functions.push(fnDef);
		} else {
			// Instance of this function encountered before
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

		// Return node with placeholder for function definition - definition will be added later
		const idNode = fnDef.node.id,
			fnName = idNode ? idNode.name : '';
		return this.wrapFunctionWithProperties(
			fn, record, t.identifier('x'), fnName, isClass, isGenerator, fnDef.isArrow, fnDef.isAsync
		);
	},

	/**
	 * Serialize a bound function.
	 * If there are no circular vars, output `fn.bind(ctx, var0, var1)`.
	 * If there are circular vars, create a scope into which bound values can be injected.
	 *
	 * @param {Function} fn - Function
	 * @param {Object} binding - Binding record
	 * @param {Object} record - Record for bound function instance
	 * @returns {Object} - Node for bound function
	 */
	serializeBoundFunction(fn, binding, record) {
		// Serialize unbound function
		const fnVarName = record.varNode.name;
		const unboundFn = binding.fn;
		const unboundFnRecord = this.serializeValue(unboundFn, `${fnVarName}Unbound`);
		const fnIsCircular = recordIsCircular(unboundFnRecord);

		// Serialize binding values
		let isCircular = fnIsCircular;
		const args = [];
		const valRecords = binding.vars.map((val, index) => {
			const varName = `${fnVarName}${index === 0 ? 'BoundCtx' : `BoundValue${index - 1}`}`;
			const valRecord = this.serializeValue(val, varName);
			if (recordIsCircular(valRecord)) isCircular = true;
			args[index] = valRecord.varNode;
			return valRecord;
		});

		// Create `fn.bind(ctx, val0, val1)`
		const bindNode = t.memberExpression(unboundFnRecord.varNode, t.identifier('bind'));
		const callNode = t.callExpression(bindNode, args);

		// If there are circular references, use `createBinding()` to create wrapper
		// and inject bound function later
		let targetRecord, node;
		if (isCircular) {
			// Create call to `createBinding` function
			const createBindingRecord = this.serializeValue(createBinding, 'createBinding');

			// Create binding (binding is result of calling `createBinding()`)
			const bindingRecord = createRecord(`binding${upperFirst(fnVarName)}`);
			const bindingNode = t.callExpression(createBindingRecord.varNode, []);
			bindingRecord.node = bindingNode;
			createDependency(bindingRecord, createBindingRecord, bindingNode, 'callee');

			// Create node for wrapped bound function - `binding[0]`
			node = t.memberExpression(bindingRecord.varNode, t.numericLiteral(0), true);
			createDependency(record, bindingRecord, node, 'object');

			// Create inject function - `binding[1]`
			const injectRecord = createRecord(`injectIntoBinding${upperFirst(fnVarName)}`);
			const injectFnNode = t.memberExpression(bindingRecord.varNode, t.numericLiteral(1), true);
			injectRecord.node = injectFnNode;
			createDependency(injectRecord, bindingRecord, injectFnNode, 1);

			// Create assignment to inject bound function into binding
			const assignmentNode = t.callExpression(injectRecord.varNode, [callNode]);
			const assignment = createAssignment(record, assignmentNode);
			createDependency(assignment, injectRecord, assignmentNode, 'callee');

			targetRecord = assignment;
		} else {
			// No circular references - use `fn.bind(ctx, val0, val1)` as node
			targetRecord = record;
			node = callNode;
		}

		// Create dependencies
		createDependency(targetRecord, unboundFnRecord, bindNode, 'object');
		valRecords.forEach((valRecord, index) => createDependency(targetRecord, valRecord, args, index));

		// Return node
		return this.wrapFunctionWithProperties(
			fn, record, node, isCircular ? '' : `bound ${unboundFn.name}`, false, false, true, false
		);
	},

	wrapFunctionWithProperties(fn, record, node, name, isClass, isGenerator, isArrow, isAsync) {
		const excludeName = fn.name === name;
		const excludePrototype = isArrow // eslint-disable-line no-nested-ternary
			? false
			: isGenerator
				? generatorHasUnalteredPrototype(fn, isAsync)
				: functionHasUnalteredPrototype(fn, isClass);

		const wrappedNode = this.wrapWithProperties(
			fn, record, node,
			key => (
				key === 'length' || key === 'arguments' || key === 'caller'
				|| (key === 'name' && excludeName)
				|| (key === 'prototype' && excludePrototype)
			),
			key => key === 'name'
		);

		if (!excludePrototype) {
			const protoRecord = this.records.get(fn.prototype);
			if (protoRecord) protoRecord.varNode.name = `${record.varNode.name}Prototype`;
		}

		return wrappedNode;
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
 * Determine if function has an unaltered prototype.
 * @param {Function} fn - Function
 * @param {boolean} isClass - `true` if is a class
 * @returns {boolean} - `true` if prototype is unaltered
 */
function functionHasUnalteredPrototype(fn, isClass) {
	// Check has prototype
	const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
	if (!prototypeDescriptor) return false;

	// Check prototype is defined and plain object
	const prototype = prototypeDescriptor.value;
	if (!prototype || Object.getPrototypeOf(prototype) !== Object.prototype) return false;

	// Check prototype has unaltered descriptor props
	if (
		prototypeDescriptor.writable === isClass
		|| prototypeDescriptor.enumerable
		|| prototypeDescriptor.configurable
	) return false;

	// Check prototype has no properties other than `constructor`
	const protoPropNames = Object.getOwnPropertyNames(prototype);
	if (protoPropNames.length !== 1 || protoPropNames[0] !== 'constructor') return false;
	if (Object.getOwnPropertySymbols(prototype).length !== 0) return false;

	// Check constructor refers back to function
	const ctorDescriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
	const ctor = ctorDescriptor.value;
	if (ctor !== fn) return false;

	// Check constructor has unaltered descriptor props
	if (
		!ctorDescriptor.writable || ctorDescriptor.enumerable || !ctorDescriptor.configurable
	) return false;

	return true;
}

/**
 * Determine if generator function has an unaltered prototype.
 * @param {Function} fn - Function
 * @param {boolean} isAsync - `true` if is an async generator
 * @returns {boolean} - `true` if prototype is unaltered
 */
function generatorHasUnalteredPrototype(fn, isAsync) {
	// Check has prototype
	const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
	if (!prototypeDescriptor) return false;

	// Check prototype is defined and inherits GeneratorFunction.prototype
	const prototype = prototypeDescriptor.value;
	if (!prototype) return false;
	if (
		Object.getPrototypeOf(prototype)
		!== (isAsync ? AsyncGeneratorFunction.prototype : GeneratorFunction.prototype)
	) return false;

	// Check prototype has unaltered descriptor props
	if (
		!prototypeDescriptor.writable || prototypeDescriptor.enumerable || prototypeDescriptor.configurable
	) return false;

	// Check prototype has no properties
	if (Object.getOwnPropertyNames(prototype).length !== 0) return false;
	if (Object.getOwnPropertySymbols(prototype).length !== 0) return false;

	return true;
}

/**
 * Parse function code to AST and identify nodes referring to external variables.
 * @param {Function} fn - Function
 * @param {string} js - Javascript code for function
 * @param {boolean} isMethod - `true` if is a method
 * @returns {Object}
 * @returns {Object} .node - AST node for function
 * @returns {Object} .externalVars - Object keyed by var name, values are arrays of identifier nodes
 * @returns {Object} .internalVars - Object keyed by var name, values are arrays of identifier nodes
 * @returns {Set} . functionNames - Set of function names used
 * @returns {boolean} .isClass - `true` if is class
 * @returns {boolean} .isGenerator - `true` if is generator
 * @returns {boolean} .isArrow - `true` if is arrow function
 * @returns {boolean} .isAsync - `true` if is async function
 */
function parseFunction(fn, js, isMethod) {
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
	const idNode = fnName && isJsIdentifier(fnName) ? t.identifier(fnName) : null;

	let isClass;
	if (isMethod) {
		// Class/object method - convert to function expression
		// TODO Deal with `super`
		node = node.body.body[0];
		assert(
			node.type === 'ClassMethod' || node.type === 'ObjectMethod',
			`Unexpected class method node type '${node.type}'`
		);
		node = t.functionExpression(idNode, node.params, node.body, node.generator, node.async);
		isClass = false;
	} else {
		isClass = t.isClass(node);
		if (isClass) {
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
	return {
		node,
		externalVars,
		internalVars,
		functionNames,
		isClass,
		isGenerator: !!node.generator,
		isArrow: t.isArrowFunctionExpression(node),
		isAsync: !!node.async
	};
}

function addToVars(name, node, externalVars) {
	const nodes = externalVars[name];
	if (nodes) {
		nodes.push(node);
	} else {
		externalVars[name] = [node];
	}
}
