/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind`, `WeakMap`, `WeakSet`, `Symbol`.
 * ------------------*/

'use strict';

// Imports
const getFunctions = require('./functions.js'),
	{getWeakSets, getWeakMaps} = require('./weak.js'),
	getEmptyStringSymbols = require('./symbols.js'),
	getGlobals = require('./globals.js'),
	internal = require('../internal.js'),
	tracker = require('../tracker.js');

// Init internal vars

internal.functions = getFunctions();
internal.weakSets = getWeakSets();
internal.weakMaps = getWeakMaps();
internal.emptyStringSymbols = getEmptyStringSymbols();
internal.globals = getGlobals();

const commonJsVars = new Map();
internal.commonJsVars = commonJsVars;

// Exports

// Capture `module` + `require` from file + return tracker
module.exports = (path, module, require) => {
	commonJsVars.set(module, {name: 'module', path});
	commonJsVars.set(require, {name: 'require', path});
	return tracker;
};
