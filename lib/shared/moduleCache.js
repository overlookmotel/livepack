/* --------------------
 * livepack module
 * Module cache management
 * ------------------*/

'use strict';

// Modules
const BuiltinModule = require('module');

// Guard against poorly mocked module constructors.
// This code copied from `pirates`.
// https://github.com/ariporad/pirates/blob/5223d20e54f724780eb73d4d4918f70004d9d8dc/src/index.js#L7
const Module = module.constructor.length > 1 ? module.constructor : BuiltinModule;

// Exports

module.exports = {
	useInternalModuleCache,
	usingInternalModuleCache,
	exposeModule,
	exposeModules,
	Module
};

const globalModuleCache = Module._cache,
	internalModuleCache = Object.create(null);

/**
 * Substitute Node's module cache for sandboxed internal cache.
 * Returns function to revert change.
 *
 * @returns {Function} - Revert function
 */
function useInternalModuleCache() {
	Module._cache = internalModuleCache;

	return () => {
		Module._cache = globalModuleCache;
	};
}

/**
 * Determine if currently using internal module cache.
 * @returns {boolean} - `true` if currently using internal cache
 */
function usingInternalModuleCache() {
	return Module._cache === internalModuleCache;
}

/**
 * Expose module loaded into internal module cache in global module cache.
 * @param {string} path - Absolute path to module
 * @returns {undefined}
 */
function exposeModule(path) {
	globalModuleCache[path] = internalModuleCache[path];
}

/**
 * Expose modules loaded into internal module cache in global module cache.
 * `shouldBeExposed()` will be called with path of every module in internal cache.
 * If it returns `true`, module will be added to global module cache.
 *
 * @param {Function} shouldBeExposed - Function to determine if module should be exposed
 * @returns {undefined}
 */
function exposeModules(shouldBeExposed) {
	for (const path in internalModuleCache) {
		if (shouldBeExposed(path)) exposeModule(path);
	}
}
