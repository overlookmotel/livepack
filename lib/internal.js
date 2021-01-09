/* --------------------
 * livepack module
 * Internal state
 * ------------------*/

'use strict';

// Exports

module.exports = {
	functions: undefined,
	emptyStringSymbols: undefined,
	globals: undefined,
	commonJsVars: undefined,
	moduleVars: undefined,
	transpiledFiles: Object.create(null),
	modules: new Map()
};
