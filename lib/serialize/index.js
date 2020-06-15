/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

/* eslint-disable no-console */

'use strict';

// Modules
const generate = require('@babel/generator').default,
	t = require('@babel/types');

// Imports
const valueMethods = require('./values.js'),
	functionMethods = require('./functions.js'),
	objectMethods = require('./objects.js');

// Exports

class Serializer {
	constructor() {
		this.records = new Map(); // Keyed by value
		this.scopes = new Map(); // Keyed by scope ID
		this.blocks = new Map(); // Keyed by block ID
		this.functions = new Map(); // Keyed by function ID

		const globalBlock = this.createBlock(0);
		this.globalBlock = globalBlock;
		this.globalScope = this.createScope(0, globalBlock, undefined);

		this.current = new Map();
	}

	serialize(val) {
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
		console.log('globalBlock:');
		console.dir(this.globalBlock, {depth: 5});

		const {globalBlock} = this;
		globalBlock.record.node = this.processBlock(globalBlock);

		// Create vars
		let varName = '';
		const statementNodes = [];
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
		let blockVarName = '';
		const blockStatementNodes = [],
			blockVarNodes = [],
			returnNodes = [];

		const {records} = this;
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
				blockStatementNodes.push(node);
			} else {
				blockVarName = getNextVarName(blockVarName);
				varNode = t.identifier(blockVarName);
				blockVarNodes.push(t.variableDeclarator(varNode, node));
			}

			for (const fn of functionRecord.values) {
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

					scope = scope.parentScope;
					if (!scope) break;
					record = scopeRecord;
				}
			}

			returnNodes.push(varNode);
		}

		for (const childBlock of block.children) {
			const childNode = this.processBlock(childBlock);
			returnNodes.push(childNode);
		}

		if (returnNodes.length === 0) return null;

		const blockRecord = block.record;
		const params = block.params.filter(param => param !== 'this' && param !== 'arguments');
		for (const scope of block.scopes) {
			const scopeValues = scope.values;
			const paramNodes = params.map(paramName => scopeValues[paramName]);

			const scopeNode = t.callExpression(blockRecord.varNode, paramNodes);
			scope.record.node = scopeNode;
			blockRecord.uses.push({parentNode: scopeNode, key: 'callee'});
		}

		if (blockVarNodes.length > 0) {
			blockStatementNodes.unshift(t.variableDeclaration('const', blockVarNodes));
		}

		blockStatementNodes.push(
			t.returnStatement(t.arrayExpression(returnNodes))
		);

		const blockFnNode = t.functionExpression(
			blockRecord.varNode,
			params.map(param => t.identifier(param)),
			t.blockStatement(blockStatementNodes)
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
