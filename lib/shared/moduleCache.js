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
	useGlobalModuleCache,
	usingInternalModuleCache,
	exposeModule,
	exposeModuleInternal,
	Module,
	cache: Module._cache
};

const globalModuleCache = Module._cache,
	internalModuleCache = Object.create(null);

// Expose this module in internal module cache
exposeModuleInternal(__filename);

/**
 * Substitute Node's module cache for sandboxed internal cache.
 * @returns {undefined}
 */
function useInternalModuleCache() {
	Module._cache = internalModuleCache;
}

/**
 * Restore Node's global module cache.
 * @returns {undefined}
 */
function useGlobalModuleCache() {
	Module._cache = globalModuleCache;
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
 * Expose module loaded into global module cache in internal module cache.
 * @param {string} path - Absolute path to module
 * @returns {undefined}
 */
function exposeModuleInternal(path) {
	internalModuleCache[path] = globalModuleCache[path];
}
