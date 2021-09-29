/* --------------------
 * livepack module
 * `getOwnPropertyNamesAndSymbols()` runtime function
 * ------------------*/

/* eslint-disable strict */

// Exports

const {getOwnPropertyNames, getOwnPropertySymbols} = Object;

module.exports = typeof getOwnPropertySymbols === 'function'
	? obj => getOwnPropertyNames(obj).concat(getOwnPropertySymbols(obj))
	: getOwnPropertyNames;
