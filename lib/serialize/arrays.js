/* --------------------
 * livepack module
 * Serialize arrays
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types'),
	{isNumber} = require('is-it-type');

// Constants
const MODIFIER_NAMES = ['writable', 'enumerable', 'configurable'];

// Exports

module.exports = {
	/**
	 * Trace Array.
	 * Array length is recorded as `record.extra.length`.
	 * @param {Array} arr - Array
	 * @param {Object} record - Record
	 * @returns {Function} - Serializer function
	 */
	traceArray(arr, record) {
		this.traceProperties(arr, record, Array.prototype, undefined, arrayShouldSkipKey);
		record.extra.length = arr.length;
		return this.serializeArray;
	},

	/**
	 * Serialize Array.
	 * @param {Object} record - Record
	 * @param {Array<Object>} record.props - Properties
	 * @param {number} record.extra.length - Array length
	 * @param {Object} [record.extra.protoRecord] - Record for prototype if it's not default
	 * @param {number} record.extra.extensibility - Extensibility (e.g. `FROZEN`)
	 * @param {Map} record.extra.deletedKeys - Map of deleted keys (key mapped to keyRecord)
	 * @returns {Object} - AST node
	 */
	serializeArray(record) {
		const elementNodes = [],
			extraProps = [];
		let index = 0,
			numTrailingEmpty = 0,
			numTrailingCircularOrValueless = 0;
		for (let prop of record.props) {
			// Skip properties which aren't array elements
			const {key} = prop;
			if (!isNumber(key)) {
				extraProps.push(prop);
				continue;
			}

			// Create gaps for empty keys
			if (index !== key) {
				do {
					elementNodes.push(null);
					numTrailingEmpty++;
					index++;
				} while (index !== key);
				numTrailingCircularOrValueless = 0;
			}

			const {valRecord} = prop;
			let elementNode = null;
			if (valRecord) {
				const valNode = this.serializeValue(valRecord);
				if (!valRecord.isCircular) {
					// Non-circular value
					elementNode = valNode;
					numTrailingEmpty = 0;
					numTrailingCircularOrValueless = 0;

					// If requires descriptor to be modified, add to `extraProps`
					// for `wrapWithProperties()` to add descriptor
					if (MODIFIER_NAMES.some(modifierName => prop[modifierName] === false)) {
						prop = {...prop, valRecord: undefined, isExisting: true};
						for (const modifierName of MODIFIER_NAMES) {
							if (prop[modifierName]) prop[modifierName] = undefined;
						}
						extraProps.push(prop);
					}
				} else {
					// Circular value - pass to `wrapWithProperties()` to deal with
					extraProps.push({...prop, valNode});
					numTrailingCircularOrValueless++;
				}
			} else {
				// Getter/setter - pass to `wrapWithProperties()` to deal with
				numTrailingCircularOrValueless++;
				extraProps.push(prop);
			}

			elementNodes.push(elementNode);
			index++;
		}

		const {length} = record.extra;
		if (index !== length) {
			// Add empty elements to fill up to length
			do {
				elementNodes.push(null);
				index++;
			} while (index !== length);
		} else if (numTrailingCircularOrValueless > 0) {
			// Last entries were circular references or descriptors without values and will be set later.
			// Empty trailing entries can be removed without disrupting entry order.
			elementNodes.length -= numTrailingCircularOrValueless + numTrailingEmpty;
		}

		// Create array
		const node = t.arrayExpression(elementNodes);

		// Wrap with extra props
		return this.wrapWithProperties(record, extraProps, node);
	}
};

function arrayShouldSkipKey(key) {
	return key === 'length';
}
