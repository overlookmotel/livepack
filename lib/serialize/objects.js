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
	serializeObject(obj) {
		const propertyNodes = [],
			dependencies = [],
			assignments = [];
		for (const key of Object.getOwnPropertyNames(obj)) {
			const keyNode = t.identifier(key);
			const val = obj[key];
			const valNode = this.serializeValue(val);
			if (valNode instanceof Circular) {
				assignments.push({keyNode, valNode: valNode.node, computed: false});
			} else {
				const propNode = t.objectProperty(keyNode, valNode);
				propertyNodes.push(propNode);
				if (!isPrimitive(val)) dependencies.push({val, node: propNode, key: 'value'});
			}
		}

		const node = t.objectExpression(propertyNodes);

		const res = {node, dependencies};
		if (assignments.length > 0) res.assignments = assignments;
		return res;
	},

	serializeArray(arr) {
		const elementNodes = [],
			dependencies = [],
			assignments = [];
		for (let index = 0; index < arr.length; index++) {
			const val = arr[index];
			let valNode;
			if (!(index in arr)) {
				valNode = null;
			} else {
				valNode = this.serializeValue(val);
				if (valNode instanceof Circular) {
					assignments.push({keyNode: t.numericLiteral(index), valNode: valNode.node, computed: true});
					valNode = null;
				} else if (!isPrimitive(val)) {
					dependencies.push({val, node: elementNodes, key: index});
				}
			}

			elementNodes.push(valNode);
		}

		const node = t.arrayExpression(elementNodes);

		const res = {node, dependencies};
		if (assignments.length > 0) res.assignments = assignments;
		return res;
	}
};
