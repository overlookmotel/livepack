/* --------------------
 * livepack module
 * Serialize functions
 * ------------------*/

'use strict';

// Modules
const t = require('@babel/types');

// Imports
const {createDependency} = require('./records.js'),
	{createArguments} = require('./external.js');

// Exports

const arraySlice = Array.prototype.slice;

module.exports = function serializeArguments(args, record) {
	// Serialize as array
	const argsArray = arraySlice.call(args);
	const arrayNode = this.serializeArray(argsArray, record);

	// Create call to `createArguments` function
	const createArgumentsRecord = this.serializeValue(createArguments, 'createArguments');
	const node = t.callExpression(createArgumentsRecord.varNode, arrayNode.elements);
	createDependency(record, createArgumentsRecord, node, 'callee');

	// Wrap in properties
	const defaultProps = [];
	for (let index = 0; index < args.length; index++) {
		defaultProps[index] = {
			name: `${index}`, value: args[index], writable: true, enumerable: true, configurable: true
		};
	}
	defaultProps.push({
		name: 'length', value: args.length, writable: true, enumerable: false, configurable: true
	});

	return this.wrapWithProperties(
		args, record, node, Object.prototype, defaultProps, argumentsShouldSkipKey
	);
};

function argumentsShouldSkipKey(key) {
	// TODO Would be better to include `Symbol.iterator` in default props
	return key === 'callee' || key === Symbol.iterator;
}
