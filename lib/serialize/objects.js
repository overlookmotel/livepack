/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const Circular = require('./circular.js'),
	{isPrimitive} = require('./primitives.js');

// Exports

module.exports = {
	serializeObject(obj, varNode) {
		let numTrailingCircular = 0;
		const propertyNodes = [],
			dependencies = [],
			assignments = [];
		for (const key of Object.getOwnPropertyNames(obj)) {
			const keyNode = t.identifier(key);
			const val = obj[key];
			const valNode = this.serializeValue(val);
			if (valNode instanceof Circular) {
				const assignmentNode = t.assignmentExpression(
					'=',
					t.memberExpression(varNode, keyNode),
					valNode.node
				);
				assignments.push(t.expressionStatement(assignmentNode));

				if (!isPrimitive(val)) dependencies.push({val, node: assignmentNode, key: 'right'});

				// Insert `null` placeholder to retain key order
				propertyNodes.push(t.objectProperty(keyNode, t.nullLiteral()));
				numTrailingCircular++;
			} else {
				const propNode = t.objectProperty(keyNode, valNode);
				propertyNodes.push(propNode);
				if (!isPrimitive(val)) dependencies.push({val, node: propNode, key: 'value'});
				numTrailingCircular = 0;
			}
		}

		// If last properties were circular references and will be set later by assignment,
		// placeholders properties can be removed without disrupting key order
		if (numTrailingCircular > 0) propertyNodes.length -= numTrailingCircular;

		const node = t.objectExpression(propertyNodes);

		const res = {node, dependencies};
		if (assignments.length > 0) res.assignments = assignments;
		return res;
	},

	serializeArray(arr, varNode) {
		let numTrailingCircular = 0,
			numTrailingEmpty = 0;
		const elementNodes = [],
			dependencies = [],
			assignments = [];
		for (let index = 0; index < arr.length; index++) {
			const val = arr[index];
			let valNode;
			if (!(index in arr)) {
				valNode = null;
				numTrailingEmpty++;
			} else {
				valNode = this.serializeValue(val);
				if (valNode instanceof Circular) {
					const assignmentNode = t.assignmentExpression(
						'=',
						t.memberExpression(varNode, t.numericLiteral(index), true),
						valNode.node
					);
					assignments.push(t.expressionStatement(assignmentNode));

					if (!isPrimitive(val)) dependencies.push({val, node: assignmentNode, key: 'right'});

					valNode = null;
					numTrailingCircular++;
				} else {
					if (!isPrimitive(val)) dependencies.push({val, node: elementNodes, key: index});
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

		const node = t.arrayExpression(elementNodes);

		const res = {node, dependencies};
		if (assignments.length > 0) res.assignments = assignments;
		return res;
	}
};
