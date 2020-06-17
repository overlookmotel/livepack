/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

/* eeslint-disable no-console */

'use strict';

// Modules
const assert = require('assert'),
	generate = require('@babel/generator').default,
	{last} = require('lodash'),
	{isObject, isBoolean} = require('is-it-type'),
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
		this.topBlocks = [];
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
		statementNodes.push(
			t.expressionStatement(
				t.assignmentExpression(
					'=',
					t.memberExpression(t.identifier('module'), t.identifier('exports')),
					node
				)
			)
		);

		// Compile to JS
		const programNode = t.program(statementNodes);
		return generate(programNode, {comments: false}).code;
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

		// console.log('records:');
		// console.dir(this.records, {depth: 5});
		// console.log('topBlocks:');
		// console.dir(this.topBlocks, {depth: 6});

		// Create scopes
		for (const block of this.topBlocks) {
			const createScopeVal = {};
			const createScopeRecord = this.createRecord(
				createScopeVal, t.identifier(`createScope${block.id}`)
			);
			createScopeRecord.dependencies = [];

			const createScopes = new Map();
			createScopes.set(null, {val: createScopeVal, record: createScopeRecord});

			createScopeRecord.node = this.processBlock(block, createScopes);
		}

		// Trace dependencies and create vars for each
		const {records} = this;
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
		// Create scope records
		// TODO Deal with `this` and `arguments`
		const params = block.params.filter(param => param !== 'this' && param !== 'arguments');
		for (const scope of block.scopes) {
			const scopeRecord = this.createRecord(scope, t.identifier(`scope${scope.id}`));
			scope.record = scopeRecord;

			const {val: createScopeVal, record: createScopeRecord} = parentCreateScopes.get(scope.parentScope);

			const {values} = scope;
			const callNode = t.callExpression(
				createScopeRecord.varNode,
				params.map(paramName => values[paramName])
			);
			scopeRecord.node = callNode;

			scopeRecord.dependencies = [{val: createScopeVal}];
			createScopeRecord.dependents.push({val: scope, node: callNode, key: 'callee'});
		}

		// Create functions
		let varName = '';
		const statementNodes = [],
			varNodes = [],
			returnNodes = [];
		const {records} = this;
		for (const functionDef of block.functions) {
			const {node} = functionDef;
			let varNode = node.id;
			if (varNode) {
				// Convert to function/class declaration
				const {type} = node;
				if (type === 'FunctionExpression') {
					node.type = 'FunctionDeclaration';
				} else if (type === 'ClassExpression') {
					node.type = 'FunctionDeclaration';
				} else {
					throw new Error(`Unexpected function type ${type}`);
				}
				statementNodes.push(node);
			} else {
				varName = getNextVarName(varName);
				varNode = t.identifier(varName);
				varNodes.push(t.variableDeclarator(varNode, node));
			}

			// Set nodes for instances of function
			for (const {val, scope} of functionDef.instances) {
				const fnRecord = records.get(val);
				const scopeRecord = scope.record;

				const fnNode = t.memberExpression(
					scopeRecord.varNode,
					t.numericLiteral(returnNodes.length),
					true
				);
				fnRecord.node = fnNode;

				fnRecord.dependencies.push({val: scope});
				scopeRecord.dependents.push({val, node: fnNode, key: 'object'});
			}

			returnNodes.push(varNode);
		}

		// Create `createScope()` functions for child blocks
		for (const childBlock of block.children) {
			const index = returnNodes.length;

			const createScopes = new Map();
			for (const scope of block.scopes) {
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

			const childNode = this.processBlock(childBlock, createScopes);
			returnNodes.push(childNode);
		}

		// Wrap var definitions, function declarations + return statement in function and return
		if (varNodes.length > 0) statementNodes.unshift(t.variableDeclaration('const', varNodes));
		statementNodes.push(t.returnStatement(t.arrayExpression(returnNodes)));

		return t.functionExpression(
			t.identifier(`createScope${block.id}`), // TODO Make anonymous
			params.map(param => t.identifier(param)),
			t.blockStatement(statementNodes)
		);
	}
}

Object.assign(Serializer.prototype, valueMethods, functionMethods, objectMethods);

/**
 * Serialize value to Javascript code.
 * @param {*} val - Value to serialize.
 * @param {Object} [options] - Options object
 * @param {boolean} [options.inline=true] - If false, every object is a separate var
 * @returns {string} - Javascript code
 */
module.exports = function serialize(val, options) {
	// Conform options
	if (options == null) {
		options = {};
	} else {
		assert(isObject(options), 'options must be an object if provided');
	}

	if (options.inline == null) {
		options.inline = true;
	} else {
		assert(isBoolean(options.inline), 'options.inline must be a boolean if provided');
	}

	// Serialize value
	const serializer = new Serializer(options);
	return serializer.serialize(val);
};

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
