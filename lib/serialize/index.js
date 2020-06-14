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

		console.log('records:', this.records);
		// console.log('scopes:');
		// console.dir([...this.scopes.values()], {depth: 5});

		// Sort blocks by ID
		// const blocks = new Map([...this.blocks.entries()].sort((a, b) => a.id > b.id));
		// this.blocks = blocks;

		console.log('globalBlock:');
		console.dir(this.globalBlock, {depth: 5});

		function processBlock(block) {
			let blockVarName = '';
			const blockStatementNodes = [],
				blockVarNodes = [],
				returnNodes = [];

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

				returnNodes.push(varNode);
			}

			for (const childBlock of block.children) {
				const childNode = processBlock(childBlock);
				returnNodes.push(childNode);
			}

			if (returnNodes.length === 0) return null;

			if (blockVarNodes.length > 0) {
				blockStatementNodes.unshift(t.variableDeclaration('const', blockVarNodes));
			}

			blockStatementNodes.push(
				t.returnStatement(t.arrayExpression(returnNodes))
			);

			const params = block.params.filter(param => param !== 'this' && param !== 'arguments');
			const blockFnNode = t.functionExpression(
				block.record.varNode,
				params.map(param => t.identifier(param)),
				t.blockStatement(blockStatementNodes)
			);
			return blockFnNode;
		}

		const statementNodes = [];
		const globalBlockNode = processBlock(this.globalBlock);
		if (globalBlockNode) {
			globalBlockNode.type = 'FunctionDeclaration';
			statementNodes.push(globalBlockNode);
		}

		/*
		const processedBlocks = new Set();
		function processBlock(block) { // eslint-disable-line no-unused-vars
			processedBlocks.add(block);

			let varName = ''; // eslint-disable-line no-shadow
			const statementNodes = [], // eslint-disable-line no-shadow
				returnNodes = [];
			for (const childBlock of block.children) {
				const fnNode = childBlock.node;
				if (fnNode) {
					varName = getNextVarName(varName);
					const idNode = t.identifier(varName);
					returnNodes.push(idNode);
					statementNodes.push(
						t.variableDeclaration('var', [t.variableDeclarator(idNode, fnNode)])
					);
				}

				const childBlockNode = processBlock(childBlock);
				if (childBlockNode) returnNodes.push(childBlockNode);
			}

			if (returnNodes.length === 0) return null;

			statementNodes.push(t.returnStatement(t.arrayExpression(returnNodes)));

			// console.log('block:', block);

			return t.functionExpression(null, [], t.blockStatement(statementNodes));
		}
		*/

		/*
		for (const [, block] of blocks) {
			if (processedBlocks.has(block)) continue;

			const blockNode = processBlock(block);
			blockNode.type = 'FunctionDeclaration';
			varName = getNextVarName(varName);
			blockNode.id = t.identifier(varName);
			statementNodes.push(blockNode);
		}
		*/

		// Resolve scopes
		/*
		const blocks = [];
		const blocksMap = new Map(); // Keyed by block ID
		for (const scope of scopes.values()) {
			const {blockId, parentScopeId} = scope;
			if (blocksMap.get(blockId)) continue;

			const block = {id: blockId, children: []};
			blocksMap.set(blockId, block);

			if (parentScopeId === null) {
				blocks.push(block);
			} else {
				const parentBlock = blocksMap.get(scopes.get(parentScopeId).blockId);
				parentBlock.children.push(block);
			}
		}
		*/

		// Create vars
		let varName = '';
		const varNodes = [];
		const records = [...this.records.values()];
		for (const {node: valNode, varNode, uses, assignments} of records) {
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

			varName = getNextVarName(varName);
			varNode.name = varName;
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
