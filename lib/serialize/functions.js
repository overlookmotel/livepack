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
	upperFirst = require('lodash/upperFirst'),
	{isString} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {setTrackerCallback, trackerError} = require('../shared/tracker.js'),
	specialFunctions = require('../shared/internal.js').functions,
	{identifierIsVariable} = require('../shared/functions.js'),
	{TRACKER_COMMENT_PREFIX} = require('../shared/constants.js'),
	{
		createRecord, createFile, createBlock, updateBlockParent, createScope, updateScopeParent,
		createDependency, createAssignment
	} = require('./records.js'),
	{recordIsCircular, deleteFirst, setAddFrom} = require('./utils.js'),
	assertBug = require('../shared/assertBug.js');

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

		// Check function is tracked
		assertBug(
			infoStr,
			'Failed to serialize function because it is not instrumented',
			"The function is likely in Node's internal codebase",
			() => `Function JS:\n${js}\nTrace:\n${this.getTraceStack()}\n`
		);

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
			const externalVarNames = new Set(),
				constVarNames = new Set();
			for (const {varNames, constNames} of scopeDefs) {
				setAddFrom(externalVarNames, varNames);
				if (constNames) setAddFrom(constVarNames, constNames);
			}

			fnDef = this.parseFunction(
				fn, js, filename, externalVarNames, constVarNames, !!info.isStrict,
				isMethod, info.isProtoMethod, info.superVarName, info.isEval, !!this.options.sourceMaps
			);

			fnDef.scopes = new Map(); // Keyed by scope object, value of each is function instance's record
			fnDef.virtualBlock = undefined;

			functions.set(fnId, fnDef);

			// Create blocks
			const {assignedToVarNames, containsEval} = fnDef;
			let parentBlock = this.rootBlock;
			for (const scopeDef of scopeDefs) {
				// Get/create block
				const {blockId} = scopeDef;
				let block = blocks.get(blockId);
				if (!block) {
					block = createBlock(blockId, scopeDef.blockName || 'anon', parentBlock, blocks);
				} else {
					updateBlockParent(block, parentBlock);
				}

				// Add var names to block
				const {paramNames, frozenNames, mutableNames} = block;
				for (const varName of scopeDef.varNames) {
					paramNames.add(varName);
					if (containsEval) frozenNames.add(varName);
					if (assignedToVarNames.has(varName) || (containsEval || !constVarNames.has(varName))) {
						mutableNames.add(varName);
					}
				}

				// Record argument names
				const {argNames} = scopeDef;
				if (argNames && !block.argNames) {
					block.argNames = argNames;

					// In sloppy mode, `arguments` and the argument vars themselves are linked.
					// e.g. `function f(x) { arguments[0] = 1; return () => x; }` sets `x` to `1`.
					// Therefore any use of `arguments` makes all the vars in that function's arguments mutable.
					// TODO Skip this if `arguments` is strict mode.
					// NB Whether `arguments` is sloppy mode depends on whether function which *originates*
					// `arguments` is strict mode, not on whether function in which `arguments[0] =`
					// appears is strict mode.
					// i.e. `function f(x) { (() => {'use strict'; arguments[0] = 1; })(); return x; }`
					// returns `1`. `arguments` has sloppy mode behaviour because outer function is sloppy mode.
					setAddFrom(mutableNames, argNames);
				}

				parentBlock = block;
			}
		}

		// Call function to extract scope values (unless no scope to extract)
		const {isClass, isAsync, isGenerator} = fnDef;
		let scopeVars;
		if (scopeDefs.length > 0) {
			setTrackerCallback((_scopeVars) => {
				scopeVars = _scopeVars;
			});

			let err, res,
				expectPromise = isAsync && !isGenerator;
			try {
				if (isClass) {
					res = new fn(...fnDef.callArguments); // eslint-disable-line new-cap
				} else {
					res = fn(...fnDef.callArguments);
					if (isGenerator) {
						expectPromise = isAsync;
						res = res.next();
					}
				}
			} catch (_err) {
				err = _err;
			}

			if (expectPromise) {
				if (res instanceof Promise) {
					res.catch(() => {}); // Prevent unhandled rejection
				} else {
					err = {message: 'Expected function to return Promise'};
				}
			} else if (err === trackerError) {
				err = undefined;
			}

			assertBug(
				!err,
				'Failed to extract scope vars from function',
				() => `Function JS:\n${js}\nError:${err.message}\nTrace:\n${this.getTraceStack()}\n`
			);
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
						// TODO I think this should be executed even if first check for existence of
						// `scopeValues[varName]` fails
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
			fnDef.numParams, isClass, isGenerator, fnDef.isArrow, isAsync, isMethod
		);
	},

	serializeSpecialFunction(fn, info, record) { // eslint-disable-line consistent-return
		const {type} = info;
		if (type === 'bound') return this.serializeBoundFunction(fn, info, record);
		if (type === 'promisify') return this.serializePromisifyFunction(info, record);
		if (type === 'debuglog') return this.serializeDebuglogFunction(info, record);
		if (type === 'splitAsync') return this.serializeSplitAsyncFunction(info, record);
		assertBug(false, `Unexpected special function type '${type}'`);
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
			const createBindingRecord = this.serializeRuntime('createBinding');

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

		const defaultProto = isGenerator
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
		protoRecord.prototypeOf = ctorRecord;
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
