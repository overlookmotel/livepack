/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./dependencies.js'),
	{isJsIdentifier} = require('./utils.js');

// Exports

module.exports = {
	serializeObject(obj, record) {
		let numTrailingCircular = 0;
		const propertyNodes = [];
		for (const key of Object.getOwnPropertyNames(obj)) {
			const keyIsComputed = !isJsIdentifier(key);
			const keyNode = keyIsComputed ? t.stringLiteral(key) : t.identifier(key);
			const valRecord = this.serializeValue(obj[key], key);
			if (valRecord.node === undefined) {
				// Circular reference
				const assignmentNode = t.assignmentExpression(
					'=',
					t.memberExpression(record.varNode, keyNode, keyIsComputed),
					valRecord.varNode
				);

				const assignment = createAssignment(record, assignmentNode);
				createDependency(assignment, valRecord, assignmentNode, 'right');

				// Insert `null` placeholder to retain key order
				propertyNodes.push(t.objectProperty(keyNode, t.nullLiteral()));
				numTrailingCircular++;
			} else {
				const valNode = valRecord.varNode || valRecord.node;
				const propNode = t.objectProperty(keyNode, valNode, keyIsComputed, !keyIsComputed);
				propertyNodes.push(propNode);
				createDependency(record, valRecord, propNode, 'value');
				numTrailingCircular = 0;
			}
		}

		// If last properties were circular references and will be set later by assignment,
		// placeholders properties can be removed without disrupting key order
		if (numTrailingCircular > 0) propertyNodes.length -= numTrailingCircular;

		return t.objectExpression(propertyNodes);
	},

	serializeArray(arr, record, parentName) {
		let numTrailingCircular = 0,
			numTrailingEmpty = 0;
		const elementNodes = [];
		for (let index = 0; index < arr.length; index++) {
			let valNode;
			if (!(index in arr)) {
				valNode = null;
				numTrailingEmpty++;
				numTrailingCircular = 0;
			} else {
				const valRecord = this.serializeValue(arr[index], `${parentName}_${index}`);
				valNode = valRecord.varNode || valRecord.node;
				if (valRecord.node === undefined) {
					// Circular reference
					const assignmentNode = t.assignmentExpression(
						'=',
						t.memberExpression(record.varNode, t.numericLiteral(index), true),
						valNode
					);

					const assignment = createAssignment(record, assignmentNode);
					createDependency(assignment, valRecord, assignmentNode, 'right');

					valNode = null;
					numTrailingCircular++;
				} else {
					createDependency(record, valRecord, elementNodes, index);
					numTrailingCircular = 0;
					numTrailingEmpty = 0;
				}
			}

			elementNodes.push(valNode);
		}

		// If last entries were circular references and will be set later by assignment,
		// placeholders entries can be removed without disrupting entry order.
		// Any empty elements that proceeded them can be removed too.
		if (numTrailingCircular > 0) elementNodes.length -= numTrailingCircular + numTrailingEmpty;

		return t.arrayExpression(elementNodes);
	}
};
