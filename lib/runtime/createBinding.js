/* --------------------
 * livepack module
 * `createBinding()` runtime function
 * ------------------*/

'use strict';

// Exports

module.exports = bound => [
	(...vars) => bound(...vars),
	_bound => bound = _bound // eslint-disable-line no-return-assign
];
