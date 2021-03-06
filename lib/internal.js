/* --------------------
 * livepack module
 * Internal state
 * ------------------*/

'use strict';

// Exports

module.exports = {
	functions: undefined,
	weakSets: undefined,
	weakMaps: undefined,
	emptyStringSymbols: undefined,
	globals: undefined,
	commonJsVars: undefined,
	transpiledFiles: Object.create(null)
};
