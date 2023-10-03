/* --------------------
 * livepack module
 * Serialize arrays
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types'),
	{isNumber} = require('is-it-type');

// Imports
const {ARRAY_TYPE, registerSerializer} = require('./types.js');

// Exports

module.exports = {
	/**
	 * Trace Array.
	 * Array length is recorded as `record.extra.length`.
	 * @param {Array} arr - Array
	 * @param {Object} record - Record
	 * @returns {number} - Type ID
	 */
	traceArray(arr, record) {
		this.traceProperties(arr, record, undefined);
		record.extra = {length: arr.length};
		return ARRAY_TYPE;
	}
};

/**
 * Serialize Array.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @param {Object} record.extra - Extra props object
 * @param {number} record.extra.length - Array length
 * @returns {Object} - AST node
 */
function serializeArray(record) {
	const elementNodes = [],
		existingProps = [];
	let index = 0,
		numTrailingEmpty = 0,
		numTrailingCircularOrValueless = 0;
	for (const prop of record.props) {
		// Skip properties which aren't array elements
		const {key} = prop;
		if (!isNumber(key)) break;

		// Create gaps for non-existent props
		if (index !== key) {
			do {
				elementNodes.push(null);
				numTrailingEmpty++;
				index++;
			} while (index !== key);
			numTrailingCircularOrValueless = 0;
		}

		const {valRecord} = prop;
		if (valRecord && !valRecord.isCircular) {
			// Non-circular value
			elementNodes.push(this.serializeValue(valRecord));
			numTrailingEmpty = 0;
			numTrailingCircularOrValueless = 0;

			existingProps.push({
				key,
				valRecord,
				getRecord: undefined,
				setRecord: undefined,
				writable: true,
				enumerable: true,
				configurable: true
			});
		} else {
			// Circular value or getter/setter - leave to `wrapWithProperties()` to deal with
			elementNodes.push(null);
			numTrailingCircularOrValueless++;
		}

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

	// Add existing property for length.
	// NB: Length here is what length will be *after* any trailing circular properties are added.
	// `wrapWithProperties()` does not know that adding integer-keyed properties also alters `length`.
	existingProps.push({
		key: 'length',
		valRecord: this.traceValue(length),
		getRecord: undefined,
		setRecord: undefined,
		writable: true,
		enumerable: false,
		configurable: false
	});

	// Create array
	const node = t.arrayExpression(elementNodes);

	// Wrap with extra props
	return this.wrapWithProperties(node, record, this.arrayPrototypeRecord, existingProps);
}
registerSerializer(ARRAY_TYPE, serializeArray);
