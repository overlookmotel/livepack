/* --------------------
 * livepack module
 * Serializer class
 * ------------------*/

'use strict';

// Modules
const assert = require('assert'),
	generate = require('@babel/generator').default,
	{upperFirst} = require('lodash'),
	t = require('@babel/types');

// Imports
const valueMethods = require('./values.js'),
	functionMethods = require('./functions.js'),
	objectMethods = require('./objects.js'),
	arrayMethods = require('./arrays.js'),
	setMapMethods = require('./setsMaps.js'),
	symbolMethods = require('./symbols.js'),
	otherMethods = require('./other.js'),
	{createRecord, createBlock, createScope, createDependency, createAssignment} = require('./records.js'),
	{createMangledVarNameTransform, createUnmangledVarNameTransform} = require('./varNames.js'),
	{toJsIdentifier, setAddFrom} = require('./utils.js');

// Exports

class Serializer {
	constructor(options) {
		this.options = options;
		this.records = new Map(); // Keyed by value
		this.files = {}; // Keyed by file path

		this.rootBlock = createBlock(null, 'root');
		this.rootScope = createScope(null, this.rootBlock, null);

		this.createVarNameTransform = options.mangle
			? createMangledVarNameTransform
			: createUnmangledVarNameTransform;

		this.globalVarNames = options.format === 'cjs'
			? ['module', 'exports', 'require', '__dirname', '__filename']
			: [];

		this.prototypes = new Map(); // Keyed by prototype object
	}

	/**
	 * Serialize value to Javascript code.
	 * @param {*} val - Value to serialize
	 * @returns {string} - Javascript code
	 */
	serialize(val) {
		// Process value into Babel node
		const record = this.serializeValue(val, 'exports');

		// Compile as set of statements
		let node, statementNodes;
		if (!record.dependents) {
			// Primitive
			node = record.varNode;
			statementNodes = [];
		} else {
			// Non-primitive
			({node, statementNodes} = this.serializeMain(record));
		}

		// Add export statement
		const {format} = this.options;
		if (format === 'js') {
			// Javascript expression
			if (statementNodes.length === 0) {
				statementNodes = [t.expressionStatement(node)];
			} else {
				statementNodes.push(t.returnStatement(node));
				statementNodes = [t.expressionStatement(
					t.callExpression(
						t.arrowFunctionExpression(
							[], t.blockStatement(statementNodes)
						), []
					)
				)];
			}
		} else if (format === 'cjs') {
			// CommonJS
			statementNodes.push(
				t.expressionStatement(
					t.assignmentExpression(
						'=',
						t.memberExpression(t.identifier('module'), t.identifier('exports')),
						node
					)
				)
			);
		} else {
			// ESM
			statementNodes.push(t.exportDefaultDeclaration(node));
		}

		// Compile to JS
		const programNode = t.program(statementNodes);

		const {options} = this,
			{minify} = options;
		const genOptions = {minified: minify, compact: minify, comments: options.comments};
		let js = generate(programNode, genOptions).code;
		if (format === 'js' || minify) js = js.slice(0, -1); // Remove final semicolon
		if (!minify) js += '\n'; // Add trailing newline
		return js;
	}

	/**
	 * Serialize complex value (i.e. not primitive).
	 * @param {Object} record - Record for value to serialize
	 * @returns {Object}
	 * @returns {Object} .node - Babel node representing values
	 * @returns {Array<Object>} .statementNodes - Program statements (Babel nodes)
	 */
	serializeMain(record) {
		const {inline} = this.options;

		// TODO Delete this logging
		// console.log('records:'); // eslint-disable-line no-console
		// console.dir(this.records, {depth: 5}); // eslint-disable-line no-console
		// console.log('rootBlock:'); // eslint-disable-line no-console
		// console.dir(this.rootBlock, {depth: 6}); // eslint-disable-line no-console

		// Create scopes and functions
		const {rootBlock, rootScope} = this;
		const createScopeRecord = createRecord('createScopeRoot');

		const parentCreateScopes = new Map([[null, createScopeRecord]]);
		const {node: blockNode, globalVarNames: functionsGlobalVarNames} = this.processBlock(
			rootBlock, parentCreateScopes, {}, true
		);
		const {elements} = blockNode.body;

		const globalVarNames = new Set([...this.globalVarNames, ...functionsGlobalVarNames]);

		// Flatten out contents of global scope
		// TODO Can creation of dependencies on global scope be avoiding during creation,
		// rather than creating and then having to get rid of them again later?
		const rootScopeRecord = rootScope.record;
		for (const {record: dependentRecord} of rootScopeRecord.dependents) {
			// Substitute global scope calls for functions, maintaining extra props if present
			const originalNode = dependentRecord.node;
			const replacementNode = elements.shift();
			if (!t.isMemberExpression(originalNode)) {
				originalNode.arguments[0] = replacementNode;
			} else {
				dependentRecord.node = replacementNode;
			}

			dependentRecord.dependencies = dependentRecord.dependencies.filter(
				dependency => dependency.record !== rootScopeRecord
			);
		}

		// Trace dependencies and create vars for each
		const transformVarName = this.createVarNameTransform(globalVarNames);
		const varNodes = [],
			statementNodes = [],
			processedRecords = new Set(),
			{mangle} = this.options;
		function addDependencies(valRecord, isRoot) {
			// Skip if already processing/processed
			if (processedRecords.has(valRecord)) return;
			processedRecords.add(valRecord);

			// Add sub-dependencies
			for (const dependency of valRecord.dependencies) {
				addDependencies(dependency.record);
			}

			const {dependents, assignments} = valRecord;
			if (inline && !isRoot && !assignments && dependents.length === 1) {
				// Only used once - substitute content in place of var
				const dependent = dependents[0];
				dependent.node[dependent.key] = valRecord.node;
			} else {
				// Create variable to hold this value
				const {varNode} = valRecord;
				varNode.name = transformVarName(mangle ? null : toJsIdentifier(varNode.name));

				// Wrap unnamed functions in `(0, fn)` to prevent them getting named.
				// NB `valRecord.scope` check is to avoid doing this for `createScope` functions.
				let {node} = valRecord;
				if (t.isFunction(node) && !node.id && valRecord.scope) {
					node = t.sequenceExpression([t.numericLiteral(0), node]);
				}

				varNodes.push(t.variableDeclarator(varNode, node));

				// Add assignment statements
				if (assignments) {
					for (const assignment of assignments) {
						for (const dependency of assignment.dependencies) {
							addDependencies(dependency.record);
						}

						statementNodes.push(t.expressionStatement(assignment.node));
					}
				}
			}
		}

		addDependencies(record, true);

		// Extract last var to be final result
		let node;
		if (inline && record.dependents.length === 0 && !record.assignments) {
			node = varNodes.pop().init;

			// If is a function wrapped with `(0, fn)`, unwrap
			if (t.isSequenceExpression(node)) {
				const {expressions} = node;
				if (expressions.length === 2 && t.isNumericLiteral(expressions[0])) node = expressions[1];
			}

			assert(node === record.node, 'Unexpected final result node');
		} else {
			// Cannot extract - it has dependents (i.e. an assignment involving it)
			node = record.varNode;
		}

		// Add var statement
		if (varNodes.length > 0) statementNodes.unshift(t.variableDeclaration('const', varNodes));

		return {node, statementNodes};
	}

	processBlock(block, parentCreateScopes, inheritedVars, isRoot) {
		const returnNodes = [];

		// Init local vars object to contain all var nodes for local vars
		// so they can have names changed if necessary
		const {paramNames} = block;
		const localVars = {};
		for (const paramName of paramNames) {
			localVars[paramName] = [];
		}

		// Function to create functions to inject values into scope
		const injectionIndexes = {};
		const injectionVarNodes = {};
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
			const createScopeRecord = parentCreateScopes.get(scope.parentScope);

			const argumentNodes = [];
			const callNode = t.callExpression(createScopeRecord.varNode, argumentNodes);
			const scopeRecord = scope.record;
			scopeRecord.node = callNode;

			// Link scope object to createScope function
			createDependency(scopeRecord, createScopeRecord, callNode, 'callee');

			// Get parameters
			const {values} = scope;
			let numTrailingCircular = 0;
			let paramIndex = 0;
			for (const paramName of paramNames) {
				const valProps = values[paramName];
				let node;
				if (!valProps) {
					// Value not required - insert `0` as empty value
					node = t.numericLiteral(0);
					numTrailingCircular++;
				} else {
					const valRecord = valProps.record;
					node = valRecord.varNode;
					let {isCircular} = valProps;

					// If value is a function, and it's in this scope or one above, needs to be injected later.
					// Flag as circular if so. NB `.scope` property is only set for functions.
					let fnScope = valRecord.scope;
					if (fnScope) {
						while (true) { // eslint-disable-line no-constant-condition
							if (fnScope === scope) {
								isCircular = true;
								break;
							}

							fnScope = fnScope.parentScope;
							if (!fnScope) break;
						}
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

						// Insert `0` as empty value
						node = t.numericLiteral(0);
						numTrailingCircular++;
					} else {
						createDependency(scopeRecord, valRecord, argumentNodes, paramIndex);
						numTrailingCircular = 0;
					}
				}

				argumentNodes[paramIndex] = node;
				paramIndex++;
			}

			// Trim off any trailing empty params
			if (numTrailingCircular > 0) argumentNodes.length -= numTrailingCircular;
		}

		// Determine if can output a singular value rather than an array
		// NB Root function always returns an array - it will be destructured in `serializeMain()`
		const {functions: blockFunctions, children: childBlocks} = block;
		let index = returnNodes.length;

		const isSingular = !isRoot
			&& index + blockFunctions.length + childBlocks.length === 1;

		// Create functions
		const globalVarNames = new Set(),
			reservedVarNames = new Set();
		for (const {node, scopes: fnScopes, externalVars, internalVars, functionNames} of blockFunctions) {
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

				// Wrap node for function instance in properties if required
				if (!t.isIdentifier(fnRecord.node)) {
					fnRecord.node.arguments[0] = fnNode;
				} else {
					fnRecord.node = fnNode;
				}
			}

			// Add var nodes to globals/locals
			const fnReservedVarNames = new Set();
			for (const varName in externalVars) {
				const localVarNodes = localVars[varName];
				if (localVarNodes) {
					// Local var
					localVarNodes.push(...externalVars[varName]);
				} else {
					const inheritiedVarNodes = inheritedVars[varName];
					if (inheritiedVarNodes) {
						// Var referencing upper scope
						inheritiedVarNodes.push(...externalVars[varName]);
					} else {
						// Global var
						globalVarNames.add(varName);
						fnReservedVarNames.add(varName);
					}
				}
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
			const transformVarName = this.createVarNameTransform(fnReservedVarNames);
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

		const nextInheritedVars = {...inheritedVars, ...localVars};

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
			} = this.processBlock(childBlock, createScopes, nextInheritedVars);
			setAddFrom(globalVarNames, childGlobalVarNames);
			setAddFrom(reservedVarNames, childReservedVarNames);

			returnNodes[index++] = childNode;
		}

		// Rename params
		const transformVarName = this.createVarNameTransform(
			new Set([...globalVarNames, ...reservedVarNames])
		);

		const paramNodes = [];
		const {mangle} = this.options;
		for (const paramName of paramNames) {
			const newName = transformVarName(paramName);
			if (newName !== paramName) {
				// Rename all nodes
				for (const varNode of localVars[paramName]) {
					varNode.name = newName;
				}

				// Rename injection node
				const injectionVarNode = injectionVarNodes[paramName];
				if (injectionVarNode) {
					injectionVarNode.name = mangle // eslint-disable-line no-nested-ternary
						? (newName === 'a' ? 'b' : 'a')
						: `_${newName}`;
				}
			}

			reservedVarNames.add(newName);

			paramNodes.push(t.identifier(newName));
		}

		// Create block function
		// Function will return either array of functions or single function
		const node = t.arrowFunctionExpression(
			paramNodes,
			isSingular ? returnNodes[0] : t.arrayExpression(returnNodes)
		);

		// Return block function node, global var names + reserved var names
		return {node, globalVarNames, reservedVarNames};
	}
}

Object.assign(
	Serializer.prototype,
	valueMethods,
	functionMethods,
	objectMethods,
	arrayMethods,
	setMapMethods,
	symbolMethods,
	otherMethods
);

module.exports = Serializer;
