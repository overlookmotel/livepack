/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	{parse} = require('@babel/parser'),
	traverse = require('@babel/traverse').default,
	{isString} = require('is-it-type'),
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const tracker = require('../tracker.js'),
	{boundFunctions} = require('../init.js'),
	{
		identifierIsVariable, TRACKER_COMMENT_PREFIX, GeneratorPrototype, AsyncGeneratorPrototype
	} = require('../shared.js'),
	{
		createRecord, createFile, createBlock, createScope, createDependency, createAssignment
	} = require('./records.js'),
	{isJsIdentifier, recordIsCircular} = require('./utils.js'),
	{createArguments, createBinding} = require('./external.js');

// Exports

const functionToString = Function.prototype.toString,
	objectToString = Object.prototype.toString,
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
				node: fnNode, externalVars, internalVars, functionNames,
				numParams, isClass, isGenerator, isArrow, isAsync
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
				numParams,
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
			fn, record, t.identifier('x'), fnName,
			fnDef.numParams, isClass, isGenerator, fnDef.isArrow, fnDef.isAsync
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
			numParams, false, false, true, false
		);
	},

	wrapFunctionWithProperties(fn, record, node, name, numParams, isClass, isGenerator, isArrow, isAsync) {
		// Determine if `.name` + `.length should be set, or delete if deleted
		const descriptors = Object.getOwnPropertyDescriptors(fn);
		function shouldExclude(propName, expectedValue) {
			const descriptor = descriptors[propName];
			if (descriptor) {
				if (descriptor.value !== expectedValue) return false; // This check catches getter/setters too
				return !descriptor.writable && !descriptor.enumerable && descriptor.configurable;
			}

			// Prop deleted - add assignment `delete fn.<propName>`
			createAssignment(
				record, t.unaryExpression('delete', t.memberExpression(record.varNode, t.identifier(propName)))
			);
			return false;
		}

		const excludeName = shouldExclude('name', name),
			excludeLength = shouldExclude('length', numParams);

		// Wrap with properties (including prototype)
		node = this.wrapWithProperties(
			fn, record, node,
			key => (
				key === 'arguments' || key === 'caller'
				|| (key === 'name' && excludeName)
				|| (key === 'length' && excludeLength)
			),
			(key) => {
				if (key === 'prototype') return {writable: true, enumerable: false, configurable: false};
				if (key === 'name' || key === 'length') {
					return {writable: false, enumerable: false, configurable: true};
				}
				return null;
			}
		);

		// Set var name for `.prototype`
		const protoDescriptor = descriptors.prototype;
		let proto, protoRecord;
		if (protoDescriptor) {
			proto = protoDescriptor.value;
			protoRecord = this.records.get(proto);
			if (protoRecord) this.setPrototypeVarName(protoRecord, record);
		}

		// If prototype is unchanged from what JS creates, remove it from props
		if (
			!isArrow && (!isAsync || isGenerator)
			&& functionHasStandardPrototype(fn, proto, isClass, isGenerator, isAsync)
		) {
			if (!recordIsCircular(protoRecord)) {
				const {fnNode, protoNode} = this.convertPrototype(
					fn, record, node, proto, protoRecord, protoRecord.node, isGenerator, false
				);
				node = fnNode;
				protoRecord.node = protoNode;
			} else {
				this.prototypes.set(proto, {fn, record, isGenerator});
			}
		}

		// Return wrapped function node
		return node;
	},

	convertPrototype(fn, fnRecord, fnNode, proto, protoRecord, protoNode, isGenerator, protoIsReferenced) {
		// TODO
		/*
		console.log('convertPrototype:', {
			fn, fnRecord, fnNode, proto, protoRecord, protoNode, isGenerator, protoIsReferenced
		});

		console.log('protoNode:');
		console.dir(protoNode, {depth: 5});

		console.log('fnNode:');
		console.dir(fnNode, {depth: 8});
		*/

		// Remove prototype from function
		const {records} = this;
		const definePropertiesRecord = records.get(Object.defineProperties);

		let removeFnAssignment;
		if (t.isIdentifier(fnNode)) {
			// Function does not have added props at definition - prototype must be assigned later
			removeFnAssignment = true;
		} else {
			assert(t.isCallExpression(fnNode));
			if (definePropertiesRecord && fnNode.callee === definePropertiesRecord.varNode) {
				// `Object.defineProperties(x, { ... })`
				const args = fnNode.arguments,
					{properties} = args[1];
				const protoIsDeleted = deletePrototypeProperty(properties, fnRecord, protoRecord, true);
				assert(protoIsDeleted);

				if (properties.length === 0) {
					deleteGlobalDependency(
						Object.defineProperties, fnRecord, definePropertiesRecord, fnNode, 'callee', records
					);
					fnNode = fnNode.arguments[0];
				} else {
					// Convert to `Object.assign()` if all remaining props have standard descriptors
					const descriptorsAreNotRequired = !properties.find((propNode) => {
						const keyNode = propNode.key;
						if (
							t.isIdentifier(keyNode) && !propNode.computed
							&& (keyNode.name === 'name' || keyNode.name === 'length')
						) return true;

						const descriptorPropNodes = propNode.value.properties;
						return descriptorPropNodes.length !== 1
							|| descriptorPropNodes[0].key.name !== 'value';
					});

					if (descriptorsAreNotRequired) {
						// Replace `Object.defineProperties` with `Object.assign`
						const objectAssignRecord = this.serializeValue(Object.assign);
						fnNode.callee = objectAssignRecord.varNode;

						deleteGlobalDependency(
							Object.defineProperties, fnRecord, definePropertiesRecord, fnNode, 'callee', records
						);
						createDependency(fnRecord, objectAssignRecord, fnNode, 'callee');

						// Convert `{x: {value: foo}, y: {value: bar}}` to `{x: foo, y: bar}`
						const fnDependencies = fnRecord.dependencies;
						for (const propNode of properties) {
							const descriptorPropNode = propNode.value.properties[0],
								valNode = descriptorPropNode.value;
							propNode.value = valNode;

							if (t.isIdentifier(valNode)) {
								const dependency = fnDependencies.find(({record: {varNode}}) => varNode === valNode);
								const dependent = dependency.record.dependents.find(
									({node, key}) => node === descriptorPropNode && key === 'value'
								);
								dependent.node = propNode;
							}
						}
					}
				}

				removeFnAssignment = false;
			} else {
				// `Object.assign(x, { ... })` - placeholder for `prototypes`, assigned later
				const objectAssignRecord = records.get(Object.assign);
				assert(objectAssignRecord && fnNode.callee === objectAssignRecord.varNode);

				const propNodes = fnNode.arguments[1].properties;
				const protoIsDeleted = deletePrototypeProperty(propNodes, fnRecord, protoRecord, false);

				if (protoIsDeleted) {
					if (propNodes.length === 0) {
						deleteGlobalDependency(
							Object.assign, fnRecord, objectAssignRecord, fnNode, 'callee', records
						);
						fnNode = fnNode.arguments[0];
					}

					removeFnAssignment = false;
				} else {
					removeFnAssignment = true;
				}
			}
		}

		// Remove `prototype`'s later assignment
		if (removeFnAssignment) {
			assert(fnRecord.assignments.length === 1);
			const assignment = fnRecord.assignments[0],
				assignmentNode = assignment.node;
			assert(
				t.isCallExpression(assignmentNode)
				&& assignmentNode.callee === definePropertiesRecord.varNode
			);

			const {properties} = assignmentNode.arguments[1];
			const protoIsDeleted = deletePrototypeProperty(properties, assignment, protoRecord, true);
			assert(protoIsDeleted);

			if (properties.length === 0) {
				deleteGlobalDependency(
					Object.defineProperties, assignment, definePropertiesRecord, assignmentNode, 'callee', records
				);

				fnRecord.assignments = undefined;
			}
		}

		if (!isGenerator) {
			// Remove constructor from prototype
			let removeProtoAssignment;
			if (t.isObjectExpression(protoNode)) {
				assert(protoNode.properties.length === 0); // TODO May fail if prototype has other properties
				removeProtoAssignment = true;
			} else {
				assert(t.isCallExpression(protoNode));
				const objectAssignRecord = records.get(Object.assign);
				const {callee} = protoNode;
				if (objectAssignRecord && callee === objectAssignRecord.varNode) {
					// `Object.assign()`
					// TODO
					throw new Error('Not implemented yet');
				} else {
					// `Object.create()`
					const objectCreateRecord = records.get(Object.create);
					assert(objectCreateRecord && callee === objectCreateRecord.varNode);

					// Delete `constructor` from `prototype` definition
					const args = protoNode.arguments;
					const propNode = args[1].properties.shift();
					assert(propIsNamedIdentifier(propNode, 'constructor'));
					const valuePropNode = propNode.value.properties[0];
					assert(propIsNamedIdentifier(valuePropNode, 'value'));

					assert(valuePropNode.value === fnRecord.varNode);
					deleteDependency(protoRecord, fnRecord, valuePropNode, 'value');

					// Remove dependencies for prototype creation
					const objectPrototypeRecord = records.get(Object.prototype);
					// TODO This could be another value if prototype inherits from another prototype
					assert(objectPrototypeRecord && args[0] === objectPrototypeRecord.varNode);

					deleteGlobalDependency(Object.prototype, protoRecord, objectPrototypeRecord, args, 0, records);

					assert(args[1].properties.length === 0); // TODO Will fail if proto has other props

					deleteGlobalDependency(
						Object.create, protoRecord, objectCreateRecord, protoNode, 'callee', records
					);

					removeProtoAssignment = false;
				}
			}

			if (removeProtoAssignment) {
				assert(protoRecord.assignments.length === 1);
				const assignment = protoRecord.assignments[0],
					assignmentNode = assignment.node;
				assert(
					t.isCallExpression(assignmentNode)
				&& definePropertiesRecord && assignmentNode.callee === definePropertiesRecord.varNode
				);

				const {properties} = assignmentNode.arguments[1];
				deleteConstructorProperty(properties, assignment, fnRecord);

				if (properties.length === 0) {
					deleteGlobalDependency(
						Object.defineProperties, assignment, definePropertiesRecord, assignmentNode, 'callee', records
					);

					protoRecord.assignments = undefined;
				}
			}
		}

		// Substitute `fn.prototype` for current definition of prototype
		if (!protoIsReferenced && protoRecord.dependents.length === 0) {
			// Prototype is not referenced - delete its record
			records.delete(proto);

			// Record in `prototypes` so if prototype is accessed later, it will be created as `fn.prototype`
			this.prototypes.set(proto, {fn, record: fnRecord});
		} else {
			protoNode = this.createPrototypeNode(fnRecord, protoRecord);
		}

		/*
		// TODO Delete this code - no longer used.
		let ctorDependentNode, ctorDependentKey; // eslint-disable-line no-unreachable

		let removeProtoAssignment, protoHasOtherProps;
		if (t.isObjectExpression(protoNode)) {
			const {properties} = protoNode;
			properties.shift();
			protoHasOtherProps = properties.length !== 0;
			removeProtoAssignment = true;
		} else {
			assert(t.isCallExpression(protoNode), 'Unexpected node type for prototype');
			if (protoNode.callee === (records.get(Object.assign) || {}).varNode) {
				// `Object.assign()`
				// TODO
				throw new Error('No implemented yet');
			} else {
				// `Object.create`
				// TODO
				throw new Error('No implemented yet');
			}
		}

		// Remove constructor from assignments
		let protoHasOtherAssignments;
		if (removeProtoAssignment) {
			const assignment = protoRecord.assignments[0];
			const assignmentNode = assignment.node;
			assert(
				t.isCallExpression(assignmentNode)
				&& assignmentNode.callee === (records.get(Object.defineProperties) || {}).varNode
			);

			const [arg1, arg2] = assignmentNode.arguments;
			assert(arg1 === protoRecord.varNode);
			assert(t.isObjectExpression(arg2));
			const {properties} = arg2;
			assert(t.isIdentifier(properties[0].key) && properties[0].key.name === 'constructor');
			ctorDependentNode = properties[0].value.properties[0];
			ctorDependentKey = 'value';
			assert(ctorDependentNode.value === fnRecord.varNode);
			properties.shift();
			protoHasOtherAssignments = properties.length !== 0;

			const {dependencies} = assignment;
			assert(dependencies[1].record === fnRecord);
			dependencies.splice(1, 1);
		}

		deleteFirst(
			fnRecord.dependents,
			dependent => dependent.node === ctorDependentNode && dependent.key === ctorDependentKey
		);
		*/

		return {fnNode, protoNode};
	},

	createPrototypeNode(fnRecord, protoRecord) {
		const protoNode = t.memberExpression(fnRecord.varNode, t.identifier('prototype'));
		createDependency(protoRecord, fnRecord, protoNode, 'object');
		return protoNode;
	},

	setPrototypeVarName(protoRecord, fnRecord) {
		protoRecord.varNode.name = `${fnRecord.varNode.name}Prototype`;
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

function propIsNamedIdentifier(propNode, name) {
	if (propNode.computed) return false;
	const keyNode = propNode.key;
	return t.isIdentifier(keyNode) && keyNode.name === name;
}

function deletePrototypeProperty(properties, dependencyRecord, protoRecord, isDescriptor) {
	const index = properties.findIndex(propNode => propIsNamedIdentifier(propNode, 'prototype'));
	if (index === -1) return false;

	const propNode = properties.splice(index, 1)[0];

	const protoDependentNode = isDescriptor ? propNode.value.properties[0] : propNode;
	assert(protoDependentNode.value === protoRecord.varNode);
	deleteDependency(dependencyRecord, protoRecord, protoDependentNode, 'value');

	return true;
}

function deleteConstructorProperty(properties, dependencyRecord, fnRecord) {
	const propNode = properties.shift();
	assert(propIsNamedIdentifier(propNode, 'constructor'));

	const fnDependentNode = propNode.value.properties[0];
	assert(fnDependentNode.value === fnRecord.varNode);
	deleteDependency(dependencyRecord, fnRecord, fnDependentNode, 'value');
}

function deleteGlobalDependency(global, srcRecord, globalRecord, node, key, records) {
	// Delete dependency on global
	deleteDependency(srcRecord, globalRecord, node, key);

	// If this global is no longer used, disconnect it from parent and delete record.
	// e.g. if `Object.assign` no longer used, remove `dependent` on `Object`'s record
	// and delete `Object.assign`'s record.
	if (globalRecord.dependents.length === 0) {
		const globalNode = globalRecord.node;
		deleteFirst(
			globalRecord.dependencies[0].record.dependents,
			dependent => dependent.node === globalNode && dependent.key === 'object'
		);

		records.delete(global);
	}
}

function deleteDependency(srcRecord, dependencyRecord, node, key) {
	deleteFirst(srcRecord.dependencies, dependency => dependency.record === dependencyRecord);
	deleteFirst(
		dependencyRecord.dependents,
		dependent => dependent.node === node && dependent.key === key
	);
}

function deleteFirst(arr, fn) {
	const index = arr.findIndex(fn);
	assert(index >= 0);
	return arr.splice(index, 1)[0];
}

function functionHasStandardPrototype(fn, proto, isClass, isGenerator, isAsync) {
	// Check prototype is an object
	if (!proto || typeof proto !== 'object') return false;

	// Check prototype not overridden.
	// NB For standard functions, prototype inheriting from another prototype is fine.
	if (
		objectToString.call(proto) !== (
			isGenerator // eslint-disable-line no-nested-ternary
				? (isAsync ? '[object AsyncGenerator]' : '[object Generator]')
				: '[object Object]'
		)
	) return false;

	// Check prototype descriptor has unaltered `writable` prop
	// NB `enumerable` + `configurable` cannot be changed
	const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
	if (prototypeDescriptor.writable === isClass) return false;

	// Generators have no `prototype.constructor`
	if (isGenerator) return true;

	// Check constructor refers back to function
	const ctorDescriptor = Object.getOwnPropertyDescriptor(proto, 'constructor');
	if (ctorDescriptor.value !== fn) return false;

	// Check constructor has unaltered descriptor props
	if (
		!ctorDescriptor.writable || ctorDescriptor.enumerable || !ctorDescriptor.configurable
	) return false;

	// Check constructor is first property
	if (Object.getOwnPropertyNames(proto)[0] !== 'constructor') return false;

	return true;
}

/**
 * Determine if function has an unaltered prototype.
 * TODO Delete this function - no longer used.
 * @param {Function} fn - Function
 * @param {boolean} isClass - `true` if is a class
 * @returns {boolean} - `true` if prototype is unaltered
 */
function functionHasUnalteredPrototype(fn, isClass) { // eslint-disable-line no-unused-vars
	// Check prototype is defined and plain object
	// NB `prototype` cannot be deleted, so its existence doesn't need to be checked for
	const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
	const prototype = prototypeDescriptor.value;
	if (!prototype || Object.getPrototypeOf(prototype) !== Object.prototype) return false;

	// Check prototype descriptor has unaltered `writable` prop
	// NB `enumerable` + `configurable` cannot be changed
	if (prototypeDescriptor.writable === isClass) return false;

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
 * TODO Delete this function - no longer used.
 * @param {Function} fn - Function
 * @param {boolean} isAsync - `true` if is an async generator
 * @returns {boolean} - `true` if prototype is unaltered
 */
function generatorHasUnalteredPrototype(fn, isAsync) { // eslint-disable-line no-unused-vars
	// Check has prototype
	const prototypeDescriptor = Object.getOwnPropertyDescriptor(fn, 'prototype');
	if (!prototypeDescriptor) return false;

	// Check prototype is defined and inherits GeneratorPrototype / AsyncGeneratorPrototype
	const prototype = prototypeDescriptor.value;
	if (!prototype) return false;
	if (
		Object.getPrototypeOf(prototype) !== (isAsync ? AsyncGeneratorPrototype : GeneratorPrototype)
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
	const isArrow = t.isArrowFunctionExpression(node);
	const fnName = (Object.getOwnPropertyDescriptor(fn, 'name') || {}).value;
	const idNode = !isArrow && isString(fnName) && isJsIdentifier(fnName) ? t.identifier(fnName) : null;

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
		if (!isArrow) node.id = idNode;
	}

	// Determine what value of `fn.length` will be
	let numParams = 0;
	for (const paramNode of node.params) {
		if (t.isRestElement(paramNode) || t.isAssignmentPattern(paramNode)) break;
		numParams++;
	}

	// Return AST for function + external + internal vars objects + function names set
	return {
		node,
		externalVars,
		internalVars,
		functionNames,
		numParams,
		isClass,
		isGenerator: !!node.generator,
		isArrow,
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
