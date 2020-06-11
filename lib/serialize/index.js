/* --------------------
 * livepack module
 * Serialize
 * ------------------*/

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

		console.log('records:', this.records); // eslint-disable-line no-console
		console.log('scopes:', this.scopes); // eslint-disable-line no-console

		// Resolve scopes
		// TODO

		// Create vars
		let varName = '';
		const varNodes = [],
			assignmentNodes = [];
		const records = [...this.records.values()].reverse();
		for (const {node: valNode, varNode, uses, assignments} of records) {
			if (uses.length === 0 && !assignments) continue;

			varName = getNextVarName(varName);
			varNode.name = varName;
			varNodes.push(t.variableDeclarator(varNode, valNode));

			if (assignments) {
				for (const assignment of assignments) {
					assignmentNodes.push(
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

		// Create program
		const programNode = t.program([
			t.variableDeclaration('var', varNodes),
			...assignmentNodes,
			t.expressionStatement(exportNode)
		]);

		// Compile to JS
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
			if (!record.node) return new Circular(varNode);
		} else {
			varNode = t.identifier('x');
			uses = [];
			record = {varNode, node: undefined, uses, assignments: undefined};
			records.set(val, record);

			Object.assign(record, this.serializeThing(val));
		}

		uses.push({parentNode, key});

		return varNode;
	}

	serializeThing(val) {
		if (isFunction(val)) return this.serializeFunction(val);
		if (isObject(val)) return this.serializeObject(val);
		if (isArray(val)) return this.serializeArray(val);
		throw new Error(`Cannot serialize ${val}`);
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
