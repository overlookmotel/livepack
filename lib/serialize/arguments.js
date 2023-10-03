/* --------------------
 * livepack module
 * Serialize arguments objects
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types'),
	{isNumber} = require('is-it-type');

// Imports
const {ARGUMENTS_TYPE, registerSerializer} = require('./types.js');

// Exports

module.exports = traceArguments;

/**
 * Trace arguments object.
 * @this {Object} Serializer
 * @param {Object} args - Arguments object
 * @param {Object} record - Record
 * @returns {number} - Type ID
 */
function traceArguments(args, record) {
	this.traceProperties(args, record, argumentsShouldSkipKey);
	return ARGUMENTS_TYPE;
}

/**
 * Serialize arguments object.
 * Use runtime function `createArguments()` to generate the arguments object.
 * @this {Object} Serializer
 * @param {Object} record - Record
 * @returns {Object} - AST node
 */
function serializeArguments(record) {
	const argumentNodes = [],
		existingProps = [];
	const pushUndefinedArg = (index) => {
		argumentNodes.push(this.serializeValue(this.undefinedRecord));
		existingProps.push({
			key: index,
			valRecord: this.undefinedRecord,
			getRecord: undefined,
			setRecord: undefined,
			writable: true,
			enumerable: true,
			configurable: true
		});
	};

	// Get all arguments which can be passed to `createArguments()`
	let nextIndex = 0;
	for (const prop of record.props) {
		// Skip non-integer keys
		const index = prop.key;
		if (!isNumber(index)) break;

		// Fill gaps (deleted properties) with `undefined`
		while (index !== nextIndex) {
			pushUndefinedArg(nextIndex);
			nextIndex++;
		}

		const {valRecord} = prop;
		if (valRecord && !valRecord.isCircular) {
			// Value is present (not a getter/setter) and is not circular - add to arguments
			argumentNodes.push(this.serializeValue(valRecord));
			existingProps.push({
				key: index,
				valRecord,
				getRecord: undefined,
				setRecord: undefined,
				writable: true,
				enumerable: true,
				configurable: true
			});
		} else {
			// Add `undefined` to arguments
			pushUndefinedArg(index);
		}

		nextIndex++;
	}

	// Add `length` to existing props
	existingProps.push({
		key: 'length',
		valRecord: this.traceAndSerializeGlobal(nextIndex),
		getRecord: undefined,
		setRecord: undefined,
		writable: true,
		enumerable: false,
		configurable: true
	});

	// Use runtime function `createArguments` to create arguments object.
	// `createArguments(x, y, z)`
	// TODO: Write `traceAndSerializeRuntime()`.
	// Will require an extra pass to figure out what output the runtime function goes in,
	// and add it to that output file (or create a new output file), after globals.
	const createArgumentsNode = this.traceAndSerializeRuntime('createArguments', record); // TODO
	const node = t.callExpression(createArgumentsNode, argumentNodes);

	// Wrap will additional properties + delete deleted properties
	return this.wrapWithProperties(node, record, this.objectPrototypeRecord, existingProps);
}
registerSerializer(ARGUMENTS_TYPE, serializeArguments);

function argumentsShouldSkipKey(key) {
	// TODO: Would be better to include `Symbol.iterator` in default props
	return key === 'callee' || key === Symbol.iterator;
}
