/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind`, `WeakMap`, `WeakSet`, `Symbol`.
 * ------------------*/

'use strict';

// Imports
const tracker = require('../tracker.js');

// Capture `module` + `require` from file + return tracker
const commonJsVars = new Map();
module.exports = (path, module, require) => {
	commonJsVars.set(module, {name: 'module', path});
	commonJsVars.set(require, {name: 'require', path});
	return tracker;
};

// Init internal vars
// NB These imports are after export to avoid circular requires in tests
const getBoundFunctions = require('./functions.js'),
	{getWeakSets, getWeakMaps} = require('./weak.js'),
	getEmptyStringSymbols = require('./symbols.js'),
	getUrlVars = require('./urls.js'),
	getGlobals = require('./globals.js'),
	internal = require('../internal.js');

internal.boundFunctions = getBoundFunctions();
internal.weakSets = getWeakSets();
internal.weakMaps = getWeakMaps();
internal.emptyStringSymbols = getEmptyStringSymbols();
internal.urlVars = getUrlVars();
internal.commonJsVars = commonJsVars;
internal.globals = getGlobals(internal);
