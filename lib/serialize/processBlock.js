/* --------------------
 * livepack module
 * Process block (holding scopes)
 * ------------------*/

'use strict';

// Modules
const assert = require('simple-invariant'),
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const {createRecord, createDependency, createAssignment} = require('./records.js'),
	{setAddFrom, replaceRecordNode} = require('./utils.js');

// Exports

module.exports = function processBlock(block, parentCreateScopes, inheritedVars, frozenNames, isRoot) {
	const returnNodes = [];

	// Init local vars object to contain all var nodes for local vars
	// so they can have names changed if necessary
	const {paramNames} = block;
	const localVars = Object.create(null);
	for (const paramName of paramNames) {
		localVars[paramName] = [];
	}

	// Function to create functions to inject values into scope
	const injectionIndexes = Object.create(null);
	const injectionVarNodes = Object.create(null);
	function createInjection(paramName) {
		let index = injectionIndexes[paramName];
		if (index !== undefined) return index;

		const inputParamNode = t.identifier(`_${paramName}`);
		const outputParamNode = t.identifier(paramName);
		injectionVarNodes[paramName] = inputParamNode;
		localVars[paramName].push(outputParamNode);

		const injectNode = t.arrowFunctionExpression(
			[inputParamNode],
			t.assignmentExpression('=', outputParamNode, inputParamNode)
		);

		index = returnNodes.length;
		injectionIndexes[paramName] = index;
		returnNodes.push(injectNode);
		return index;
	}

	// Create scopes
	const blockScopes = block.scopes;
	for (const scope of blockScopes.values()) {
		// Create node for calling createScope function to create scope object
		const createScopeRecord = parentCreateScopes.get(scope.parent);

		const argumentNodes = [];
		const callNode = t.callExpression(createScopeRecord.varNode, argumentNodes);
		const scopeRecord = scope.record;
		scopeRecord.node = callNode;

		// Link scope object to createScope function
		createDependency(scopeRecord, createScopeRecord, callNode, 'callee');

		// Get parameters
		const {values} = scope,
			undefinedRecord = this.serializeValue(undefined),
			undefinedIndexes = [];
		let numTrailingUndefined = 0;
		let paramIndex = 0;
		for (const paramName of paramNames) {
			const valProps = values[paramName];
			let node;
			if (!valProps) {
				// Value not required - insert `undefined` as empty value
				node = undefinedRecord.varNode;
				undefinedIndexes.push(paramIndex);
				numTrailingUndefined++;
			} else {
				const valRecord = valProps.record;
				node = valRecord.varNode;
				let {isCircular} = valProps;

				// Check if value or its dependencies are functions in this scope or above
				if (!isCircular) {
					isCircular = (function referencesSameScopeOrDeeper(depRecord) {
						// If value is a function, and it's in this scope or one nested within it,
						// needs to be injected later. Flag as circular if so.
						// NB `.scope` property is only set for functions.
						let fnScope = depRecord.scope;
						if (fnScope) {
							do {
								if (fnScope === scope) return true;
								fnScope = fnScope.parent;
							} while (fnScope);
						}

						// Iterate through value's dependencies too
						const {dependencies} = depRecord;
						if (dependencies) {
							for (const dependency of dependencies) {
								if (referencesSameScopeOrDeeper(dependency.record)) return true;
							}
						}

						return false;
					}(valRecord));
				}

				if (isCircular) {
					// Circular reference - inject into scope later
					const injectionIndex = createInjection(paramName);

					// Create var for inject function for this scope.
					// Each var will only be injected once into each scope, so no need to guard against
					// duplicate inject function vars being created.
					const injectRecord = createRecord(
						`inject${upperFirst(paramName)}Into${upperFirst(scopeRecord.varNode.name)}`
					);

					const injectFnNode = t.memberExpression(
						scopeRecord.varNode,
						t.numericLiteral(injectionIndex),
						true
					);
					injectRecord.node = injectFnNode;

					createDependency(injectRecord, scopeRecord, injectFnNode, 'object');

					// Create assignment
					const argumentsNode = [node];
					const assignmentNode = t.callExpression(injectRecord.varNode, argumentsNode);
					const assignment = createAssignment(scopeRecord, assignmentNode);
					createDependency(assignment, injectRecord, assignmentNode, 'callee');
					createDependency(assignment, valRecord, argumentsNode, 0);

					// Insert `undefined` as empty value
					node = undefinedRecord.varNode;
					undefinedIndexes.push(paramIndex);
					numTrailingUndefined++;
				} else if (valRecord === undefinedRecord) {
					undefinedIndexes.push(paramIndex);
					numTrailingUndefined++;
				} else {
					createDependency(scopeRecord, valRecord, argumentNodes, paramIndex);
					numTrailingUndefined = 0;
				}
			}

			argumentNodes[paramIndex] = node;
			paramIndex++;
		}

		// Trim off any trailing undefined params
		if (numTrailingUndefined > 0) {
			argumentNodes.length -= numTrailingUndefined;
			undefinedIndexes.length -= numTrailingUndefined;
		}

		// Create dependencies for `undefined`
		for (const paramIndex of undefinedIndexes) { // eslint-disable-line no-shadow
			createDependency(scopeRecord, undefinedRecord, argumentNodes, paramIndex);
		}
	}

	// Determine if can output a singular value rather than an array
	// NB Root function always returns an array - it will be destructured in `serializeMain()`
	const {functions: blockFunctions, children: childBlocks} = block;
	let index = returnNodes.length;

	const isSingular = !isRoot
		&& index + blockFunctions.length + childBlocks.length === 1;

	// Add block's frozen names to those inherited from above
	const blockFrozenNames = block.frozenNames;
	if (blockFrozenNames.size !== 0) frozenNames = new Set([...frozenNames, ...blockFrozenNames]);

	// Create functions
	const globalVarNames = new Set(),
		reservedVarNames = new Set();
	for (const {
		node, scopes: fnScopes, externalVars, internalVars, globalVarNames: fnGlobalVarNames, functionNames,
		containsEval
	} of blockFunctions) {
		for (const [scope, fnRecord] of fnScopes) {
			const scopeRecord = scope.record;

			let fnNode;
			if (isSingular) {
				// Will output singular function rather than array.
				// The scope object is defunct - can go direct to createScope function.

				// Copy over `createScope(...)` node created above
				fnNode = scopeRecord.node;
				scopeRecord.node = null;

				// Transfer dependencies from scope object to function instance
				const {dependencies} = fnRecord,
					scopeDependencies = scopeRecord.dependencies;
				for (const dependency of scopeDependencies) {
					dependencies.push(dependency);
					for (const dependent of dependency.record.dependents) {
						if (dependent.record === scopeRecord) dependent.record = fnRecord;
					}
				}
				scopeDependencies.length = 0;
			} else {
				// Will output array - link function instance to scope object
				fnNode = t.memberExpression(
					scopeRecord.varNode,
					t.numericLiteral(index),
					true
				);

				createDependency(fnRecord, scopeRecord, fnNode, 'object');
			}

			// Replace placeholder var with reference to scope var
			replaceRecordNode(fnRecord, fnNode);
		}

		// Add var nodes to globals/locals
		const fnReservedVarNames = new Set();
		for (const varName in externalVars) {
			const localVarNodes = localVars[varName];
			if (localVarNodes) {
				// Local var
				localVarNodes.push(...externalVars[varName]);
			} else {
				// Var referencing upper scope
				inheritedVars[varName].push(...externalVars[varName]);
			}

			// If var name is frozen, prevent an internal var taking same name
			if (frozenNames.has(varName)) fnReservedVarNames.add(varName);
		}

		// Add global vars to globals
		for (const varName of fnGlobalVarNames) {
			globalVarNames.add(varName);
			fnReservedVarNames.add(varName);
		}

		// Add function names to reserved var names
		// Function names treated differently from internal vars as not renaming them,
		// but still need to make sure other vars don't clash with function names
		for (const fnName of functionNames) {
			reservedVarNames.add(fnName);
			fnReservedVarNames.add(fnName);
		}

		// Rename internal vars
		// Names avoid clashing with internal and globals vars used within this function
		const transformVarName = containsEval
			? name => name
			: this.createVarNameTransform(fnReservedVarNames);
		for (const varName in internalVars) {
			const newName = transformVarName(varName);
			if (newName !== varName) {
				for (const varNode of internalVars[varName]) {
					varNode.name = newName;
				}
			}

			reservedVarNames.add(newName);
		}

		// Return function definition (as function/class expression)
		returnNodes[index++] = node;
	}

	const nextInheritedVars = Object.assign(Object.create(null), inheritedVars, localVars);

	// Create `createScope()` functions for child blocks
	for (const childBlock of childBlocks) {
		const createScopes = new Map();
		for (const scope of blockScopes.values()) {
			const scopeRecord = scope.record;
			const createScopeName = `createScope${upperFirst(childBlock.name)}`;

			if (isSingular) {
				// Will output singular createScope function.
				// Repurpose the scope object created above as the createScope function.
				// NB No need to do dependency linking - already done above.
				scopeRecord.varNode.name = createScopeName;
				createScopes.set(scope, scopeRecord);
			} else {
				// Will output array of functions - createScope function will be a element of scope array.
				const createScopeRecord = createRecord(createScopeName);

				const createScopeNode = t.memberExpression(
					scopeRecord.varNode,
					t.numericLiteral(index),
					true
				);
				createScopeRecord.node = createScopeNode;

				createDependency(createScopeRecord, scopeRecord, createScopeNode, 'object');

				createScopes.set(scope, createScopeRecord);
			}
		}

		const {
			node: childNode, globalVarNames: childGlobalVarNames, reservedVarNames: childReservedVarNames
		} = this.processBlock(childBlock, createScopes, nextInheritedVars, frozenNames, false);
		setAddFrom(globalVarNames, childGlobalVarNames);
		setAddFrom(reservedVarNames, childReservedVarNames);

		returnNodes[index++] = childNode;
	}

	// Rename params
	const transformVarName = this.createVarNameTransform(
		new Set([...globalVarNames, ...reservedVarNames, ...frozenNames])
	);

	const paramNodes = [];
	const {mangle} = this.options;
	let frozenThisVarName, frozenArgumentsVarName;
	for (const paramName of paramNames) {
		let newName;
		const injectionVarNode = injectionVarNodes[paramName];
		if (!blockFrozenNames.has(paramName)) {
			newName = transformVarName(paramName);
			if (newName !== paramName) {
				// Rename all nodes
				for (const varNode of localVars[paramName]) {
					varNode.name = newName;
				}

				// Rename injection node
				if (injectionVarNode) {
					injectionVarNode.name = mangle // eslint-disable-line no-nested-ternary
						? (newName === 'a' ? 'b' : 'a')
						: `_${newName}`;
				}
			}
		} else {
			// Frozen var name (potentially used in `eval()`)
			// eslint-disable-next-line no-lonely-if
			if (paramName === 'this' || (paramName === 'arguments' && block.argNames)) {
				// `this` or `arguments` captured from function
				// (check for `argNames` above is to make sure `arguments` isn't a user-defined var here)
				newName = transformVarName(paramName);
				if (paramName === 'this') {
					frozenThisVarName = newName;
				} else {
					frozenArgumentsVarName = newName;
				}

				assert(!injectionVarNode, 'Cannot handle redefined `arguments` in function containing `eval()`');
			} else {
				newName = paramName;

				// Rename injection node
				if (injectionVarNode && mangle) injectionVarNode.name = newName === 'a' ? 'b' : 'a';
			}
		}

		reservedVarNames.add(newName);

		paramNodes.push(t.identifier(newName));
	}

	// Create block function - will return either array of functions or single function
	let returnNode = isSingular ? returnNodes[0] : t.arrayExpression(returnNodes);

	// If uses frozen `this` or `arguments`, wrap return value in an IIFE
	// to inject these values as actual `this` / `arguments`.
	// `() => eval(x)` -> `(function() { return () => eval(x); }).apply(this$0, arguments$0)`
	// TODO In non-strict mode, it's possible for `arguments` to be re-defined as a non-iterable object
	// which would cause an error when this function is called.
	// A better solution when outputting non-strict code would be to just use a var called `arguments`,
	// rather than injecting. Of course this isn't possible in ESM.
	if (frozenThisVarName || frozenArgumentsVarName) {
		const callArgsNodes = [];
		let functionNode;
		if (frozenThisVarName) {
			functionNode = t.functionExpression(null, [], t.blockStatement([t.returnStatement(returnNode)]));
			callArgsNodes[0] = t.identifier(frozenThisVarName);
		} else {
			functionNode = t.arrowFunctionExpression([], returnNode);
			callArgsNodes[0] = t.numericLiteral(0);
		}

		if (frozenArgumentsVarName) callArgsNodes[1] = t.identifier(frozenArgumentsVarName);

		returnNode = t.callExpression(
			t.memberExpression(
				functionNode,
				t.identifier(frozenArgumentsVarName ? 'apply' : 'call')
			),
			callArgsNodes
		);
	}

	const node = t.arrowFunctionExpression(paramNodes, returnNode);

	// Return block function node, global var names + reserved var names
	return {node, globalVarNames, reservedVarNames};
};
