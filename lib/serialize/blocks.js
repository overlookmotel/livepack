/* --------------------
 * livepack module
 * Process blocks (holding scopes)
 * ------------------*/

'use strict';

// Modules
const assert = require('simple-invariant'),
	upperFirst = require('lodash/upperFirst'),
	t = require('@babel/types');

// Imports
const {
		createRecord, createDependency, createAssignment, createBlock, createScope
	} = require('./records.js'),
	{addStrictDirectiveToFunction} = require('./strict.js'),
	{
		replaceRecordNode, getNodeWithinWrapperParent, setAddFrom, firstMapValue, deleteFirst
	} = require('./utils.js');

// Exports

module.exports = {
	initBlocks() {
		const rootBlock = createBlock(0, 'root', null);
		this.rootBlock = rootBlock;
		this.rootScope = createScope(null, rootBlock, null);
		this.rootStrictFnRecords = [];
		this.rootSloppyFnRecords = [];
	},

	processBlocks() {
		// Create scopes and functions
		const {rootBlock, rootScope} = this;
		createMissingScopes(rootBlock, null);

		const createScopeRecord = createRecord('createScopeRoot');
		const {node: blockNode, globalVarNames: functionsGlobalVarNames} = this.processBlock(
			rootBlock, () => createScopeRecord, Object.create(null), new Set(), true
		);
		const {elements} = blockNode.body;

		this.globalVarNames.push(...functionsGlobalVarNames);

		// Flatten out contents of root scope
		const rootScopeRecord = rootScope.record;
		for (const {record: dependentRecord} of rootScopeRecord.dependents) {
			// Substitute root scope calls for functions
			replaceRecordNode(dependentRecord, elements.shift());

			dependentRecord.dependencies = dependentRecord.dependencies.filter(
				dependency => dependency.record !== rootScopeRecord
			);
		}
	},

	processBlock(block, getParentCreateScopeRecord, inheritedVars, frozenNames, isRoot) {
		const returnNodes = [];

		// Init param objects and add frozen param names to `frozenNames`
		const {containsEval} = block,
			paramsByName = Object.create(null);
		let frozenNamesIsCloned = false;
		const params = [...block.params].map(([name, {isFrozenName}]) => {
			if (containsEval) isFrozenName = true;
			const param = {
				name,
				isFrozenName,
				// Identifier nodes referring to this param
				localVarNodes: [],
				// If param always contains another function defined in this block,
				// function definition and array of function records
				fnDef: null,
				fnRecords: null,
				// Set to `true` if param does not always contain another function defined in this block
				isNotLocalFunction: false,
				// Count of scopes which define a value for this param
				definedCount: 0,
				// Index of function to inject value for param in returned functions
				injectionIndex: null,
				// Node for parameter to injection function
				injectionVarNode: null
			};
			paramsByName[name] = param;

			// `super` and `new.target` are not actually frozen
			if (isFrozenName && !['super', 'new.target'].includes(name)) {
				if (!frozenNamesIsCloned) {
					frozenNames = new Set(frozenNames);
					frozenNamesIsCloned = true;
				}
				frozenNames.add(name);
			}

			return param;
		});

		// Identify scope vars which refer to functions within this scope.
		// If value of a scope var is consistently a function created within this block
		// (consistent across all scopes for this block), scope var can be set inline within scope function.
		// i.e. `(x, getX) => [getX = () => x, () => getX()]` (note `getX = `).
		// If function is not used elsewhere in code except by other functions in this block, it doesn't
		// need to be returned from the scope function at all.
		// i.e. `(x, getX) => (getX = () => x, () => getX())` (only 2nd function is returned).
		// Any other reference to a function defined in this block or blocks above is flagged as circular.
		// Also count which params are most used in calls to create scope function, so params
		// which are most often undefined (or circular, and so undefined in initial call to scope function)
		// go last.
		const {functions: blockFunctions, scopes: blockScopes, children: childBlocks} = block,
			localFunctions = new Map();
		for (const fnDef of blockFunctions) {
			for (const [scope, fnRecord] of fnDef.scopes) {
				localFunctions.set(fnRecord, {scope, fnDef});
			}
		}

		const undefinedRecord = this.serializeValue(undefined);
		let numLocalFunctions = 0;
		for (const scope of blockScopes.values()) {
			const {values} = scope;
			for (const param of params) {
				const valProps = values[param.name];
				if (!valProps) continue;

				// Flag references to functions within this block as circular and increment count where not
				const valRecord = valProps.record;
				let localFunction;
				if (valRecord === undefinedRecord) {
					// Value is undefined - treat same as unused
					values[param.name] = undefined;
				} else {
					localFunction = localFunctions.get(valRecord);
					if (localFunction) {
						valProps.isCircular = true;
					} else if (!valProps.isCircular) {
						// Check if value or its dependencies are functions in this block or above
						const isCircular = (function referencesSameScopeOrDeeper(depRecord) {
							// If value is a function, and it's in this scope or one nested within it,
							// needs to be injected later. Flag as circular if so.
							// NB: `.scope` property is only set for functions.
							let fnScope = depRecord.scope;
							if (fnScope) {
								do {
									if (fnScope.block === block) return true;
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

						if (isCircular) {
							valProps.isCircular = true;
						} else {
							param.definedCount++;
						}
					}
				}

				// Determine if param value refers to a function in this scope
				if (param.isNotLocalFunction) continue; // Already discounted

				const isLocalFunction = !!localFunction && localFunction.scope === scope;
				if (!param.fnDef) {
					if (isLocalFunction) {
						param.fnDef = localFunction.fnDef;
						param.fnRecords = [valRecord];
						numLocalFunctions++;
					} else {
						param.isNotLocalFunction = true;
					}
				} else if (isLocalFunction && param.fnDef === localFunction.fnDef) {
					param.fnRecords.push(valRecord);
				} else {
					param.isNotLocalFunction = true;
					param.fnDef = null;
					param.fnRecords = null;
					numLocalFunctions--;
				}
			}
		}

		let numInternalOnlyFunctions = 0;
		if (numLocalFunctions > 0) {
			const internalFunctions = new Set();
			for (const param of params) {
				const {fnDef} = param;
				if (!fnDef) continue;

				// Record param name containing this function in function def object
				(fnDef.internalScopeParams || (fnDef.internalScopeParams = [])).push(param);

				// Delete values for this param from all scopes.
				// Delete the dependencies created between scope record and value record for all scopes.
				const paramName = param.name;
				for (const fnRecord of param.fnRecords) {
					const {scope} = fnRecord;
					scope.values[paramName] = undefined;

					const scopeRecord = scope.record;
					deleteFirst(scopeRecord.dependencies, dependency => dependency.record === fnRecord);
					deleteFirst(
						fnRecord.dependents,
						dependent => dependent.record === scopeRecord && dependent.node === undefined
					);
				}

				internalFunctions.add(fnDef);
			}

			// Determine if functions are only referenced by other functions within the scope
			// they are defined in. If so, they don't need to be returned from the scope function.
			for (const fnDef of internalFunctions) {
				if (![...fnDef.scopes.values()].some(fnRecord => (
					fnRecord.assignments || fnRecord.dependents.length > 0 || t.isCallExpression(fnRecord.node)
				))) {
					fnDef.isScopeInternalOnly = true;
					numInternalOnlyFunctions++;
				}
			}
		}

		// Re-order params with least often defined last
		params.sort(({definedCount: count1}, {definedCount: count2}) => (
			count1 > count2 ? -1 : count2 > count1 ? 1 : 0
		));

		// Function to create functions to inject values into scope
		function createInjection(param) {
			const inputParamNode = t.identifier(`_${param.name}`),
				outputParamNode = t.identifier(param.name);
			param.injectionVarNode = inputParamNode;
			param.localVarNodes.push(outputParamNode);

			const injectNode = t.arrowFunctionExpression(
				[inputParamNode],
				t.assignmentExpression('=', outputParamNode, inputParamNode)
			);

			const index = returnNodes.length;
			param.injectionIndex = index;
			returnNodes.push(injectNode);
			return index;
		}

		// Create scopes
		for (const scope of blockScopes.values()) {
			// Create node for calling createScope function to create scope object
			const createScopeRecord = getParentCreateScopeRecord(scope.parent);

			const argumentNodes = [],
				callNode = t.callExpression(createScopeRecord.varNode, argumentNodes),
				scopeRecord = scope.record;
			scopeRecord.node = callNode;

			// Get parameters
			const {values} = scope,
				undefinedIndexes = [];
			let numTrailingUndefined = 0,
				paramIndex = 0;
			for (const param of params) {
				const valProps = values[param.name];
				let node;
				if (!valProps) {
					// Value not required - insert `undefined` as empty value
					node = undefinedRecord.varNode;
					undefinedIndexes.push(paramIndex);
					numTrailingUndefined++;
				} else {
					const valRecord = valProps.record,
						valDependents = valRecord.dependents,
						valDependent = valDependents
							? valDependents.find(dependent => dependent.record === scopeRecord && !dependent.node)
							: undefined;
					node = valRecord.varNode;
					if (valProps.isCircular) {
						// Circular reference - inject into scope later
						const injectionIndex = param.injectionIndex ?? createInjection(param);

						// Create var for inject function for this scope.
						// Each var will only be injected once into each scope, so no need to guard against
						// duplicate inject function vars being created.
						const injectRecord = createRecord(
							`inject${upperFirst(param.name)}Into${upperFirst(scopeRecord.varNode.name)}`
						);

						const injectFnNode = t.memberExpression(
							scopeRecord.varNode,
							t.numericLiteral(injectionIndex),
							true
						);
						injectRecord.node = injectFnNode;

						createDependency(injectRecord, scopeRecord, injectFnNode, 'object');

						// Create assignment
						const argumentsNode = [node],
							assignmentNode = t.callExpression(injectRecord.varNode, argumentsNode),
							assignment = createAssignment(scopeRecord, assignmentNode);
						createDependency(assignment, injectRecord, assignmentNode, 'callee');

						// Move dependency on value from scope record to assignment
						valDependent.record = assignment;
						valDependent.node = argumentsNode;
						valDependent.key = 0;
						assignment.dependencies.push(
							deleteFirst(scopeRecord.dependencies, dep => dep.record === valRecord)
						);

						// Insert `undefined` as empty value
						node = undefinedRecord.varNode;
						undefinedIndexes.push(paramIndex);
						numTrailingUndefined++;
					} else {
						// Complete dependent object with `.node` and `.key` properties
						if (valDependent) {
							valDependent.node = argumentNodes;
							valDependent.key = paramIndex;
						}
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

			// Link scope object to createScope function (as 1st dependency)
			createDependency(scopeRecord, createScopeRecord, callNode, 'callee');
			const scopeDependencies = scopeRecord.dependencies;
			scopeDependencies.unshift(scopeDependencies.pop());
		}

		// Determine if can output a singular value rather than an array.
		// NB: Root function always returns an array - it will be destructured in `processBlocks()`.
		let returnNodeIndex = returnNodes.length;

		const isSingular = !isRoot
			&& returnNodeIndex + blockFunctions.length - numInternalOnlyFunctions + childBlocks.length === 1;

		// Init vars to track strict/sloppy children
		const strictFns = [];
		let someSloppy = false;
		function recordStrict(node, isStrict) {
			if (isStrict) {
				strictFns.push({node, index: returnNodeIndex});
			} else if (isStrict === false) {
				someSloppy = true;
			}
		}

		const {rootStrictFnRecords, rootSloppyFnRecords} = this;
		function recordRootStrict(fnRecord, isStrict) {
			if (isStrict) {
				rootStrictFnRecords.push(fnRecord);
			} else if (isStrict === false) {
				rootSloppyFnRecords.push(fnRecord);
			}
		}

		// Create functions
		const globalVarNames = new Set(),
			reservedVarNames = new Set(),
			internalFunctionNodes = [];
		for (const blockFunction of blockFunctions) {
			const {
				scopes: fnScopes, externalVars, internalVars, globalVarNames: fnGlobalVarNames,
				containsEval: fnContainsEval, isStrict, internalScopeParams, isScopeInternalOnly
			} = blockFunction;

			if (!isScopeInternalOnly) {
				for (const [scope, fnRecord] of fnScopes) {
					let scopeRecord = scope.record;

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
						scopeRecord = scopeDependencies[0].record;
						scopeDependencies.length = 0;
					} else {
						// Will output array - link function instance to scope object
						fnNode = t.memberExpression(
							scopeRecord.varNode,
							t.numericLiteral(returnNodeIndex),
							true
						);

						createDependency(fnRecord, scopeRecord, fnNode, 'object');

						// Record strict/sloppy for top level functions
						if (isRoot && !fnContainsEval) recordRootStrict(fnRecord, isStrict);
					}

					// Replace placeholder var with reference to scope var
					const fnNodeWithWrapper = fnRecord.node,
						wrapperParentNode = getNodeWithinWrapperParent(fnNodeWithWrapper);
					if (!internalScopeParams) {
						// Replace placeholder var with reference to scope var
						if (wrapperParentNode) {
							wrapperParentNode[0] = fnNode;
						} else {
							fnRecord.node = fnNode;
						}
					} else {
						if (wrapperParentNode) {
							wrapperParentNode[0] = fnRecord.varNode;
							const assignment = createAssignment(scopeRecord, fnNodeWithWrapper);
							createDependency(assignment, fnRecord, wrapperParentNode, 0);

							// Re-assign function record's dependencies to scope record
							const assignmentDependencies = assignment.dependencies;
							fnRecord.dependencies = fnRecord.dependencies.filter((dependency) => {
								const dependencyRecord = dependency.record;
								if (dependencyRecord === scopeRecord) return true;

								assignmentDependencies.push(dependency);
								for (const dependent of dependencyRecord.dependents) {
									if (dependent.record === fnRecord) dependent.record = scopeRecord;
								}
								return false;
							});
						}

						fnRecord.node = fnNode;

						// Re-assign function record's assignments to scope record
						const fnAssignments = fnRecord.assignments;
						if (fnAssignments) {
							let {assignments} = scopeRecord;
							if (!assignments) assignments = scopeRecord.assignments = [];
							for (const assignment of fnAssignments) {
								assignments.push(assignment);

								if (!assignment.node) {
									// Re-assign prototype to depend on scope record.
									// Required to maintain circular dependency between function and prototype
									// when code-splitting.
									const protoRecord = assignment.dependencies[0].record;
									protoRecord.prototypeOf = scopeRecord;
								}
							}

							fnRecord.assignments = undefined;
						}
					}
				}
			}

			// Add var nodes to globals/locals
			const fnReservedVarNames = new Set();
			for (const varName in externalVars) {
				const param = paramsByName[varName];
				if (param) {
					// Local var
					param.localVarNodes.push(...externalVars[varName]);
				} else {
					// Var referencing upper scope
					inheritedVars[varName].push(...externalVars[varName]);
				}

				// If var name is frozen, prevent an internal var taking same name
				if (frozenNames.has(varName)) fnReservedVarNames.add(varName);
			}

			// Add global vars to globals
			for (const varName of fnGlobalVarNames) {
				if (!isRoot || !fnContainsEval) globalVarNames.add(varName);
				fnReservedVarNames.add(varName);
			}

			// Add var names which are frozen internal to function to reserved names
			// to prevent other vars clashing with them
			for (const varName of blockFunction.reservedVarNames) {
				reservedVarNames.add(varName);
				fnReservedVarNames.add(varName);
			}

			// Rename internal vars.
			// Names avoid clashing with internal and globals vars used within this function.
			// Function names and vars which are frozen by `eval()` aren't included in `internalVars`.
			const transformVarName = this.createVarNameTransform(fnReservedVarNames);
			for (const varName in internalVars) {
				// NB: Frozen vars are not included in `internalVars`
				const newName = transformVarName(varName, false);
				if (newName !== varName) {
					for (const varNode of internalVars[varName]) {
						varNode.name = newName;
					}
				}
				reservedVarNames.add(newName);
			}

			// Record if strict or sloppy
			let {node} = blockFunction;
			if (!isRoot) {
				recordStrict(node, isStrict);
			} else if (fnContainsEval) {
				// Function in root scope containing eval - wrap in `(0, eval)(...)`
				// to prevent access to outer vars
				node = this.wrapInIndirectEval(node, isStrict);
			}

			// If param is a locally-defined function, add `x = ...` to node
			if (internalScopeParams) {
				// If unnamed function, wrap in `(0, ...)` to prevent implicit naming
				if (!node.id) node = t.sequenceExpression([t.numericLiteral(0), node]);

				for (const param of internalScopeParams) {
					const varNode = t.identifier(param.name);
					param.localVarNodes.push(varNode);
					node = t.assignmentExpression('=', varNode, node);
				}
			}

			// Return function definition (as function/class expression)
			if (isScopeInternalOnly) {
				internalFunctionNodes.push(node);
			} else {
				returnNodes[returnNodeIndex++] = node;
			}
		}

		const nextInheritedVars = Object.assign(Object.create(null), inheritedVars);
		for (const param of params) {
			nextInheritedVars[param.name] = param.localVarNodes;
		}

		// Process child blocks
		for (const childBlock of childBlocks) {
			const createScopes = new Map(),
				createScopeName = `createScope${upperFirst(childBlock.name)}`;
			let createScopeRecord;
			// eslint-disable-next-line no-inner-declarations, no-loop-func
			function getCreateScopeRecord(scope) {
				// If already created, return it
				createScopeRecord = createScopes.get(scope);
				if (createScopeRecord) return createScopeRecord;

				const scopeRecord = scope.record;
				if (isSingular) {
					// Will output singular createScope function.
					// Repurpose the scope object created above as the createScope function.
					// NB: No need to do dependency linking - already done above.
					scopeRecord.varNode.name = createScopeName;
					createScopeRecord = scopeRecord;
				} else {
					// Will output array of functions - createScope function will be an element of scope array
					createScopeRecord = createRecord(createScopeName);

					const createScopeNode = t.memberExpression(
						scopeRecord.varNode,
						t.numericLiteral(returnNodeIndex),
						true
					);
					createScopeRecord.node = createScopeNode;

					createDependency(createScopeRecord, scopeRecord, createScopeNode, 'object');
				}

				createScopes.set(scope, createScopeRecord);
				return createScopeRecord;
			}

			let {
				node: childNode, // eslint-disable-next-line prefer-const
				globalVarNames: childGlobalVarNames, reservedVarNames: childReservedVarNames, isStrict
			} = this.processBlock(childBlock, getCreateScopeRecord, nextInheritedVars, frozenNames, false);

			if (isRoot && childBlock.containsEval) {
				// Top-level block containing eval - wrap in `(0, eval)(...)`
				// to prevent access to outer vars
				childNode = this.wrapInIndirectEval(childNode, isStrict);
			} else {
				setAddFrom(globalVarNames, childGlobalVarNames);
				setAddFrom(reservedVarNames, childReservedVarNames);

				if (isRoot) {
					recordRootStrict(createScopeRecord, isStrict);
				} else {
					recordStrict(childNode, isStrict);
				}
			}

			returnNodes[returnNodeIndex++] = childNode;
		}

		// Rename params
		const transformVarName = this.createVarNameTransform(
			new Set([...globalVarNames, ...reservedVarNames, ...frozenNames])
		);

		const paramNodes = [],
			{mangle} = this.options;
		let hasArgumentsOrEvalParam = false,
			frozenThisVarName, frozenArgumentsVarName;
		for (const param of params) {
			const paramName = param.name;
			let newName;
			const renameInjectionVarNode = () => {
				if (!param.injectionVarNode) return;
				param.injectionVarNode.name = mangle
					? (newName === 'a' ? 'b' : 'a')
					: `_${newName}`;
			};

			if (paramName === 'new.target') {
				// `new.target` is always renamed as it can't be provided for `eval()` anyway
				newName = transformVarName('newTarget', param.isFrozenName);

				// Convert `MetaProperty` nodes into `Identifier`s with new name
				for (const varNode of param.localVarNodes) {
					varNode.type = 'Identifier';
					varNode.name = newName;
					varNode.meta = undefined;
					varNode.property = undefined;
				}

				// Rename injection node
				renameInjectionVarNode();
			} else if (!param.isFrozenName || paramName === 'super') {
				// Param can be renamed.
				// NB: `super` param is always renamed.
				newName = transformVarName(paramName, param.isFrozenName);
				if (newName !== paramName) {
					// Rename all nodes
					for (const varNode of param.localVarNodes) {
						varNode.name = newName;
					}

					// Rename injection node
					renameInjectionVarNode();
				}
			} else {
				// Frozen var name (potentially used in `eval()`)
				// eslint-disable-next-line no-lonely-if
				if (paramName === 'this' || (paramName === 'arguments' && paramsByName.this?.isFrozenName)) {
					// `this` or `arguments` captured from function.
					// `arguments` is only injected with a function wrapper if `this` is frozen too.
					// Otherwise, can just make `arguments` a normal param.
					// This can be the case if `arguments` is a user-defined variable,
					// not `arguments` created by a function.
					newName = transformVarName(paramName, true);
					if (paramName === 'this') {
						frozenThisVarName = newName;
					} else {
						frozenArgumentsVarName = newName;
					}

					assert(
						!param.injectionVarNode,
						'Cannot handle circular `this` or `arguments` where `this` cannot be renamed due to use of `eval()`'
					);
				} else {
					newName = paramName;

					if (paramName === 'arguments' || paramName === 'eval') hasArgumentsOrEvalParam = true;

					// Rename injection node
					if (mangle) renameInjectionVarNode();
				}
			}

			reservedVarNames.add(newName);

			paramNodes.push(t.identifier(newName));
		}

		// Handle strict/sloppy mode
		let isStrict;
		if (!isRoot) {
			if (hasArgumentsOrEvalParam) {
				// If param named `arguments` or `eval`, scope function must be sloppy mode
				// or it's a syntax error.
				// NB: Only way param will be called `arguments` or `eval` is if it's frozen by an `eval()`.
				isStrict = false;
			} else if (strictFns.length === 0) {
				// No strict child functions or child blocks. Block is sloppy if any sloppy children,
				// or indeterminate (`null`) if all children are indeterminate.
				isStrict = someSloppy ? false : null;
			} else if (someSloppy) {
				// Some sloppy and some strict children (and maybe some indeterminate). Block is sloppy.
				isStrict = false;
			} else {
				// At least one strict child and no sloppy children. Block is strict.
				isStrict = true;
			}

			// If block is sloppy, add 'use strict' directives to strict functions
			if (isStrict === false) {
				for (const strictFnProps of strictFns) {
					returnNodes[strictFnProps.index] = addStrictDirectiveToFunction(strictFnProps.node);
				}
			}
		}

		// Create block function - will return either array of functions or single function
		let returnNode = isSingular ? returnNodes[0] : t.arrayExpression(returnNodes);
		if (numInternalOnlyFunctions > 0) {
			internalFunctionNodes.push(returnNode);
			returnNode = t.sequenceExpression(internalFunctionNodes);
		}

		// If uses frozen `this`, wrap return value in an IIFE to inject actual `this`
		// (and `arguments`, if it's used too).
		// `() => eval(x)` -> `(function() { return () => eval(x); }).apply(this$0, arguments$0)`
		// TODO: In sloppy mode, it's possible for `arguments` to be re-defined as a non-iterable object
		// which would cause an error when this function is called.
		// A better solution when outputting sloppy mode code would be to just use a var called `arguments`,
		// rather than injecting. Of course this isn't possible in ESM.
		// TODO: Ensure scope function using `this` is strict mode if value of `this` is not an object.
		// In sloppy mode, literals passed as `this` get boxed.
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode#securing_javascript
		// TODO: Also doesn't work where `this` or `arguments` is circular and is injected late.
		if (frozenThisVarName) {
			returnNode = t.callExpression(
				t.memberExpression(
					t.functionExpression(null, [], t.blockStatement([t.returnStatement(returnNode)])),
					t.identifier(frozenArgumentsVarName ? 'apply' : 'call')
				),
				[
					t.identifier(frozenThisVarName),
					...(frozenArgumentsVarName ? [t.identifier(frozenArgumentsVarName)] : [])
				]
			);
		}

		const node = t.arrowFunctionExpression(paramNodes, returnNode);

		// Return block function node, global var names, reserved var names + strict/sloppy mode flag
		return {node, globalVarNames, reservedVarNames, isStrict};
	}
};

function createMissingScopes(block, parentBlock) {
	for (const scope of block.scopes.values()) {
		// If scope's parent is not in block's parent, select a scope for it
		// (any which is nested in scope's current parent will work)
		let parentScope = scope.parent;
		const currentParentBlock = parentScope && parentScope.block;
		if (currentParentBlock === parentBlock) continue;

		// Get missing blocks
		const missingBlocks = [parentBlock];
		let thisBlock = parentBlock;
		while (true) { // eslint-disable-line no-constant-condition
			thisBlock = thisBlock.parent;
			if (thisBlock === currentParentBlock) break;
			missingBlocks.unshift(thisBlock);
		}

		let possibleParentScopes = new Set([parentScope]),
			index;
		for (index = 0; index < missingBlocks.length; index++) {
			const interveningBlock = missingBlocks[index],
				possibleScopes = new Set();
			for (const possibleScope of interveningBlock.scopes.values()) {
				if (possibleParentScopes.has(possibleScope.parent)) possibleScopes.add(possibleScope);
			}
			if (possibleScopes.size === 0) break;
			possibleParentScopes = possibleScopes;
		}

		parentScope = firstMapValue(possibleParentScopes);

		// If some missing scopes don't exist, create them
		for (; index < missingBlocks.length; index++) {
			parentScope = createScope(null, missingBlocks[index], parentScope);
		}

		// Set new parent
		scope.parent = parentScope;
	}

	// Traverse through child blocks
	for (const childBlock of block.children) {
		createMissingScopes(childBlock, block);

		// If a child block contains eval, this block does too
		if (childBlock.containsEval) block.containsEval = true;
	}
}
