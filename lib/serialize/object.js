/* --------------------
 * livepack module
 * Serialize objects
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Exports

module.exports = {
	serializeObject(obj) {
		const node = t.objectExpression([]);
		node.properties = Object.getOwnPropertyNames(obj).map(key => (
			t.objectProperty(
				t.identifier(key),
				this.serializeValue(obj[key], node, 'properties')
			)
		));
		return {node};
	},

	serializeArray(arr) {
		const node = t.arrayExpression([]);
		node.elements = arr.map((val, index) => {
			if (index in arr) return this.serializeValue(val, node, 'elements');
			return null;
		});
		return {node};
	}
};
