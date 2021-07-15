/* --------------------
 * livepack module
 * `createBinding()` runtime function
 * ------------------*/

/* eslint-disable no-return-assign */

'use strict';

// Exports

module.exports = bound => [
	(...vars) => bound(...vars),
	_bound => bound = _bound
];
