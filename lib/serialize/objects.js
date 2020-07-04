/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./records.js'),
	{isJsIdentifier, recordIsCircular} = require('./utils.js');

// Exports

module.exports = {
	serializeObject(obj, record) {
		let numTrailingCircular = 0;
		const propertyNodes = [];
		for (const key of Object.getOwnPropertyNames(obj)) {
			const keyIsComputed = !isJsIdentifier(key);
			const keyNode = keyIsComputed ? t.stringLiteral(key) : t.identifier(key);
			const valRecord = this.serializeValue(obj[key], key);
			if (recordIsCircular(valRecord)) {
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
				const valNode = valRecord.varNode;
				const propNode = t.objectProperty(keyNode, valNode, false, true);
				propertyNodes.push(propNode);
				createDependency(record, valRecord, propNode, 'value');
				numTrailingCircular = 0;
			}
		}

		// If last properties were circular references and will be set later by assignment,
		// placeholders properties can be removed without disrupting key order
		if (numTrailingCircular > 0) propertyNodes.length -= numTrailingCircular;

		return t.objectExpression(propertyNodes);
	}
};
