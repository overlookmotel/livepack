/* --------------------
 * livepack module
 * Entry point
 * ------------------*/

'use strict';

// Modules
const {isFunction} = require('is-it-type');

// Imports
const tracker = require('./tracker.js');

// Exports

module.exports = function serialize(val) {
	if (isFunction(val)) return serializeFunction(val);
	return 'NOT A FUNCTION';
};

function serializeFunction(fn) {
	tracker.getValues = true;
	let fnId, values;
	try {
		fn();
		throw new Error('Should have thrown an error');
	} catch (err) {
		if (err instanceof Error) throw err;
		values = err;
		fnId = err.fnId;
		values = err.values;
	}
	tracker.getValues = false;

	console.log({fnId, values}); // eslint-disable-line no-console
	return 'FUNCTION';
}
