/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const {promisify, debuglog} = require('util'),
	traverse = require('@babel/traverse').default,
	typeOf = require('native-type-of'),
	assert = require('simple-invariant'),
	{upperFirst} = require('lodash'),
	{isString} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const tracker = require('../tracker.js'),
	specialFunctions = require('../internal.js').functions,
	{identifierIsVariable} = require('../shared/functions.js'),
	{TRACKER_COMMENT_PREFIX} = require('../shared/constants.js'),
	{
		createRecord, createFile, createBlock, updateBlockParent, createScope, updateScopeParent,
		createDependency, createAssignment
	} = require('./records.js'),
	{recordIsCircular, deleteFirst, setAddFrom} = require('./utils.js'),
	{createBinding} = require('./external.js');

// Constants
const NUM_ARG_ITERATIONS = 1000;

// Exports

const functionToString = Function.prototype.toString;

/* eslint-disable no-empty-function, prefer-arrow-callback */
const GeneratorPrototype = Object.getPrototypeOf(function*() {}),
	AsyncFunctionPrototype = Object.getPrototypeOf(async function() {}),
	AsyncGeneratorPrototype = Object.getPrototypeOf(async function*() {});
/* eslint-enable no-empty-function, prefer-arrow-callback */

// In Node v12 >= 12.16.0, anonymous classes have a `name` property defined as ''
const anonClassHasNameProp = !!Object.getOwnPropertyDescriptor(class {}, 'name');

const trackerCommentRegex = new RegExp(`/\\*${TRACKER_COMMENT_PREFIX}(\\{.+?\\})\\*/`);

const argumentProxy = createArgumentProxy();

module.exports = {
	serializeFunction(fn, record) {
		// Rename var if function has name
		const {varNode} = record;
		if (fn.name && isString(fn.name)) {
			varNode.name = fn.name;
		} else if (varNode.name === 'constructor') {
			varNode.name = 'anonymous';
		}

		// Handle special functions (including bound functions)
		const specialInfo = specialFunctions.get(fn);
		if (specialInfo) return this.serializeSpecialFunction(fn, specialInfo, record);

		// Get function code + info from tracker comment
		const js = functionToString.call(fn);
		const [, infoStr] = js.match(trackerCommentRegex) || [];

		// Throw error if function is not tracked
		if (!infoStr) {
			console.error( // eslint-disable-line no-console
				'Failed to serialize function because it is not instrumented.\n'
					+ "This is likely a bug in Livepack, and the function is in Node's internal codebase.\n"
					+ 'Please raise an issue at https://github.com/overlookmotel/livepack/issues including the following details:\n'
					+ `Function JS:\n${js}\n`
					+ `Trace:\n${this.getTraceStack()}\n`
			);
			throw new Error('Function was not tracked');
		}

		const info = JSON.parse(infoStr);
		const {id: fnId, scopes: scopeDefs} = info,
			isMethod = info.isMethod || info.isProtoMethod;
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

			fnDef = this.parseFunction(
				fn, js, this.options.sourceMaps ? filename : undefined,
				externalVarNames, isMethod, info.isProtoMethod, info.superVarName, info.isEval
			);

			fnDef.scopes = new Map(); // Keyed by scope object, value of each is function instance's record
			fnDef.virtualBlock = undefined;

			functions.set(fnId, fnDef);

			// Create blocks
			const {containsEval} = fnDef;
			let parentBlock = this.rootBlock;
			for (const scopeDef of scopeDefs) {
				// Get/create block
				const {blockId, varNames} = scopeDef;
				let block = blocks.get(blockId);
				if (!block) {
					block = createBlock(blockId, scopeDef.blockName || 'anon', parentBlock, blocks);
				} else {
					updateBlockParent(block, parentBlock);
				}

				// Add var names to block
				setAddFrom(block.paramNames, varNames);
				if (containsEval) setAddFrom(block.frozenNames, varNames);

				// Record argument names
				if (scopeDef.argNames && !block.argNames) block.argNames = scopeDef.argNames;

				parentBlock = block;
			}
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
					new fn(...argumentProxy); // eslint-disable-line no-new, new-cap
				} catch (err) {
					// `new fn()` will throw if class extends another class
					// due to tracker code causing return before `super()` is called.
					if (err.message !== 'Derived constructors may only return object or undefined') throw err;
				}
			} else {
				const res = fn(...argumentProxy);
				// Generator functions return generator object, rather than executing function immediately.
				// Call `.next()` to execute function code.
				if (isGenerator) res.next();
			}
		} else {
			scopeVars = [];
		}

		// Record scope values
		const {readFromVarNames, containsEval} = fnDef;
		let block = this.rootBlock,
			scope = this.rootScope;
		for (let i = 0; i < scopeDefs.length; i++) {
			const {blockId, varNames} = scopeDefs[i],
				[scopeId, ...values] = scopeVars[i];

			const parentScope = scope;

			// Get/create scope
			block = blocks.get(blockId);
			scope = block.scopes.get(scopeId);
			if (!scope) {
				scope = createScope(scopeId, block, parentScope);
			} else {
				updateScopeParent(scope, parentScope);
			}

			// Add values to scope
			const {values: scopeValues} = scope;
			for (let j = 0; j < varNames.length; j++) {
				const varName = varNames[j];
				if (!containsEval && !readFromVarNames.has(varName)) continue;

				let scopeValue = scopeValues[varName];
				if (!scopeValue) {
					const val = values[j];
					const valRecord = this.serializeValue(
						val, varName, `<scope var '${varName}' in function '${fn.name}' (ID ${fnId}) at ${filename}>`
					);

					// Re-check for existence in `scopeValues` in case value contains another function
					// in this scope which references this same value. In that case, `scopeValues` may have
					// been populated during `this.serializeValue()` above.
					// Need to check otherwise may over-write `isCircular` with false when was previously true.
					scopeValue = scopeValues[varName];
					if (!scopeValue) {
						scopeValues[varName] = {record: valRecord, isCircular: recordIsCircular(valRecord)};
					} else if (!scopeValue.isCircular && recordIsCircular(valRecord)) {
						scopeValue.isCircular = true;
					}
				}
			}
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
			fnDef.numParams, isClass, isGenerator, fnDef.isArrow, fnDef.isAsync, isMethod
		);
	},

	serializeSpecialFunction(fn, info, record) {
		const {type} = info;
		if (type === 'bound') return this.serializeBoundFunction(fn, info, record);
		if (type === 'promisify') return this.serializePromisifyFunction(info, record);
		if (type === 'debuglog') return this.serializeDebuglogFunction(info, record);
		throw new Error(`Unexpected special function type '${type}'`);
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
		const unboundFnRecord = this.serializeValue(unboundFn, `${fnVarName}Unbound`, '<unbound>');
		const fnIsCircular = recordIsCircular(unboundFnRecord);

		// Serialize binding values
		let isCircular = fnIsCircular;
		const args = [];
		const valRecords = binding.vars.map((val, index) => {
			const varName = `${fnVarName}${index === 0 ? 'BoundCtx' : `BoundValue${index - 1}`}`;
			const valRecord = this.serializeValue(
				val, varName, index === 0 ? '<bound context>' : `<bound value ${index - 1}>`
			);
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

	/**
	 * `require('util').promisify()` returns functions.
	 * These are in Node's internal JS code, and therefore cannot be serialized.
	 * They are captured in `lib/init/functions.js`.
	 * Serialize as a call to `require('util').promisify()` with same arg as original call.
	 *
	 * @param {Object} info - Special function details
	 * @param {Function} info.fn - Function `promisify` was called with
	 * @param {Object} record - Record for promisified function instance
	 * @returns {Object} - Node for promisified function
	 */
	serializePromisifyFunction({fn}, record) {
		const fnVarName = record.varNode.name;
		const fnRecord = this.serializeValue(fn, `${fnVarName}Unpromisified`, '<unpromisified>');

		// TODO Handle circular references
		assert(!recordIsCircular(fnRecord), 'Cannot handle circular-referenced promisified functions');

		const promisifyRecord = this.serializeValue(promisify);
		const node = t.callExpression(promisifyRecord.varNode, [fnRecord.varNode]);
		createDependency(record, promisifyRecord, node, 'callee');
		createDependency(record, fnRecord, node.arguments, 0);

		// TODO Add additional properties
		return node;
	},

	/**
	 * `require('util').debuglog()` returns functions.
	 * These are in Node's internal JS code, and therefore cannot be serialized.
	 * They are captured in `lib/init/functions.js`.
	 * Serialize as a call to `require('util').debuglog()` with same args as original call.
	 *
	 * @param {Object} info - Special function details
	 * @param {Array} info.args - Arguments `debuglog` was called with
	 * @param {Object} record - Record for debuglog function instance
	 * @returns {Object} - Node for debuglog function
	 */
	serializeDebuglogFunction(info, record) {
		// TODO Handle circular references
		const setRecord = this.serializeValue(info.set, 'debuglogSet', '<debuglog set argument>');
		const argumentsNodes = [setRecord.varNode];
		createDependency(record, setRecord, argumentsNodes, 0);

		const {cb} = info;
		if (cb !== undefined) {
			const cbRecord = this.serializeValue(cb, 'debuglogCb', '<debuglog cb argument>');
			argumentsNodes[1] = cbRecord.varNode;
			createDependency(record, cbRecord, argumentsNodes, 1);
		}

		const debuglogRecord = this.serializeValue(debuglog);
		const node = t.callExpression(debuglogRecord.varNode, argumentsNodes);
		createDependency(record, debuglogRecord, node, 'callee');

		// TODO Add additional properties
		return node;
	},

	wrapFunctionWithProperties(
		fn, record, node, name, numParams, isClass, isGenerator, isArrowOrBound, isAsync, isMethod
	) {
		const defaultProps = [
			{name: 'length', value: numParams, writable: false, enumerable: false, configurable: true}
		];
		if (!isClass || name) { // Anonymous classes have no `name` property
			defaultProps.push(
				{name: 'name', value: name, writable: false, enumerable: false, configurable: true}
			);
		}

		const defaultProto = isGenerator // eslint-disable-line no-nested-ternary
			? isAsync ? AsyncGeneratorPrototype : GeneratorPrototype
			: isAsync ? AsyncFunctionPrototype : Function.prototype;

		const protoDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype'),
			proto = protoDescriptor ? protoDescriptor.value : undefined;
		let protoValue;
		if (!isArrowOrBound && ((!isAsync && !isMethod) || isGenerator)) {
			// Should have prototype
			if (isGenerator) {
				// Prototype should not have constructor
				if (
					proto
						&& Object.getPrototypeOf(proto) === defaultProto.prototype
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
				// Prototype should be an object (not an Array, Set etc)
				// and should have constructor - check constructor refers back to function
				if (typeOf(proto) === 'Object') { // eslint-disable-line no-lonely-if
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
		// Workaround for Node v12 >= 12.16.0, where anonymous classes have a 'name' property
		// defined as ''. On these Node versions, ignore the name prop if it's unchanged.
		let skipNameKey = false;
		if (anonClassHasNameProp && isClass && !name) {
			const nameDescriptor = Object.getOwnPropertyDescriptor(fn, 'name');
			if (
				nameDescriptor && nameDescriptor.value === ''
				&& !nameDescriptor.writable && !nameDescriptor.enumerable && nameDescriptor.configurable
			) {
				skipNameKey = true;
			}
		}

		node = this.wrapWithProperties(
			fn, record, node, defaultProto, defaultProps,
			key => key === 'arguments' || key === 'caller' || (skipNameKey && key === 'name'),
			functionShouldForceDescriptor
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
				const protoRecord = this.serializeValue(proto, this.getPrototypeVarName(record), '.prototype');
				this.withTrace(
					() => this.serializeProperties(
						proto, protoRecord, null, Object.prototype,
						[{name: 'constructor', value: fn, writable: true, enumerable: false, configurable: true}],
						undefined, undefined, true
					),
					'.prototype'
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

	deleteDependencies(record) {
		this.deleteOwnDependencies(record);

		const {assignments} = record;
		if (assignments) {
			for (const assignment of assignments) {
				this.deleteOwnDependencies(assignment);
			}
		}
	},

	deleteOwnDependencies(record) {
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

function functionShouldForceDescriptor(key) {
	return key === 'name';
}

/**
 * Create proxy to use as arguments for calling functions.
 * Any function can be called with `fn(...argumentsProxy)`.
 * Should never cause an error in destructuring or cause default expressions to be evaluated.
 * TODO Make better version with no limit on number of iterations, or find a better way to do this.
 * @returns {Proxy}
 */
function createArgumentProxy() {
	const proxy = new Proxy({}, {
		get(target, key) {
			if (key === Symbol.iterator) {
				let count = 0;
				return () => ({
					next() {
						count++;
						if (count === NUM_ARG_ITERATIONS) return {value: undefined, done: true};
						return {value: proxy, done: false};
					}
				});
			}

			return proxy;
		}
	});

	return proxy;
}
