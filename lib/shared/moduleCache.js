/* --------------------
 * livepack module
 * Module cache management
 * ------------------*/

'use strict';

// Modules
const Module = require('module');

// Exports

module.exports = {
	useInternalModuleCache,
	usingInternalModuleCache,
	exposeModule,
	exposeModules,
	deleteInternalModule
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

/**
 * Delete module from internal module cache.
 * @param {string} path - Absolute path to module
 * @returns {undefined}
 */
function deleteInternalModule(path) {
	delete internalModuleCache[path];
}
