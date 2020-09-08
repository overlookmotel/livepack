/* --------------------
 * livepack module
 * Serialize arrays
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{recordIsCircular} = require('./utils.js');

// Exports

module.exports = {
	serializeArray(arr, record) {
		const varName = record.varNode.name,
			elementNodes = [],
			defaultProps = [];
		let numTrailingCircularOrValueless = 0,
			numTrailingEmpty = 0;
		for (let index = 0; index < arr.length; index++) {
			let valNode;
			const descriptor = Object.getOwnPropertyDescriptor(arr, index);
			if (!descriptor) {
				valNode = null;
				numTrailingEmpty++;
				numTrailingCircularOrValueless = 0;
			} else if (!('value' in descriptor)) {
				valNode = null;
				numTrailingCircularOrValueless++;
			} else {
				const val = descriptor.value,
					valRecord = this.serializeValue(val, `${varName}_${index}`, `[${index}]`);
				valNode = valRecord.varNode;
				if (recordIsCircular(valRecord)) {
					// Circular reference - leave it to `wrapWithProperties()` to assign value
					valNode = null;
					numTrailingCircularOrValueless++;
				} else {
					createDependency(record, valRecord, elementNodes, index);
					numTrailingCircularOrValueless = 0;
					numTrailingEmpty = 0;
					defaultProps.push({
						name: `${index}`, value: val, writable: true, enumerable: true, configurable: true
					});
				}
			}

			elementNodes.push(valNode);
		}

		// If last entries were circular references or descriptors without values and will be set later
		// by assignment, placeholders entries can be removed without disrupting entry order.
		// Any empty elements that proceeded them can be removed too.
		if (numTrailingCircularOrValueless > 0) {
			elementNodes.length -= numTrailingCircularOrValueless + numTrailingEmpty;
		}

		// Create array node and wrap in extra properties (including circular assignments)
		const node = t.arrayExpression(elementNodes);
		return this.wrapWithProperties(arr, record, node, Array.prototype, defaultProps, arrayShouldSkipKey);
	}
};

function arrayShouldSkipKey(key) {
	return key === 'length';
}
