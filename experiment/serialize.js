'use strict';

// Modules
const assert = require('simple-invariant');

// Exports

module.exports = function serializeFunction(fn) {
	const capture = {scopes: []};
	// Debugger break point
	fn();
	assert(capture);
	// assert(capture.location, 'Failed to capture scope');
	return capture;
};
