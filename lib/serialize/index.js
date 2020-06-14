/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

/* eslint-disable no-console */

'use strict';

// Modules
const {isObject, isFunction, isArray} = require('is-it-type'),
	generate = require('@babel/generator').default,
	t = require('@babel/types');

// Imports
const functionMethods = require('./function.js'),
	objectMethods = require('./object.js'),
	{isPrimitive, serializePrimitive} = require('./primitive.js'),
	Circular = require('./circular.js');

// Exports

class Serializer {
	constructor() {
		this.records = new Map(); // Keyed by value
		this.scopes = new Map(); // Keyed by scope ID
		this.blocks = new Map(); // Keyed by block ID
		this.globalBlock = this.createBlock(0, null);
		this.functions = new Map(); // Keyed by function ID
		this.current = new Map();
	}

	serialize(val) {
		// Create export
		const exportNode = t.assignmentExpression(
			'=',
			t.memberExpression(t.identifier('module'), t.identifier('exports')),
			t.identifier('x')
		);

		// Serialize value
		exportNode.right = this.serializeValue(val, exportNode, 'right');

		console.log('records:', this.records);
		// console.log('scopes:');
		// console.dir([...this.scopes.values()], {depth: 5});

		// Sort blocks by ID
		// const blocks = new Map([...this.blocks.entries()].sort((a, b) => a.id > b.id));
		// this.blocks = blocks;

		console.log('globalBlock:');
		console.dir(this.globalBlock, {depth: 5});

		let varName = '';
		const varNodes = [],
			statementNodes = [];

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
		if (varNodes.length > 0) statementNodes.unshift(t.variableDeclaration('var', varNodes));
		statementNodes.push(t.expressionStatement(exportNode));

		// Compile to JS
		const programNode = t.program(statementNodes);
		return generate(programNode, {comments: false}).code;
	}

	serializeValue(val, parentNode, key) {
		if (isPrimitive(val)) return serializePrimitive(val);

		const {records} = this;
		let record = records.get(val);
		let uses;
		let varNode;
		if (record) {
			uses = record.uses;
			varNode = record.varNode;
		} else {
			// If circular reference, return `Circular` object
			const {current} = this;
			varNode = current.get(val);
			if (varNode) return new Circular(varNode);

			// Add to list of values currently being processed
			varNode = t.identifier('x');
			current.set(val, varNode);

			// Serialize value and create record
			const props = this.serializeThing(val);
			record = this.createRecord(val, varNode);
			Object.assign(record, props);

			uses = record.uses;
			if (props.uses) {
				// Self-references
				for (const use of uses) {
					use.parentNode[use.key] = varNode;
				}
			}

			// Remove from list of values currently being processed
			current.delete(val);
		}

		if (parentNode) uses.push({parentNode, key});

		return varNode;
	}

	serializeThing(val) {
		if (isFunction(val)) return this.serializeFunction(val);
		if (isObject(val)) return this.serializeObject(val);
		if (isArray(val)) return this.serializeArray(val);
		throw new Error(`Cannot serialize ${val}`);
	}

	createRecord(val, varNode) {
		const record = {varNode, node: undefined, uses: [], assignments: undefined};
		this.records.set(val, record);
		return record;
	}
}

Object.assign(Serializer.prototype, functionMethods, objectMethods);

module.exports = function serialize(val) {
	const serializer = new Serializer();
	return serializer.serialize(val);
};

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
