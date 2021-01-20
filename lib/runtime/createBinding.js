/* --------------------
 * livepack module
 * `createBinding()` runtime function
 * ------------------*/

'use strict';

// Exports

module.exports = () => {
	let bound;
	return [
		(...vars) => bound(...vars),
		_bound => bound = _bound // eslint-disable-line no-return-assign
	];
};
