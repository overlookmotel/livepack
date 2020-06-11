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
	{isPrimitive, serializePrimitive} = require('./primitive.js');

// Exports

class Serializer {
	constructor() {
		this.records = new Map(); // Keyed by value
		this.scopes = new Map(); // Keyed by scope ID
	}

	serialize(val) {
		// Serialize value
		this.serializeValue(val);

		console.log('records:', this.records); // eslint-disable-line no-console
		console.log('scopes:', this.scopes); // eslint-disable-line no-console

		// Resolve scopes
		// TODO

		// Compile JS vars
		let varName = '';
		let exportVarName;
		const varNodes = [];
		for (const [varVal, {node: valNode, uses}] of this.records) {
			varName = getNextVarName(varName);
			varNodes.push(t.variableDeclarator(t.identifier(varName), valNode));
			for (const {node: useNode} of uses) {
				useNode.name = varName;
			}
			if (varVal === val) exportVarName = varName;
		}

		// Compile program
		const programNode = t.program([
			t.variableDeclaration('var', varNodes),
			t.expressionStatement(
				t.assignmentExpression(
					'=',
					t.memberExpression(t.identifier('module'), t.identifier('exports')),
					t.identifier(exportVarName)
				)
			)
		]);

		// Convert to JS
		return generate(programNode, {comments: false}).code;
	}

	serializeValue(val, parentNode, key) {
		if (isPrimitive(val)) return serializePrimitive(val);

		const {records} = this;
		let record = records.get(val);
		let uses;
		if (record) {
			uses = record.uses;
		} else {
			record = this.serializeThing(val);
			uses = [];
			record.uses = uses;
			records.set(val, record);
		}

		const varNode = t.identifier('x');
		record.uses.push({node: varNode, parentNode, key});
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
