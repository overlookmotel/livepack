/* --------------------
 * livepack module
 * Serializer class
 * ------------------*/

'use strict';

// Modules
const generate = require('@babel/generator').default,
	{last, pick} = require('lodash'),
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
		this.topBlock = this.createBlock(0);
		this.topScope = this.createScope(0, this.topBlock, null);
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
		console.log('topBlock:'); // eslint-disable-line no-console
		console.dir(this.topBlock, {depth: 6}); // eslint-disable-line no-console

		// Create scopes and functions
		const {records, topBlock, topScope} = this;
		const createScopeVal = {};
		const createScopeRecord = this.createRecord(createScopeVal, t.identifier('createScope0'));
		createScopeRecord.dependencies = [];

		const parentCreateScopes = new Map([[null, {val: createScopeVal, record: createScopeRecord}]]);
		const {elements} = this.processBlock(topBlock, parentCreateScopes).body;

		for (const {val: dependentVal} of records.get(topScope).dependents) {
			const record = records.get(dependentVal);
			record.node = elements.shift();
			record.dependencies = record.dependencies.filter(dependency => dependency.val !== topScope);
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
				if (assignments) statementNodes.push(...assignments);
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

	processBlock(block, parentCreateScopes) {
		// Create functions to inject values into scope
		const {circularParams, functions: blockFunctions} = block;
		const injectFns = {};
		let index = blockFunctions.length;
		for (const paramName of circularParams) {
			const inputParamNode = t.identifier(`_${paramName}`);
			const injectFnNode = t.arrowFunctionExpression(
				[inputParamNode],
				t.assignmentExpression(
					'=',
					t.identifier(paramName),
					inputParamNode
				)
			);
			injectFns[paramName] = {node: injectFnNode, index};
			index++;
		}

		// Create scopes
		// TODO Deal with `this` and `arguments`
		const params = block.params.filter(paramName => paramName !== 'this' && paramName !== 'arguments');

		const {records} = this;
		const blockScopes = block.scopes;
		for (const scope of blockScopes) {
			const {val: createScopeVal, record: createScopeRecord} = parentCreateScopes.get(scope.parentScope);

			const argumentNodes = [];
			const callNode = t.callExpression(createScopeRecord.varNode, argumentNodes);
			const scopeRecord = scope.record;
			scopeRecord.node = callNode;

			scopeRecord.dependencies.push({val: createScopeVal});
			createScopeRecord.dependents.push({val: scope, node: callNode, key: 'callee'});

			const {values} = scope;
			params.forEach((paramName, paramIndex) => {
				const valProps = values[paramName];
				let node;
				if (!valProps) {
					// Value not required - insert `0` as empty value
					node = t.numericLiteral(0);
				} else if (valProps.isCircular) {
					// Circular reference - inject into scope later
					let {assignments} = scopeRecord;
					if (!assignments) {
						assignments = [];
						scopeRecord.assignments = assignments;
					}

					const argumentsNode = [valProps.node];
					assignments.push(
						t.expressionStatement(
							t.callExpression(
								t.memberExpression(
									scopeRecord.varNode,
									t.numericLiteral(injectFns[paramName].index),
									true
								),
								argumentsNode
							)
						)
					);

					const {val} = valProps;
					const valRecord = records.get(val);
					valRecord.dependencies.push({val});
					valRecord.dependents.push({val, node: argumentsNode, key: 0});

					// Insert `0` as empty value
					node = t.numericLiteral(0);
				} else {
					node = valProps.node;
					const {val} = valProps;
					if (!isPrimitive(val)) {
						scopeRecord.dependencies.push({val});
						records.get(val).dependents.push({
							val: createScopeVal, node: argumentNodes, key: paramIndex
						});
					}
				}

				argumentNodes[paramIndex] = node;
			});
		}

		// Create functions
		// TODO Handling duplicate scopes could be more simply done by creating scopes for functions
		// which are duplicated, and they'd be dealt with as child blocks same as any other scope
		// eslint-disable-next-line no-shadow
		const returnNodes = blockFunctions.map(({id: fnId, instances, node}, index) => {
			// Split values by scope, and determine if any scopes are duplicated
			// (i.e. more than one instance of same function in same scope)
			const scopeValues = new Map();
			let hasDuplicateScopes = false;
			for (const {val, scope} of instances) {
				const values = scopeValues.get(scope);
				if (!values) {
					scopeValues.set(scope, [val]);
				} else {
					values.push(val);
					hasDuplicateScopes = true;
				}
			}

			// Set values for function instances.
			// Where duplicate scopes:
			//   - `createScope` will return a factory function for creating independent instances of function
			//   - Create var for factory function e.g. `createFn3 = scope100[0]`
			//   - Set value for each function instance to execution of the factory function `createFn3()`
			// Where no duplicate scopes:
			//   - `createScope` will return the function itself
			//   - Set value for each function instance to the function itself in it's scope
			for (const [scope, values] of scopeValues) {
				const scopeRecord = scope.record;
				const factoryNode = t.memberExpression(
					scopeRecord.varNode,
					t.numericLiteral(index),
					true
				);

				let factoryVal, factoryVarNode, factoryRecord;
				if (hasDuplicateScopes) {
					factoryVal = {};
					factoryVarNode = t.identifier(`createFn${fnId}`);
					factoryRecord = this.createRecord(factoryVal, factoryVarNode);
					factoryRecord.node = factoryNode;

					factoryRecord.dependencies = [{val: scope}];
					scopeRecord.dependents.push({val: factoryVal, node: factoryNode, key: 'object'});
				}

				for (const val of values) {
					const fnRecord = records.get(val);
					let fnNode;
					if (hasDuplicateScopes) {
						fnNode = t.callExpression(factoryVarNode, []);
						fnRecord.dependencies.push({val: factoryVal});
						factoryRecord.dependents.push({val, node: factoryNode, key: 'callee'});
					} else {
						fnNode = factoryNode;
						fnRecord.dependencies.push({val: scope});
						scopeRecord.dependents.push({val, node: fnNode, key: 'object'});
					}
					fnRecord.node = fnNode;
				}
			}

			// Return function definition (as function/class expression)
			// or factory function (if duplicated scopes)
			if (hasDuplicateScopes) node = t.arrowFunctionExpression([], node);
			return node;
		});

		// Add value injection functions
		for (const paramName of circularParams) {
			returnNodes.push(injectFns[paramName].node);
		}

		// Create `createScope()` functions for child blocks
		index = returnNodes.length;
		for (const childBlock of block.children) {
			const createScopes = new Map();
			for (const scope of blockScopes) {
				const createScopeVal = {};
				const createScopeRecord = this.createRecord(
					createScopeVal, t.identifier(`createScope${scope.id}_${childBlock.id}`)
				);

				const scopeRecord = scope.record;
				const createScopeNode = t.memberExpression(
					scopeRecord.varNode,
					t.numericLiteral(index),
					true
				);
				createScopeRecord.node = createScopeNode;

				createScopeRecord.dependencies = [{val: scope}];
				scopeRecord.dependents.push({val: createScopeVal, node: createScopeNode, key: 'object'});

				createScopes.set(scope, {val: createScopeVal, record: createScopeRecord});
			}

			returnNodes[index] = this.processBlock(childBlock, createScopes);
			index++;
		}

		// Return vars wrapped in function
		return t.arrowFunctionExpression(
			params.map(param => t.identifier(param)),
			t.arrayExpression(returnNodes)
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
