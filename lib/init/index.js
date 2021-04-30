/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind`, `WeakMap`, `WeakSet`, `Symbol`.
 * ------------------*/

'use strict';

// Imports
const tracker = require('../tracker.js');

// Imports
const internal = require('../internal.js'),
	{COMMON_JS} = require('../shared/constants.js');

// Exports

// Capture `module` + `require` from file + return tracker
const {globals} = internal;
module.exports = (path, module, require) => {
	globals.set(module, {type: COMMON_JS, parent: path, key: 'module'});
	globals.set(require, {type: COMMON_JS, parent: path, key: 'require'});
	return tracker;
};

// Imports
// These imports are after export to avoid circular requires in Jest tests
const getFunctions = require('./functions.js'),
	{getWeakSets, getWeakMaps} = require('./weak.js'),
	populateGlobals = require('./globals.js');

// Init internal vars
internal.functions = getFunctions();
internal.weakSets = getWeakSets();
internal.weakMaps = getWeakMaps();
populateGlobals(globals);
