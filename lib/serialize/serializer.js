/* --------------------
 * livepack module
 * Serializer class
 * ------------------*/

'use strict';

// Modules
const generate = require('@babel/generator').default,
	{last, pick} = require('lodash'),
	{isFunction} = require('is-it-type'),
	t = require('@babel/types');

// Imports
const valueMethods = require('./values.js'),
	functionMethods = require('./functions.js'),
	objectMethods = require('./objects.js'),
	{isPrimitive} = require('./primitives.js');

// Exports

class Serializer {
	constructor(options) {
		this.options = options;
		this.records = new Map(); // Keyed by value
		this.scopes = new Map(); // Keyed by scope ID
		this.blocks = new Map(); // Keyed by block ID
		this.rootBlock = this.createBlock(0);
		this.rootScope = this.createScope(0, this.rootBlock, null);
		this.functions = new Map(); // Keyed by function ID
	}

	/**
	 * Serialize value to Javascript code.
	 * @param {*} val - Value to serialize
	 * @returns {string} - Javascript code
	 */
	serialize(val) {
		// Process value into Babel node
		let node = this.serializeValue(val);

		// Compile as set of statements
		let statementNodes;
		if (isPrimitive(val)) {
			statementNodes = [];
		} else {
			({node, statementNodes} = this.serializeMain(val));
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

		const options = pick(this.options, ['comments', 'compact']);
		let js = generate(programNode, options).code;
		if (format === 'js') js = js.slice(0, -1); // Remove final semicolon
		if (!options.compact) js += '\n'; // Add trailing newline
		return js;
	}

	/**
	 * Serialize complex value (i.e. not primitive).
	 * @param {*} val - Value to serialize
	 * @returns {Object}
	 * @returns {Object} .node - Babel node representing values
	 * @returns {Array<Object>} .statementNodes - Program statements (Babel nodes)
	 */
	serializeMain(val) {
		const {inline} = this.options;

		// console.log('records:'); // eslint-disable-line no-console
		// console.dir(this.records, {depth: 5}); // eslint-disable-line no-console
		// console.log('rootBlock:'); // eslint-disable-line no-console
		// console.dir(this.rootBlock, {depth: 6}); // eslint-disable-line no-console

		// Create scopes and functions
		const {records, rootBlock, rootScope} = this;
		const createScopeVal = {};
		const createScopeRecord = this.createRecord(createScopeVal, t.identifier('createScope0'));

		const parentCreateScopes = new Map([[null, {val: createScopeVal, record: createScopeRecord}]]);
		const {elements} = this.processBlock(rootBlock, parentCreateScopes, true).body;

		for (const {val: dependentVal} of rootScope.record.dependents) {
			const record = records.get(dependentVal);
			record.node = elements.shift();
			record.dependencies = record.dependencies.filter(dependency => dependency.val !== rootScope);
		}

		// Trace dependencies and create vars for each
		let varName = '';
		const varNodes = [],
			statementNodes = [],
			processedValues = new Set();
		function addDependencies(child, isRoot) {
			// Skip if already processing
			if (processedValues.has(child)) return;
			processedValues.add(child);

			// Add sub-dependencies
			const record = records.get(child);
			for (const dependency of record.dependencies) {
				addDependencies(dependency.val);
			}

			const {dependents, assignments} = record;
			if (inline && !isRoot && !assignments && dependents.length === 1) {
				// Only used once - substitute content in place of var
				const dependent = dependents[0];
				dependent.node[dependent.key] = record.node;
			} else {
				// Create variable to hold this value
				const {varNode} = record;
				if (varNode.name === 'x') { // TODO Remove this check - always rename
					varName = getNextVarName(varName);
					varNode.name = varName;
				}

				varNodes.push(t.variableDeclarator(varNode, record.node));

				// Add assignment statements
				if (assignments) {
					for (const assignment of assignments) {
						for (const dependency of assignment.dependencies) {
							addDependencies(dependency.val);
						}

						statementNodes.push(assignment.node);
					}
				}
			}
		}

		addDependencies(val, true);

		// Extract last var to be final result
		let node;
		if (inline && records.get(val).dependents.length === 0) {
			node = varNodes.pop().init;
		} else {
			// Cannot extract - it has dependents (i.e. an assignment involving it)
			node = last(varNodes).id;
		}

		// Add var statement
		if (varNodes.length > 0) statementNodes.unshift(t.variableDeclaration('const', varNodes));

		return {node, statementNodes};
	}

	processBlock(block, parentCreateScopes, isRoot) {
		const returnNodes = [];

		// Function to create functions to inject values into scope
		const injectionIndexes = {};
		function createInjection(paramName) {
			let index = injectionIndexes[paramName];
			if (index !== undefined) return index;

			const inputParamNode = t.identifier(`_${paramName}`);
			const injectNode = t.arrowFunctionExpression(
				[inputParamNode],
				t.assignmentExpression(
					'=',
					t.identifier(paramName),
					inputParamNode
				)
			);

			index = returnNodes.length;
			injectionIndexes[paramName] = index;
			returnNodes.push(injectNode);
			return index;
		}

		// Create scopes
		// TODO Deal with `this` and `arguments`
		const params = block.params.filter(paramName => paramName !== 'this' && paramName !== 'arguments');

		const {records} = this;
		const blockScopes = block.scopes;
		for (const scope of blockScopes) {
			// Create node for calling createScope function to create scope object
			const {val: createScopeVal, record: createScopeRecord} = parentCreateScopes.get(scope.parentScope);

			const argumentNodes = [];
			const callNode = t.callExpression(createScopeRecord.varNode, argumentNodes);
			const scopeRecord = scope.record;
			scopeRecord.node = callNode;

			// Link scope object to createScope function
			// Skip this if outputting a single function - function instance will link to scope instead
			scopeRecord.dependencies.push({val: createScopeVal});
			createScopeRecord.dependents.push({val: scope, node: callNode, key: 'callee'});

			// Get parameters
			const {values} = scope;
			let numTrailingCircular = 0;
			params.forEach((paramName, paramIndex) => {
				const valProps = values[paramName];
				let node;
				if (!valProps) {
					// Value not required - insert `0` as empty value
					node = t.numericLiteral(0);
					numTrailingCircular++;
				} else {
					const {val} = valProps;
					const valRecord = records.get(val);
					let {isCircular} = valProps;

					// If value is a function, and it's in this scope or one above, needs to be injected later.
					// Flag as circular if so.
					if (isFunction(val)) {
						let fnScope = valRecord.scope;
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
						let {assignments} = scopeRecord;
						if (!assignments) {
							assignments = [];
							scopeRecord.assignments = assignments;
						}

						const injectionIndex = createInjection(paramName);

						const argumentsNode = [valProps.node];
						const assignmentNode = t.expressionStatement(
							t.callExpression(
								t.memberExpression(
									scopeRecord.varNode,
									t.numericLiteral(injectionIndex),
									true
								),
								argumentsNode
							)
						);
						const assignment = {node: assignmentNode, dependencies: [{val}]};
						assignments.push(assignment);

						valRecord.dependents.push({val: assignment, node: argumentsNode, key: 0});

						// Insert `0` as empty value
						node = t.numericLiteral(0);
						numTrailingCircular++;
					} else {
						if (!isPrimitive(val)) {
							scopeRecord.dependencies.push({val});
							valRecord.dependents.push({val: scope, node: argumentNodes, key: paramIndex});
						}
						node = valProps.node;
						numTrailingCircular = 0;
					}
				}

				argumentNodes[paramIndex] = node;
			});

			// Trim off any trailing empty params
			if (numTrailingCircular > 0) argumentNodes.length -= numTrailingCircular;
		}

		// Determine if can output a singular value rather than an array
		// NB Root function always returns an array - it will be destructured in `serializeMain()`
		const {functions: blockFunctions, children: blockChildren} = block;
		let index = returnNodes.length;

		const isSingular = !isRoot
			&& index + blockFunctions.length + blockChildren.length === 1;

		// Create functions
		for (const {node, scopes: fnScopes} of blockFunctions) {
			for (const [scope, val] of fnScopes) {
				const scopeRecord = scope.record,
					fnRecord = records.get(val);

				if (isSingular) {
					// Will output singular function rather than array.
					// The scope object is defunct - can go direct to createScope function.

					// Copy over `createScope(...)` node created above
					fnRecord.node = scopeRecord.node;
					scopeRecord.node = null;

					// Transfer dependencies from scope object to function instance
					const {dependencies} = fnRecord,
						scopeDependencies = scopeRecord.dependencies;
					for (const dependency of scopeDependencies) {
						dependencies.push(dependency);
						for (const dependent of records.get(dependency.val).dependents) {
							if (dependent.val === scope) dependent.val = val;
						}
					}
					scopeDependencies.length = 0;
				} else {
					// Will output array - link function instance to scope object
					const fnNode = t.memberExpression(
						scopeRecord.varNode,
						t.numericLiteral(index),
						true
					);
					fnRecord.node = fnNode;

					fnRecord.dependencies.push({val: scope});
					scopeRecord.dependents.push({val, node: fnNode, key: 'object'});
				}
			}

			// Return function definition (as function/class expression)
			returnNodes[index++] = node;
		}

		// Create `createScope()` functions for child blocks
		for (const childBlock of blockChildren) {
			const createScopes = new Map();
			for (const scope of blockScopes) {
				const scopeRecord = scope.record;
				const createScopeName = `createScope${scope.id}_${childBlock.id}`;

				if (isSingular) {
					// Will output singular createScope function.
					// Repurpose the scope object created above as the createScope function.
					// NB No need to do dependency linking - already done above.
					scopeRecord.varNode.name = createScopeName;
					createScopes.set(scope, {val: scope, record: scopeRecord});
				} else {
					// Will output array of functions - createScope function will be a element of scope array.
					const createScopeVal = {};
					const createScopeRecord = this.createRecord(createScopeVal, t.identifier(createScopeName));

					const createScopeNode = t.memberExpression(
						scopeRecord.varNode,
						t.numericLiteral(index),
						true
					);

					createScopeRecord.node = createScopeNode;

					createScopeRecord.dependencies.push({val: scope});
					scopeRecord.dependents.push({val: createScopeVal, node: createScopeNode, key: 'object'});

					createScopes.set(scope, {val: createScopeVal, record: createScopeRecord});
				}
			}

			returnNodes[index++] = this.processBlock(childBlock, createScopes);
		}

		// Return vars wrapped in function
		// Function will return either array of functions or single function
		return t.arrowFunctionExpression(
			params.map(param => t.identifier(param)),
			isSingular ? returnNodes[0] : t.arrayExpression(returnNodes)
		);
	}
}

Object.assign(Serializer.prototype, valueMethods, functionMethods, objectMethods);

module.exports = Serializer;

/**
 * Get next var name from previous.
 * '' -> 'a', 'a' -> 'b', 'z' => 'A', 'Z' -> 'aa', 'aa' -> 'ba', 'ba' -> 'ca', 'ZZ' -> 'aaa'
 * @param {string} name - Previous name
 * @returns {string} - Next name
 */
function getNextVarName(name) {
	const codes = [...name].map(char => char.charCodeAt(0));
	let isDone = false;
	for (let i = 0; i < codes.length; i++) {
		const code = codes[i];
		if (code === 122) { // 'z'
			codes[i] = 65; // 'A'
			isDone = true;
			break;
		}
		if (code !== 90) { // 'Z'
			codes[i] = code + 1;
			isDone = true;
			break;
		}
		codes[i] = 97; // 'a'
	}

	if (!isDone) codes.push(97); // 'a'

	return codes.map(code => String.fromCharCode(code)).join('');
}
