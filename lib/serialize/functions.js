/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const util = require('util'),
	traverse = require('@babel/traverse').default,
	typeOf = require('native-type-of'),
	assert = require('simple-invariant'),
	upperFirst = require('lodash/upperFirst'),
	{isString} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const {activateTracker, getTrackerResult, trackerError} = require('../shared/tracker.js'),
	specialFunctions = require('../shared/internal.js').functions,
	{
		TRACKER_COMMENT_PREFIX,
		FN_TYPE_FUNCTION, FN_TYPE_ASYNC_FUNCTION, FN_TYPE_GENERATOR_FUNCTION,
		FN_TYPE_ASYNC_GENERATOR_FUNCTION, FN_TYPE_CLASS, EVAL_PLACEHOLDER
	} = require('../shared/constants.js'),
	{
		createRecord, createFile, createBlock, updateBlockParent, createScope, updateScopeParent,
		createDependency, createAssignment
	} = require('./records.js'),
	{recordIsCircular, deleteFirst} = require('./utils.js'),
	assertBug = require('../shared/assertBug.js');

// Exports

const functionToString = Function.prototype.toString;

/* eslint-disable no-empty-function, prefer-arrow-callback */
const GeneratorPrototype = Object.getPrototypeOf(function*() {}),
	AsyncFunctionPrototype = Object.getPrototypeOf(async function() {}),
	AsyncGeneratorPrototype = Object.getPrototypeOf(async function*() {});
/* eslint-enable no-empty-function, prefer-arrow-callback */

const trackerCommentRegex = new RegExp(
	`/\\*${TRACKER_COMMENT_PREFIX}(\\d+);(${FN_TYPE_FUNCTION}|${FN_TYPE_ASYNC_FUNCTION}|${FN_TYPE_GENERATOR_FUNCTION}|${FN_TYPE_ASYNC_GENERATOR_FUNCTION}|${FN_TYPE_CLASS});(.*?)\\*/`
);

const commentTypePropsMap = {
	[FN_TYPE_FUNCTION]: {isClass: false, isAsync: false, isGenerator: false},
	[FN_TYPE_ASYNC_FUNCTION]: {isClass: false, isAsync: true, isGenerator: false},
	[FN_TYPE_GENERATOR_FUNCTION]: {isClass: false, isAsync: false, isGenerator: true},
	[FN_TYPE_ASYNC_GENERATOR_FUNCTION]: {isClass: false, isAsync: true, isGenerator: true},
	[FN_TYPE_CLASS]: {isClass: true, isAsync: false, isGenerator: false}
};

module.exports = {
	serializeFunction(fn, record) {
		// Rename var if function has name
		const {varNode} = record,
			fnName = Object.getOwnPropertyDescriptor(fn, 'name')?.value;
		if (isString(fnName) && fnName !== '') {
			varNode.name = fnName;
		} else if (varNode.name === 'constructor') {
			varNode.name = 'anonymous';
		}

		// Handle special functions (including bound functions)
		const specialInfo = specialFunctions.get(fn);
		if (specialInfo) return this.serializeSpecialFunction(fn, specialInfo, record);

		// Get function code + info from tracker comment
		const js = functionToString.call(fn);
		const commentMatch = js.match(trackerCommentRegex);

		assertBug(
			commentMatch,
			'Failed to serialize function because it is not instrumented',
			"The function is likely in Node's internal codebase",
			() => `Function JS:\n${js}\nTrace:\n${this.getTraceStack()}\n`
		);

		const fnId = commentMatch[1] * 1,
			filename = JSON.parse(`"${commentMatch[3]}"`);

		// Get/create file
		const {files} = this;
		const {blocks, functions} = files[filename] || createFile(filename, files);

		// Parse function code if not encountered before
		let fnDef = functions.get(fnId),
			scopeDefs, isClass, isAsync, isGenerator;
		const isNotParsedBefore = !fnDef;
		if (isNotParsedBefore) {
			({isClass, isAsync, isGenerator} = commentTypePropsMap[commentMatch[2]]);
		} else {
			({scopeDefs, isClass, isAsync, isGenerator} = fnDef);
		}

		// Call function to extract scope values (unless no scope to extract)
		let getFnInfo, scopeVars;
		if (isNotParsedBefore || scopeDefs.size > 0) {
			({getFnInfo, scopeVars} = this.trackFunction(fn, isClass, isGenerator, isAsync, js));
		} else {
			scopeVars = [];
		}

		if (isNotParsedBefore) {
			// Function not encountered before - parse function
			fnDef = this.parseFunction(fn, fnId, getFnInfo, isClass, isAsync, isGenerator, filename);
			scopeDefs = fnDef.scopeDefs;

			fnDef.scopes = new Map(); // Keyed by scope object, value of each is function instance's record
			fnDef.virtualBlock = undefined;
			fnDef.internalScopeParams = undefined; // May be set in `processBlock()`
			fnDef.isScopeInternalOnly = false; // May be set in `processBlock()`

			functions.set(fnId, fnDef);

			// Create blocks
			let parentBlock = this.rootBlock;
			for (const [blockId, scopeDef] of scopeDefs) {
				// Get/create block
				let block = blocks.get(blockId);
				if (!block) {
					block = createBlock(blockId, scopeDef.blockName || 'anon', parentBlock);
					blocks.set(blockId, block);
				} else {
					updateBlockParent(block, parentBlock);
				}

				// Record argument names.
				// In sloppy mode, `arguments` and the argument vars themselves are linked.
				// e.g. `function f(x) { arguments[0] = 1; return () => x; }` sets `x` to `1`.
				// Therefore any use of `arguments` makes all the vars in that function's arguments mutable.
				// TODO: Skip this if `arguments` is strict mode.
				// NB: Whether `arguments` is sloppy mode depends on whether function which *originates*
				// `arguments` is strict mode, not on whether function in which `arguments[0] =`
				// appears is strict mode.
				// i.e. `function f(x) { (() => {'use strict'; arguments[0] = 2; })(); return x; }(1) === 2`
				// `arguments` has sloppy mode behaviour because outer function is sloppy mode.
				// TODO: Also skip this if properties of `arguments` are only read from, not mutated.
				const {params} = block,
					{vars} = scopeDef;
				let {argNames} = block;
				if (!argNames && vars.arguments && fnDef.argNames) {
					argNames = block.argNames = new Set(fnDef.argNames);

					for (const argName of fnDef.argNames) {
						const param = params.get(argName);
						if (param) param.isMutable = true;
					}
				}

				// Add var names to block
				for (const [varName, {isAssignedTo}] of Object.entries(vars)) {
					const param = params.get(varName);
					if (!param) {
						params.set(varName, {isMutable: isAssignedTo || argNames?.has(varName)});
					} else if (isAssignedTo) {
						param.isMutable = true;
					}
				}

				parentBlock = block;
			}

			// Flag that block contains `eval()` if function does.
			// Blocks above this will have `containsEval` set later on after block tree is finalised.
			// Later functions may cause blocks to be inserted into the block chain above this function later
			// so can't do it now.
			if (fnDef.containsEval) parentBlock.containsEval = true;
		}

		// Record scope values
		let block = this.rootBlock,
			scope = this.rootScope;
		[...scopeDefs.entries()].forEach(([blockId, {vars}], blockIndex) => {
			const [scopeId, ...values] = scopeVars[blockIndex],
				parentScope = scope;

			// Get/create scope
			block = blocks.get(blockId);
			scope = block.scopes.get(scopeId);
			if (!scope) {
				scope = createScope(scopeId, block, parentScope);
			} else {
				updateScopeParent(scope, parentScope);
			}

			// Add values to scope
			const {values: scopeValues, record: scopeRecord} = scope;
			Object.entries(vars).forEach(([varName, {isReadFrom}], varIndex) => {
				if (!isReadFrom) return;

				let scopeValue = scopeValues[varName];
				if (!scopeValue) {
					const val = values[varIndex];
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

						// Create dependency between scope and value.
						// Dependency object is missing `.node` and `.key` properties at this stage.
						// These will be set in `processBlock()`.
						// `undefined` is ignored as it's a special case - may be omitted from `createScope()` call.
						if (val !== undefined) createDependency(scopeRecord, valRecord, undefined, undefined);
					} else if (!scopeValue.isCircular && recordIsCircular(valRecord)) {
						// TODO: I think this should be executed even if first check for existence of
						// `scopeValues[varName]` fails
						scopeValue.isCircular = true;
					}
				}
			});
		});

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
				if (fnDef.containsEval) virtualBlock.containsEval = true;
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
			fn, record, t.identifier('x'), fnDef.name, fnDef.numParams,
			isClass, fnDef.isClassWithSuperClass, isAsync, isGenerator, fnDef.isArrow, fnDef.isMethod
		);
	},

	/**
	 * Call function with tracker active to extract function info and scope values.
	 * @param {Function} fn - Function
	 * @param {boolean} isClass - `true` if is class
	 * @param {boolean} isGenerator - `true` if is generator function
	 * @param {boolean} isAsync - `true` if is async function
	 * @param {string} js - Function code
	 * @returns {Object} - Object with properties:
	 *   {Function} .getFnInfo - Function to call to get info about function
	 *   {Array<Array<*>>} .scopeVars - Array of scope vars split by block
	 * @throws {Error} - If failed to extract scope vars
	 */
	trackFunction(fn, isClass, isGenerator, isAsync, js) {
		// Activate tracker
		activateTracker();

		// Call function to trigger tracker
		let res,
			functionThrew = false,
			errorMessage;
		try {
			if (isClass) {
				res = new fn(); // eslint-disable-line new-cap
			} else {
				res = fn();
				if (isGenerator) res = res.next();
			}
		} catch (err) {
			functionThrew = true;
			if (err !== trackerError) errorMessage = getErrorMessage(err);
		}

		// Get result of tracker call.
		// Needs to be called even if unexpected error and tracker was not called,
		// as it also deactivates the tracker.
		const {getFnInfo, getScopes} = getTrackerResult();

		// Ensure tracker was called in async function or threw in non-async function
		if (isAsync) {
			if (res instanceof Promise) {
				res.catch(() => {}); // Prevent unhandled rejection
			} else if (!errorMessage && !(isGenerator && functionThrew)) {
				// Async generators throw synchronously if tracker is in params not in function body
				errorMessage = 'Expected function to return Promise';
			}
		} else if (!functionThrew) {
			errorMessage = 'Expected tracker to throw error';
		}

		// Call `getScopes()` to get scope vars
		let scopeVars;
		if (!errorMessage) {
			try {
				scopeVars = getScopes();
			} catch (err) {
				errorMessage = getErrorMessage(err);
			}
		}

		assertBug(
			!errorMessage,
			'Failed to extract scope vars from function',
			() => `Function JS:\n${js}\nError:${errorMessage}\nTrace:\n${this.getTraceStack()}\n`
		);

		return {getFnInfo, scopeVars};
	},

	serializeSpecialFunction(fn, info, record) { // eslint-disable-line consistent-return
		const {type} = info;
		if (type === 'require') return this.serializeRequireFunction(info);
		if (type === 'eval') return this.serializeEvalFunction(fn);
		if (type === 'bound') return this.serializeBoundFunction(fn, info, record);
		if (type === 'promisify') return this.serializePromisifyFunction(info, record);
		if (type === 'callbackify') return this.serializeCallbackifyFunction(info, record);
		if (type === 'debuglog') return this.serializeDebuglogFunction(info, record);
		if (type === 'splitAsync') return this.serializeSplitAsyncFunction(info, record);
		assertBug(false, `Unexpected special function type '${type}'`);
	},

	/**
	 * Serialize `require()` function. Throws error.
	 * @param {Object} info - Special function details
	 * @param {string} info.path - File path where `require` function created
	 * @returns {undefined}
	 * @throws {Error} - Error
	 */
	serializeRequireFunction(info) {
		throw new Error(`Cannot serialize \`require\` or \`import\` (in ${info.path})`);
	},

	/**
	 * Serialize local `eval` shim function.
	 * This is a hacky implementation to substitute local `eval` shim functions which are
	 * created for each file with global `eval`.
	 * @param {Function} fn - Local `eval` shim function
	 * @returns {Object} - Special placeholder signal
	 */
	serializeEvalFunction(fn) {
		// Delete record for `eval` shim
		this.records.set(fn);

		// Serialize global `eval` (if not already serialized)
		let {evalRecord} = this;
		if (!evalRecord) {
			evalRecord = this.serializeValueInner(eval, 'eval'); // eslint-disable-line no-eval
			this.evalRecord = evalRecord;
		}

		// Return placeholder signal.
		// `serializeValueInner()` will substitute `this.evalRecord` as the returned record.
		return EVAL_PLACEHOLDER;
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
		// fn, record, node, name, numParams, isClass, isAsync, isGenerator, isArrowOrBound, isMethod
		return this.wrapFunctionWithProperties(
			fn, record, node, isCircular ? '' : `bound ${unboundFn.name}`, numParams,
			false, false, false, false, true, false
		);
	},

	/**
	 * `require('util').promisify()` returns functions.
	 * These are in Node's internal JS code, and therefore cannot be serialized.
	 * They are captured in `lib/init/module.js`.
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

		// TODO: Handle circular references
		assert(!recordIsCircular(fnRecord), 'Cannot handle circular-referenced promisified functions');

		const promisifyRecord = this.serializeValue(util.promisify);
		const node = t.callExpression(promisifyRecord.varNode, [fnRecord.varNode]);
		createDependency(record, promisifyRecord, node, 'callee');
		createDependency(record, fnRecord, node.arguments, 0);

		// TODO: Add additional properties
		return node;
	},

	/**
	 * `require('util').callbackify()` returns functions.
	 * These are in Node's internal JS code, and therefore cannot be serialized.
	 * They are captured in `lib/init/module.js`.
	 * Serialize as a call to `require('util').callbackify()` with same arg as original call.
	 *
	 * @param {Object} info - Special function details
	 * @param {Function} info.fn - Function `callbackify` was called with
	 * @param {Object} record - Record for callbackified function instance
	 * @returns {Object} - Node for callbackified function
	 */
	serializeCallbackifyFunction({fn}, record) {
		const fnVarName = record.varNode.name;
		const fnRecord = this.serializeValue(fn, `${fnVarName}Uncallbackified`, '<uncallbackified>');

		// TODO: Handle circular references
		assert(!recordIsCircular(fnRecord), 'Cannot handle circular-referenced uncallbackified functions');

		const callbackifyRecord = this.serializeValue(util.callbackify);
		const node = t.callExpression(callbackifyRecord.varNode, [fnRecord.varNode]);
		createDependency(record, callbackifyRecord, node, 'callee');
		createDependency(record, fnRecord, node.arguments, 0);

		// TODO: Add additional properties
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
		// TODO: Handle circular references
		const setRecord = this.serializeValue(info.set, 'debuglogSet', '<debuglog set argument>');
		const argumentsNodes = [setRecord.varNode];
		createDependency(record, setRecord, argumentsNodes, 0);

		const {cb} = info;
		if (cb !== undefined) {
			const cbRecord = this.serializeValue(cb, 'debuglogCb', '<debuglog cb argument>');
			argumentsNodes[1] = cbRecord.varNode;
			createDependency(record, cbRecord, argumentsNodes, 1);
		}

		const debuglogRecord = this.serializeValue(util.debuglog);
		const node = t.callExpression(debuglogRecord.varNode, argumentsNodes);
		createDependency(record, debuglogRecord, node, 'callee');

		// TODO: Add additional properties
		return node;
	},

	wrapFunctionWithProperties(
		fn, record, node, name, numParams,
		isClass, isClassWithSuperClass, isAsync, isGenerator, isArrowOrBound, isMethod
	) {
		// Set default `length` + `name` properties based on function definition
		const defaultProps = [
			{name: 'length', value: numParams, writable: false, enumerable: false, configurable: true},
			{name: 'name', value: name, writable: false, enumerable: false, configurable: true}
		];

		// Get `prototype` property and set default `prototype` prop
		const defaultProto = isGenerator
			? isAsync ? AsyncGeneratorPrototype : GeneratorPrototype
			: isAsync ? AsyncFunctionPrototype : Function.prototype;

		const proto = Object.getOwnPropertyDescriptor(fn, 'prototype')?.value;
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

			// Set default `prototype` property
			defaultProps[2] = {
				name: 'prototype', value: protoValue, writable: !isClass, enumerable: false, configurable: false
			};
		}

		// Flag prototype as prototype
		if (proto) this.prototypes.set(proto, protoValue ? record : null);

		// Wrap with properties
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
			// Classes with super class are defined with `extends null`
			const defaultProtoProto = isClassWithSuperClass ? null : Object.prototype;

			let protoIsAltered = false;
			const propNames = Object.getOwnPropertyNames(proto);
			if (propNames.length !== 1 || Object.getOwnPropertySymbols(proto).length !== 0) {
				protoIsAltered = true;
			} else if (propNames[0] !== 'constructor') {
				protoIsAltered = true;
			} else if (Object.getPrototypeOf(proto) !== defaultProtoProto) {
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
						proto, protoRecord, null, defaultProtoProto,
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

				const {node, container, key} = path;
				// eslint-disable-next-line no-shadow
				const dependency = deleteFirst(dependencies, dependency => dependency.record.varNode === node),
					dependencyRecord = dependency.record,
					{dependents} = dependencyRecord;
				deleteFirst(dependents, dependent => dependent.node === container && dependent.key === key);

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

/**
 * Check if identifier is being used as a variable.
 * true: `a`, `a = 1`, `a++`, `{}[a]`, `{}?.[a]`, `function a() {}`,
 *   `{ [a]: 1 }`, `{ [a]() {} }`, `class { [a]() {} }`
 * false: `{}.a`, `{}?.a`, `{a: 1}`, `{ a() {} }`, `class { a() {} }`,
 *   `a: while (0) {}`, `continue a`, `break a`, `import.meta`
 *
 * @param {Object} path - Babel path object for identifier
 * @returns {boolean} - `true` if is used as a variable
 */
function identifierIsVariable(path) {
	const {parentPath} = path;
	return !(parentPath.isMemberExpression({computed: false}) && path.key === 'property')
		&& !(parentPath.isOptionalMemberExpression({computed: false}) && path.key === 'property')
		&& !(parentPath.isObjectProperty({computed: false}) && path.key === 'key')
		&& !(parentPath.isObjectMethod({computed: false}) && path.key === 'key')
		&& !(parentPath.isClassMethod({computed: false}) && path.key === 'key')
		&& !(parentPath.isPrivateName())
		&& !(parentPath.isLabeledStatement() && path.key === 'label')
		&& !(parentPath.isContinueStatement() && path.key === 'label')
		&& !(parentPath.isBreakStatement() && path.key === 'label')
		&& !parentPath.isMetaProperty();
}

/**
 * Get error message from error.
 * Handle any input and try to avoid any side-effects.
 * Always returns a non-empty string.
 * @param {*} err - Error thrown
 * @returns {string} - Error message
 */
function getErrorMessage(err) {
	if (err == null) return 'Unknown error';

	try {
		const desc = Object.getOwnPropertyDescriptor(err, 'message');
		return desc?.value || 'Unknown error';
	} catch {
		return 'Unknown error';
	}
}
