/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const Circular = require('./circular.js');

// Exports

module.exports = {
	serializeObject(obj) {
		const node = t.objectExpression([]);

		const propertyNodes = [],
			assignments = [];
		for (const key of Object.getOwnPropertyNames(obj)) {
			const keyNode = t.identifier(key);
			const valNode = this.serializeValue(obj[key], node, 'properties');
			if (valNode instanceof Circular) {
				assignments.push({keyNode, valNode: valNode.node, computed: false});
			} else {
				propertyNodes.push(t.objectProperty(keyNode, valNode));
			}
		}

		node.properties = propertyNodes;
		return assignments.length > 0 ? {node, assignments} : {node};
	},

	serializeArray(arr) {
		const node = t.arrayExpression([]);

		const assignments = [];
		const elementNodes = arr.map((val, index) => {
			if (!(index in arr)) return null;

			const valNode = this.serializeValue(val, node, 'elements');
			if (valNode instanceof Circular) {
				assignments.push({keyNode: t.numericLiteral(index), valNode: valNode.node, computed: true});
				return null;
			}
			return valNode;
		});

		node.elements = elementNodes;

		return assignments.length > 0 ? {node, assignments} : {node};
	}
};
