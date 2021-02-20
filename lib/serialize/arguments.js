/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{recordIsCircular, isIntegerKey} = require('./utils.js');

// Exports

module.exports = function serializeArguments(args, record) {
	const varName = record.varNode.name,
		undefinedRecord = this.serializeValue(undefined),
		argumentNodes = [],
		defaultProps = [];
	for (const key of Object.getOwnPropertyNames(args)) {
		if (!isIntegerKey(key)) break;

		// Fill gaps (deleted elements) with undefined
		const index = key * 1;
		let nextIndex = argumentNodes.length;
		while (index !== nextIndex) {
			argumentNodes[nextIndex] = undefinedRecord.varNode;
			createDependency(record, undefinedRecord, argumentNodes, nextIndex);
			defaultProps[nextIndex] = {
				name: `${nextIndex}`, value: undefined, writable: true, enumerable: true, configurable: true
			};
			nextIndex++;
		}

		// Add value
		const descriptor = Object.getOwnPropertyDescriptor(args, key);
		let val = descriptor.value,
			valRecord = this.serializeValue(val, `${varName}_${key}`, `[${key}]`);
		if (recordIsCircular(valRecord)) {
			// Circular reference - leave it to `wrapWithProperties()` to assign value
			val = undefined;
			valRecord = undefinedRecord;
		}

		argumentNodes[index] = valRecord.varNode;
		createDependency(record, valRecord, argumentNodes, index);
		defaultProps[index] = {
			name: key, value: val, writable: true, enumerable: true, configurable: true
		};
	}

	// Create call to `createArguments` function
	const createArgumentsRecord = this.serializeRuntime('createArguments');
	const node = t.callExpression(createArgumentsRecord.varNode, argumentNodes);
	createDependency(record, createArgumentsRecord, node, 'callee');

	// Wrap in properties
	defaultProps.push({
		name: 'length', value: argumentNodes.length, writable: true, enumerable: false, configurable: true
	});

	return this.wrapWithProperties(
		args, record, node, Object.prototype, defaultProps, argumentsShouldSkipKey
	);
};

function argumentsShouldSkipKey(key) {
	// TODO Would be better to include `Symbol.iterator` in default props
	return key === 'callee' || key === Symbol.iterator;
}
