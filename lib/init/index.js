/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind`, `WeakMap`, `WeakSet`, `Symbol`.
 * ------------------*/

'use strict';

// Modules
const {isFunction} = require('is-it-type');

// Imports
const {tracker} = require('../shared/tracker.js'),
	getScopeId = require('./getScopeId.js'),
	{createEsmObjCommonJs, createEsmObjEsm} = require('./esm.js');

// Imports
const internal = require('../shared/internal.js'),
	{COMMON_JS, IMPORT_META} = require('../shared/constants.js');

// Exports

// Capture from file `module` + `require` (if CommonJS), or `import.meta` (if ESM)
// and return tracker, getScopeId and esm functions
const {globals, esmAliases} = internal;

module.exports = function init(path, moduleOrImportMeta, requireOrAliases) {
	return isFunction(requireOrAliases)
		? initCommonJs(path, moduleOrImportMeta, requireOrAliases)
		: initEsm(moduleOrImportMeta, requireOrAliases);
};

function initCommonJs(path, module, require) {
	globals.set(module, {type: COMMON_JS, parent: path, key: 'module'});
	globals.set(require, {type: COMMON_JS, parent: path, key: 'require'});
	return [tracker, getScopeId, createEsmObjCommonJs(path)];
}

function initEsm(importMeta, aliasesArr) {
	const {url, resolve} = importMeta;
	globals.set(importMeta, {type: IMPORT_META, parent: url, key: 'meta'});
	if (resolve) globals.set(resolve, {type: IMPORT_META, parent: url, key: 'resolve'});

	if (aliasesArr) {
		const aliases = Object.create(null);
		for (const [name, targetName, targetUrl] of aliasesArr) {
			if (name === '*') {
				(aliases['*'] || (aliases['*'] = [])).push(targetUrl);
			} else {
				aliases[name] = {url: targetUrl || url, name: targetName, isResolved: !targetUrl};
			}
		}
		esmAliases[url] = aliases;
	}

	return [tracker, getScopeId, createEsmObjEsm(importMeta)];
}

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
