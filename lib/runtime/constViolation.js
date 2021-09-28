/* --------------------
 * livepack module
 * `constViolation()` runtime function
 * ------------------*/

/* eslint-disable strict, no-const-assign, no-unused-vars */

// Exports

module.exports = () => {
	const c = 0;
	c = 1;
};
