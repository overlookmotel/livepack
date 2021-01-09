/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind`, `WeakMap`, `WeakSet`, `Symbol`.
 * ------------------*/

'use strict';

// Imports
const tracker = require('../tracker.js');

// Exports

// Capture `module`, `require` and module vars from file + return tracker
const commonJsVars = new Map(),
	moduleVars = Object.create(null);
module.exports = (path, module, require, vars) => {
	commonJsVars.set(module, {name: 'module', path});

	if (moduleVars) {
		// ESM
		moduleVars[path] = vars;
	} else {
		// CommonJS
		commonJsVars.set(require, {name: 'require', path});
	}

	return tracker;
};

// Imports
// These imports are after export to avoid circular requires in Jest tests
const getFunctions = require('./functions.js'),
	{getWeakSets, getWeakMaps} = require('./weak.js'),
	getEmptyStringSymbols = require('./symbols.js'),
	getGlobals = require('./globals.js'),
	internal = require('../internal.js');

// Init internal vars
internal.functions = getFunctions();
internal.weakSets = getWeakSets();
internal.weakMaps = getWeakMaps();
internal.emptyStringSymbols = getEmptyStringSymbols();
internal.globals = getGlobals();
internal.commonJsVars = commonJsVars;
internal.moduleVars = moduleVars;
