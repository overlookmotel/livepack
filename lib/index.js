/* --------------------
 * livepack module
 * Entry point
 * ------------------*/

'use strict';

// Modules
const {isFunction} = require('is-it-type');

// Imports
const tracker = require('./tracker.js'),
	{fns, invocations} = tracker;

// Exports

module.exports = function serialize(val) {
	if (isFunction(val)) return serializeFunction(val);
	return 'NOT A FUNCTION';
};

function serializeFunction(fn) {
	// Call function to get values from enclosing scope
	tracker.getValues = true;
	let res;
	try {
		fn();
		throw new Error('Should have thrown an error');
	} catch (err) {
		if (err instanceof Error) throw err;
		res = err;
	}
	tracker.getValues = false;

	const {fnId, values, parentInvocationId} = res;

	// Record values in invocation record
	invocations[parentInvocationId].values = values;

	// Get function's AST
	const ast = fns[fnId];

	// TODO
	console.log({fnId, values, parentInvocationId, ast}); // eslint-disable-line no-console

	return 'FUNCTION';
}
