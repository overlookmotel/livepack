/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	traverse = require('@babel/traverse').default,
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const tracker = require('../tracker.js'),
	{boundFunctions} = require('../init.js'),
	{
		identifierIsVariable, TRACKER_COMMENT_PREFIX,
		GeneratorPrototype, AsyncFunctionPrototype, AsyncGeneratorPrototype
	} = require('../shared.js'),
	{
		createRecord, createFile, createBlock, createScope, createDependency, createAssignment
	} = require('./records.js'),
	{recordIsCircular, deleteFirst, setAddFrom} = require('./utils.js'),
	{createArguments, createBinding} = require('./external.js'),
	parseFunction = require('./parseFunction.js');

// Exports

const functionToString = Function.prototype.toString,
	arraySlice = Array.prototype.slice;

const trackerCommentRegex = new RegExp(`/\\*${TRACKER_COMMENT_PREFIX}(\\{.+?\\})\\*/`);

module.exports = {
	serializeFunction(fn, record) {
		// Rename var if function has name
		const {varNode} = record;
		if (fn.name) {
			varNode.name = fn.name;
		} else if (varNode.name === 'constructor') {
			varNode.name = 'anonymous';
		}

		// Handle bound functions
		const binding = boundFunctions.get(fn);
		if (binding) return this.serializeBoundFunction(fn, binding, record);

		// Get function code + info from tracker comment
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
			const externalVarNames = new Set();
			for (const {varNames} of scopeDefs) {
				setAddFrom(externalVarNames, varNames);
			}

			const {
				node: fnNode, externalVars, internalVars, globalVarNames, functionNames,
				name, numParams, isClass, isGenerator, isArrow, isAsync
			} = parseFunction(fn, js, externalVarNames, isMethod, info.isProtoMethod, info.superVarName);

			// Create function record
			fnDef = {
				id: fnId,
				node: fnNode,
				scopes: new Map(), // Keyed by scope object, value of each is function instance's record
				externalVars,
				internalVars,
				globalVarNames,
				functionNames,
				virtualBlock: undefined,
				name,
				numParams,
				isClass,
				isGenerator,
				isArrow,
				isAsync,
				isMethod
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
					if (err.message !== 'Derived constructors may only return object or undefined') throw err;
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
		return this.wrapFunctionWithProperties(
			fn, record, t.identifier('x'), fnDef.name,
			fnDef.numParams, isClass, isGenerator, fnDef.isArrow, fnDef.isAsync, fnDef.isMethod
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
		let targetRecord, node, numParams;
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
			numParams = 0;
		} else {
			// No circular references - use `fn.bind(ctx, val0, val1)` as node
			targetRecord = record;
			node = callNode;

			const unboundLength = Math.floor(unboundFn.length);
			numParams = Number.isNaN(unboundLength)
				? 0
				: Math.max(unboundLength - Math.max(args.length - 1, 0), 0);
		}

		// Create dependencies
		createDependency(targetRecord, unboundFnRecord, bindNode, 'object');
		valRecords.forEach((valRecord, index) => createDependency(targetRecord, valRecord, args, index));

		// Return node
		return this.wrapFunctionWithProperties(
			fn, record, node, isCircular ? '' : `bound ${unboundFn.name}`,
			numParams, false, false, true, false, false
		);
	},

	wrapFunctionWithProperties(
		fn, record, node, name, numParams, isClass, isGenerator, isArrow, isAsync, isMethod
	) {
		const defaultProps = [
			{name: 'length', value: numParams, writable: false, enumerable: false, configurable: true}
		];
		if (!isClass || name) { // Anonymous classes have no `name` property
			defaultProps.push(
				{name: 'name', value: name, writable: false, enumerable: false, configurable: true}
			);
		}

		const protoDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype'),
			proto = protoDescriptor ? protoDescriptor.value : undefined;
		let protoValue;
		if (!isArrow && (!isAsync || isGenerator) && !isMethod) {
			// Should have prototype
			if (isGenerator) {
				// Prototype should not have constructor
				// TODO Deal with where prototype redefined as non-object
				if (
					proto
						&& Object.getOwnPropertyNames(proto).length === 0
						&& Object.getOwnPropertySymbols(proto).length === 0
				) {
					const protoRecord = this.records.get(proto);
					if (protoRecord) {
						// Prototype already serialized - redefine as `fn.prototype`
						this.deleteDependencies(protoRecord);
						protoRecord.node = this.serializePrototype(protoRecord, record);
					}

					protoValue = proto;
				}
			} else {
				// Prototype should have constructor - check it refers back to function
				// TODO Deal with where prototype redefined as non-object
				if (proto) { // eslint-disable-line no-lonely-if
					const ctorDescriptor = Object.getOwnPropertyDescriptor(proto, 'constructor');
					if (ctorDescriptor) {
						const ctor = ctorDescriptor.value;
						if (ctor === fn) protoValue = proto;
					}
				}
			}

			// Ensure prototype prop over-ridden where has been set to `undefined`
			if (!protoValue && proto === undefined) protoValue = null;

			defaultProps.splice(isClass ? 1 : 2, 0, {
				name: 'prototype', value: protoValue, writable: !isClass, enumerable: false, configurable: false
			});
		}

		// Flag prototype as prototype
		if (proto) this.prototypes.set(proto, protoValue ? record : null);

		// Wrap with properties
		const defaultProto = isGenerator // eslint-disable-line no-nested-ternary
			? isAsync ? AsyncGeneratorPrototype : GeneratorPrototype
			: isAsync ? AsyncFunctionPrototype : Function.prototype;
		node = this.wrapWithProperties(
			fn, record, node, defaultProto, defaultProps, functionShouldSkipKey, functionShouldForceDescriptor
		);

		// Set var name for `.prototype`
		if (protoValue === undefined && proto) {
			const protoRecord = this.records.get(proto);
			if (protoRecord) this.setPrototypeVarName(protoRecord, record);
		}

		// Add methods to prototype + set prototype descriptor
		if (protoValue && !isGenerator) {
			let protoIsAltered = false;
			const propNames = Object.getOwnPropertyNames(proto);
			if (propNames.length !== 1 || Object.getOwnPropertySymbols(proto).length !== 0) {
				protoIsAltered = true;
			} else if (propNames[0] !== 'constructor') {
				protoIsAltered = true;
			} else if (Object.getPrototypeOf(proto) !== Object.prototype) {
				protoIsAltered = true;
			} else {
				const ctorDescriptor = Object.getOwnPropertyDescriptor(proto, 'constructor');
				if (!ctorDescriptor.writable || ctorDescriptor.enumerable || !ctorDescriptor.configurable) {
					protoIsAltered = true;
				}
			}

			if (protoIsAltered) {
				const protoRecord = this.serializeValue(proto, this.getPrototypeVarName(record));
				this.serializeProperties(
					proto, protoRecord, null, Object.prototype,
					[{name: 'constructor', value: fn, writable: true, enumerable: false, configurable: true}],
					undefined, undefined, true
				);

				const assignment = createAssignment(record, null);
				assignment.dependencies.push({record: protoRecord});
			}
		}

		// Return wrapped function node
		return node;
	},

	serializePrototype(protoRecord, ctorRecord) {
		this.setPrototypeVarName(protoRecord, ctorRecord);
		const node = t.memberExpression(ctorRecord.varNode, t.identifier('prototype'));
		createDependency(protoRecord, ctorRecord, node, 'object');
		return node;
	},

	setPrototypeVarName(protoRecord, fnRecord) {
		protoRecord.varNode.name = this.getPrototypeVarName(fnRecord);
	},

	getPrototypeVarName(fnRecord) {
		return `${fnRecord.varNode.name}Prototype`;
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
	},

	// TODO Remove dependencies in assignments too
	deleteDependencies(record) {
		const {dependencies} = record;
		if (dependencies.length === 0) return;

		traverse(t.program([t.expressionStatement(record.node)]), {
			Identifier: (path) => {
				if (!identifierIsVariable(path)) return;

				const {node, key, listKey} = path;
				// eslint-disable-next-line no-shadow
				const dependency = deleteFirst(dependencies, dependency => dependency.record.varNode === node);
				const dependencyRecord = dependency.record;
				let parentNode = path.parentPath.node;
				if (listKey) parentNode = parentNode[listKey];
				const {dependents} = dependencyRecord;
				deleteFirst(dependents, dependent => dependent.node === parentNode && dependent.key === key);

				if (dependents.length === 0) {
					this.deleteDependencies(dependencyRecord);
					if (dependencyRecord.val) this.records.delete(dependencyRecord.val);
				}
			},
			noScope: true
		});
	}
};

function functionShouldSkipKey(key) {
	return key === 'arguments' || key === 'caller';
}

function functionShouldForceDescriptor(key) {
	return key === 'name';
}
