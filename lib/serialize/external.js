/* --------------------
 * livepack module
 * External functions
 * These functions are used within output.
 * ------------------*/

'use strict';

// Exports

const createArguments = (0, function() { return arguments; }); // eslint-disable-line prefer-rest-params

const createBinding = (0, () => {
	let bound;
	return [
		(...vars) => bound(...vars),
		_bound => bound = _bound // eslint-disable-line no-return-assign
	];
});

module.exports = {
	createArguments,
	createBinding
};
