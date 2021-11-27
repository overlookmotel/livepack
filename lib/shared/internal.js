/* --------------------
 * livepack module
 * Internal state
 * ------------------*/

'use strict';

// Exports

module.exports = {
	globals: new Map(), // Keyed by value
	functions: undefined,
	weakSets: undefined,
	weakMaps: undefined,
	transpiledFiles: Object.create(null),
	splitPoints: new Map(), // Keyed by value
	esmAliases: Object.create(null) // Keyed by URL
};
