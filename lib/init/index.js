/* --------------------
 * livepack module
 * Init.
 * Catalog globals + built-in modules.
 * Shim `Function.prototype.bind`, `WeakMap`, `WeakSet`, `Symbol`.
 * ------------------*/

'use strict';

// Modules
const {builtinModules} = require('module');

// Imports
const getScopeId = require('./getScopeId.js'),
	addEvalFunctionsToTracker = require('./eval.js'),
	internal = require('../shared/internal.js'),
	{tracker} = require('../shared/tracker.js'),
	{COMMON_JS_MODULE} = require('../shared/constants.js');

// Exports

const {globals, functions: specialFunctions} = internal,
	builtinModulesUncatalogued = new Set(builtinModules);

/**
 * Capture `module` + `require` from file + return tracker and `getScopeId` functions.
 * Livepack exposes 2 functions to be used in code instrumentation:
 *   - `livepack_tracker` is a different function in each file.
 *   - `livepack_getScopeId` is universal across all files
 * Additional methods and properties which are specific to each file are attached to `livepack_tracker`.
 * Additional methods which are universal are attached to `livepack_getScopeId`.
 *
 * @param {string} filename - File path
 * @param {Object} module - `module` object from file
 * @param {Function} require - `require` function from file
 * @param {number} nextBlockId - Next block ID
 * @param {number} prefixNum - Internal vars prefix num
 * @returns {Array<Function>} - Array containing tracker and `getScopeId` functions
 */
module.exports = (filename, module, require, nextBlockId, prefixNum) => {
	// Record `module`
	globals.set(module, {type: COMMON_JS_MODULE, parent: null, key: 'module'});

	// Create local tracker function with additional properties and methods specific to the file
	const localTracker = (getFnInfo, getScopes) => tracker(getFnInfo, getScopes);
	localTracker.nextBlockId = nextBlockId;
	localTracker.prefixNum = prefixNum;
	addEvalFunctionsToTracker(localTracker, filename);

	// Wrap `require` to catalog NodeJS native modules when loaded
	require = createWrappedRequire(require);

	// Return tracker and `getScopeId` functions
	return [localTracker, getScopeId, require];
};

// Imports
// These imports are after export to avoid circular requires in Jest tests
const captureFunctions = require('./functions.js'),
	{getWeakSets, getWeakMaps} = require('./weak.js'),
	{populateGlobals, catalogBuiltInModule} = require('./globals.js');

// Init internal vars
captureFunctions(specialFunctions);
internal.weakSets = getWeakSets();
internal.weakMaps = getWeakMaps();
populateGlobals(globals);

/**
 * Wrap `require` function
 * @param {Function} require - `require` function created by NodeJS
 * @param {string} filename - Path to file require is for
 * @returns {Function} - Wrapped `require` function
 */
function createWrappedRequire(require, filename) {
	// Wrap `require`
	const wrappedRequire = function(path) {
		return execRequire(require, path);
	};
	Object.defineProperties(wrappedRequire, Object.getOwnPropertyDescriptors(require));

	// Record `require`
	specialFunctions.set(require, {type: 'require', path: filename});

	// Return wrapped `require`
	return wrappedRequire;
}

// Patches to built-in modules
const modifyBuiltins = {
	__proto__: null,

	util(util) {
		// Modify `util.promisify()` to record promisified functions
		const promisifyOriginal = util.promisify,
			{custom} = promisifyOriginal;
		function promisify(original) {
			const promisifiedFn = promisifyOriginal(original);
			// Don't record if has custom promisified function defined using `custom` symbol.
			// `util.promisify` doesn't create function internally in that case.
			// NB No need to check `original` is truthy or that `original[custom]` is function,
			// as `util.promisify` will have thrown already in these cases.
			if (!original[custom]) specialFunctions.set(promisifiedFn, {type: 'promisify', fn: original});
			return promisifiedFn;
		}
		promisify.custom = custom;
		util.promisify = promisify;

		// Modify `util.debuglog()` to record debuglog functions
		const debuglogOriginal = util.debuglog;
		util.debuglog = function debuglog(set, cb) {
			const res = debuglogOriginal.call(this, set, cb);
			specialFunctions.set(res, {type: 'debuglog', set, cb});
			return res;
		};
	}
};

function execRequire(require, path) {
	const exports = require(path); // eslint-disable-line import/no-dynamic-require

	if (path.slice(0, 5) === 'node:') path = path.slice(5);
	if (builtinModulesUncatalogued.has(path)) {
		builtinModulesUncatalogued.delete(path);

		const modifyBuiltin = modifyBuiltins[path];
		if (modifyBuiltin) modifyBuiltin(exports);

		catalogBuiltInModule(path, exports, globals);
	}

	return exports;
}
