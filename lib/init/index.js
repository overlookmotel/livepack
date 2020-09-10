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

// Capture `module` + `require` from file + return tracker
const commonJsVars = new Map();
module.exports = (path, module, require) => {
	commonJsVars.set(module, {name: 'module', path});
	commonJsVars.set(require, {name: 'require', path});
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
