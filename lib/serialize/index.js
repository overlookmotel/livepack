/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

/* eslint-disable no-console */

'use strict';

// Modules
const generate = require('@babel/generator').default,
	{last} = require('lodash'),
	t = require('@babel/types');

// Imports
const valueMethods = require('./values.js'),
	functionMethods = require('./functions.js'),
	objectMethods = require('./objects.js'),
	{isPrimitive} = require('./primitives.js');

// Exports

class Serializer {
	constructor() {
		this.records = new Map(); // Keyed by value
		this.scopes = new Map(); // Keyed by scope ID
		this.blocks = new Map(); // Keyed by block ID
		this.topBlocks = [];
		this.functions = new Map(); // Keyed by function ID
	}

	serialize(val) {
		// Serialize value
		let node = this.serializeValue(val);

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

	serializeMain(val) {
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
			if (!isRoot && !assignments && dependents.length === 1) {
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
		if (records.get(val).dependents.length > 0) {
			// Cannot extract - it has dependents (i.e. an assignment involving it)
			node = last(varNodes).id;
		} else {
			node = varNodes.pop().init;
		}

		// Add var statement
		if (varNodes.length > 0) statementNodes.unshift(t.variableDeclaration('const', varNodes));

		return {node, statementNodes};
	}

	serializeOld(val) {
		// Create export
		const exportAssignmentNode = t.assignmentExpression(
			'=',
			t.memberExpression(t.identifier('module'), t.identifier('exports')),
			t.identifier('x')
		);
		const exportNode = t.expressionStatement(exportAssignmentNode);

		// Serialize value
		exportAssignmentNode.right = this.serializeValue(val, exportAssignmentNode, 'right');

		// Create nodes for functions, blocks and scopes
		console.log('records:', this.records);
		// console.log('scopes:');
		// console.dir([...this.scopes.values()], {depth: 5});

		const statementNodes = [];

		console.log('topBlocks:');
		console.dir(this.topBlocks, {depth: 6});
		for (const block of this.topBlocks) {
			const blockNode = this.processBlock(block);
			blockNode.type = 'FunctionDeclaration';
			statementNodes.push(blockNode);
		}

		// Create vars
		let varName = '';
		const varNodes = [];
		for (const {node: valNode, varNode, uses, assignments} of this.records.values()) {
			if (uses.length === 0 && !assignments) continue;

			/*
			// TODO This is an attempt to inline where only used once. But it doesn't work.
			if (!assignments) {
				if (uses.length === 0) continue;

				if (uses.length === 1) {
					const {parentNode, key} = uses[0];
					if (parentNode) { // TODO This shouldn't be necessary but functions not done yet
						console.log({valNode, parentNode, key});
						parentNode[key] = valNode;
						continue;
					}
				}
			}
			*/

			if (varNode.name === 'x') { // TODO Remove this check - always rename
				varName = getNextVarName(varName);
				varNode.name = varName;
			}
			varNodes.push(t.variableDeclarator(varNode, valNode));

			if (assignments) {
				for (const assignment of assignments) {
					statementNodes.push(
						t.expressionStatement(
							t.assignmentExpression(
								'=',
								t.memberExpression(varNode, assignment.keyNode, assignment.computed),
								assignment.valNode
							)
						)
					);
				}
			}
		}

		// Add var statement + export statement
		if (varNodes.length > 0) statementNodes.unshift(t.variableDeclaration('const', varNodes));
		statementNodes.push(exportNode);

		// Compile to JS
		const programNode = t.program(statementNodes);
		return generate(programNode, {comments: false}).code;
	}

	processBlock(block) {
		let varName = '';
		const statementNodes = [],
			varNodes = [],
			returnNodes = [];

		const {records} = this; // eslint-disable-line no-unused-vars
		for (const functionRecord of block.functions) {
			const {node} = functionRecord;
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

			for (const fn of functionRecord.values) { // eslint-disable-line no-unused-vars
				/*
				let record = records.get(fn);
				let {scope} = record;
				while (true) { // eslint-disable-line no-constant-condition
					const scopeRecord = scope.record;
					const accessNode = t.memberExpression(
						scopeRecord.varNode,
						t.numericLiteral(returnNodes.length),
						true
					);
					record.node = accessNode;
					scopeRecord.uses.push({parentNode: accessNode, key: 'object'});

					record = scope.block.record;
					scope = scope.parentScope;
					if (!scope) break;
				}
				*/
			}

			returnNodes.push(varNode);
		}

		for (const childBlock of block.children) {
			const childNode = this.processBlock(childBlock);
			returnNodes.push(childNode);
		}

		const params = block.params.filter(param => param !== 'this' && param !== 'arguments');
		/*
		const blockRecord = block.record;
		for (const scope of block.scopes) {
			const scopeValues = scope.values;
			const paramNodes = params.map(paramName => scopeValues[paramName]);

			const scopeNode = t.callExpression(blockRecord.varNode, paramNodes);
			scope.record.node = scopeNode;
			blockRecord.uses.push({parentNode: scopeNode, key: 'callee'});
		}
		*/

		if (varNodes.length > 0) {
			statementNodes.unshift(t.variableDeclaration('const', varNodes));
		}

		statementNodes.push(
			t.returnStatement(t.arrayExpression(returnNodes))
		);

		const blockFnNode = t.functionExpression(
			null, // blockRecord.varNode,
			params.map(param => t.identifier(param)),
			t.blockStatement(statementNodes)
		);
		return blockFnNode;
	}
}

Object.assign(Serializer.prototype, valueMethods, functionMethods, objectMethods);

module.exports = function serialize(val) {
	const serializer = new Serializer();
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
