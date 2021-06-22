/* --------------------
 * livepack module
 * `createBinding()` runtime function
 * ------------------*/

/* eslint-disable strict, no-return-assign */

// Exports

module.exports = bound => [
	(...vars) => bound(...vars),
	_bound => bound = _bound
];
