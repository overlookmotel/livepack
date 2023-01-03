/* --------------------
 * livepack module
 * Internal state
 * ------------------*/

'use strict';

// Exports

module.exports = {
	globals: new Map(), // Keyed by value
	functions: new WeakMap(), // Keyed by value
	weakSets: undefined,
	weakMaps: undefined,
	splitPoints: new Map(), // Keyed by value
	nativeEval: undefined
};
