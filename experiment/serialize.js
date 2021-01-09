'use strict';

// Modules
const assert = require('simple-invariant');

// Exports

module.exports = function serializeFunction(fn) { // eslint-disable-line no-unused-vars
	const capture = {scopes: []};
	// Debugger break point
	assert(capture.location, 'Failed to capture scope');
	return capture;
};
