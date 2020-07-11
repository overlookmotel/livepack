/* --------------------
 * livepack module
 * Serialize arrays
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency, createAssignment} = require('./records.js'),
	{recordIsCircular} = require('./utils.js');

// Exports

module.exports = {
	serializeArray(arr, record) {
		const varName = record.varNode.name,
			elementNodes = [];
		let numTrailingCircular = 0,
			numTrailingEmpty = 0;
		for (let index = 0; index < arr.length; index++) {
			let valNode;
			if (!(index in arr)) {
				valNode = null;
				numTrailingEmpty++;
				numTrailingCircular = 0;
			} else {
				const valRecord = this.serializeValue(arr[index], `${varName}_${index}`);
				valNode = valRecord.varNode;
				if (recordIsCircular(valRecord)) {
					// Circular reference
					const memberNode = t.memberExpression(record.varNode, t.numericLiteral(index), true);
					const assignmentNode = t.assignmentExpression('=', memberNode, valNode);

					const assignment = createAssignment(record, assignmentNode, memberNode, 'object');
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

		// Create array node and wrap in extra properties
		const node = t.arrayExpression(elementNodes);
		return this.wrapWithProperties(arr, record, node, arrayShouldSkipKey); // TODO Default descriptors?
	}
};

// See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/length
const MAX_ARRAY_LEN = 4294967295;
function arrayShouldSkipKey(key) {
	if (key === 'length' || key === '0') return true;
	if (!key.match(/^[1-9]\d*$/)) return false;
	return key * 1 < MAX_ARRAY_LEN;
}
